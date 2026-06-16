from __future__ import annotations

import structlog
from fastapi import Request

from app.services.embeddings import EmbeddingService
from app.services.scorer import FallbackScorer, GroqScorer, Scorer

log = structlog.get_logger(__name__)


def get_embedding_service(request: Request) -> EmbeddingService:
    """
    Returns the single EmbeddingService instance created at app startup
    (see main.py lifespan). Avoids reloading the model on every request.
    """
    return request.app.state.embedder


def get_scorer(choice: str = "groq") -> Scorer:
    """
    Resolves a scorer by name. "groq" -> primary 70B model (1,000 RPD cap).
    "fallback" -> 8B instant model (14,400 RPD) for high-volume batches.
    "custom" raises for now — Phase 2 will register a CustomModelScorer here
    and this becomes a real branch instead of a NotImplementedError.

    NOTE: instantiated fresh per call rather than cached on app.state, since
    GroqScorer holds no expensive state (just a lightweight HTTP client) —
    unlike EmbeddingService, which owns the loaded model.
    """
    if choice == "groq":
        return GroqScorer()
    elif choice == "fallback":
        return FallbackScorer()
    elif choice == "custom":
        raise NotImplementedError(
            "Custom QLoRA scorer not yet wired — see Phase 2, Day 12."
        )
    else:
        raise ValueError(f"Unknown scorer choice: {choice}")