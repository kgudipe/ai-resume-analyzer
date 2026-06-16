from __future__ import annotations


class AppError(Exception):
    """Base class for errors that map to a specific HTTP status + code."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class NoChunksIndexedError(AppError):
    status_code = 422
    code = "no_resume_chunks_indexed"


class ScoringFailedError(AppError):
    status_code = 503
    code = "scoring_failed"


class UpstreamRateLimitedError(AppError):
    status_code = 429
    code = "rate_limited"