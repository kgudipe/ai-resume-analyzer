from __future__ import annotations

import numpy as np
import chromadb
import structlog
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import OwnerType, Vector

log = structlog.get_logger(__name__)


class EmbeddingService:
    """
    Owns the embedding model + the Chroma collection.

    SQLite (`vectors` table) is the durable source of truth. Chroma's client
    here is in-memory (`chromadb.Client()`), which is wiped on every process
    restart — by design, since Render's disk is ephemeral anyway. We rebuild
    it from SQLite once on startup via `rebuild_from_db`.
    """

    def __init__(self) -> None:
        self._backend = "uninitialised"
        self._model = self._load_model()
        self._client = chromadb.Client()
        self._collection = self._client.get_or_create_collection(
            name="chunks", metadata={"hnsw:space": "cosine"}
        )
        log.info(
            "embedding_service.ready",
            backend=self._backend,
            model=settings.embed_model,
            dim=settings.embed_dim,
        )

    def _load_model(self):
        """
        Production (Render 512MB): fastembed — ONNX runtime, no torch,
        ~5x lighter RAM footprint.
        Local dev: sentence-transformers — easier to debug, fine on a laptop.
        """
        if settings.is_production:
            from fastembed import TextEmbedding

            self._backend = "fastembed"
            return TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        else:
            from sentence_transformers import SentenceTransformer

            self._backend = "sentence-transformers"
            return SentenceTransformer(settings.embed_model)

    def embed(self, texts: list[str]) -> np.ndarray:
        """Return float32 normalised vectors, shape (len(texts), embed_dim)."""
        if not texts:
            return np.zeros((0, settings.embed_dim), dtype=np.float32)

        if self._backend == "fastembed":
            # fastembed returns a generator of np arrays already L2-normalised
            vecs = list(self._model.embed(texts))
            return np.asarray(vecs, dtype=np.float32)
        else:
            vecs = self._model.encode(
                texts, normalize_embeddings=True, show_progress_bar=False
            )
            return np.asarray(vecs, dtype=np.float32)

    # ── Indexing ──────────────────────────────────────────────────────────

    def index_chunks(
        self,
        db: Session,
        owner_type: OwnerType,
        owner_id: str,
        chunks: list[str],
    ) -> int:
        """Embed chunks, persist to SQLite (`vectors`), and add to live Chroma."""
        if not chunks:
            return 0

        vectors = self.embed(chunks)
        ids, docs, metadatas, embeds = [], [], [], []

        for i, (text, vec) in enumerate(zip(chunks, vectors)):
            row = Vector(
                owner_type=owner_type,
                owner_id=owner_id,
                chunk_index=i,
                chunk_text=text,
                embedding=vec.tobytes(),
                dim=settings.embed_dim,
            )
            db.add(row)
            ids.append(f"{owner_id}:{i}")
            docs.append(text)
            metadatas.append({"owner_type": owner_type.value, "owner_id": owner_id})
            embeds.append(vec.tolist())

        db.commit()
        self._collection.add(
            ids=ids, documents=docs, metadatas=metadatas, embeddings=embeds
        )
        log.info(
            "chunks.indexed",
            owner_type=owner_type.value,
            owner_id=owner_id,
            n=len(chunks),
        )
        return len(chunks)

    # ── Retrieval ─────────────────────────────────────────────────────────

    def retrieve(self, query: str, owner_id: str, top_k: int = 5) -> list[str]:
        """Top-k most relevant chunks for a given owner (e.g. one candidate)."""
        q_vec = self.embed([query])[0].tolist()
        res = self._collection.query(
            query_embeddings=[q_vec],
            n_results=top_k,
            where={"owner_id": owner_id},
        )
        docs = res.get("documents", [[]])[0]
        log.info("chunks.retrieved", owner_id=owner_id, k=len(docs))
        return docs

    # ── Startup rebuild ───────────────────────────────────────────────────

    def rebuild_from_db(self, db: Session) -> int:
        """
        Call once on app startup. Chroma's in-process index is empty on a
        fresh boot (or after a Render restart); this repopulates it from the
        durable `vectors` table so retrieval works immediately.
        """
        rows = db.query(Vector).all()
        if not rows:
            log.info("chroma.rebuilt", n=0)
            return 0

        ids, docs, metas, embeds = [], [], [], []
        for r in rows:
            vec = np.frombuffer(r.embedding, dtype=np.float32)
            ids.append(f"{r.owner_id}:{r.chunk_index}")
            docs.append(r.chunk_text)
            metas.append({"owner_type": r.owner_type.value, "owner_id": r.owner_id})
            embeds.append(vec.tolist())

        # Chroma's add() caps batch size in some versions — chunk defensively
        BATCH = 500
        for i in range(0, len(ids), BATCH):
            self._collection.add(
                ids=ids[i : i + BATCH],
                documents=docs[i : i + BATCH],
                metadatas=metas[i : i + BATCH],
                embeddings=embeds[i : i + BATCH],
            )
        log.info("chroma.rebuilt", n=len(rows))
        return len(rows)