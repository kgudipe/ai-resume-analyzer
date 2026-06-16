from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, Path, UploadFile
from sqlalchemy.orm import Session

from app.db.models import Candidate, Job, OwnerType
from app.db.session import get_db
from app.dependencies import get_embedding_service
from app.schemas import UploadResponse
from app.services.embeddings import EmbeddingService
from app.services.parser import chunk_text, extract_text

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/api/jobs", tags=["upload"])

_MAX_FILE_BYTES = 5 * 1024 * 1024
_ALLOWED_EXTENSIONS = {"pdf", "docx", "doc", "txt"}


@router.post("/{job_id}/upload", response_model=UploadResponse, status_code=201)
async def upload_resume(
    job_id: str = Path(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    embedder: EmbeddingService = Depends(get_embedding_service),
) -> UploadResponse:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_not_found")

    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: PDF, DOCX, TXT.",
        )

    content = await file.read()
    if len(content) > _MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content) // 1024} KB). Max 5 MB.",
        )
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        raw_text = extract_text(filename, content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    chunks = chunk_text(raw_text)

    candidate = Candidate(job_id=job_id, filename=filename, raw_text=raw_text)
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    # CPU-bound (model inference) — offload so we don't block the event loop
    from starlette.concurrency import run_in_threadpool

    n_indexed = await run_in_threadpool(
        embedder.index_chunks,
        db=db,
        owner_type=OwnerType.CANDIDATE,
        owner_id=candidate.id,
        chunks=chunks,
    )

    log.info(
        "upload.complete",
        job_id=job_id,
        candidate_id=candidate.id,
        filename=filename,
        chars=len(raw_text),
        chunks=n_indexed,
    )

    return UploadResponse(
        candidate_id=candidate.id,
        job_id=job_id,
        filename=filename,
        chars_extracted=len(raw_text),
        chunks_indexed=n_indexed,
    )