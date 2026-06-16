from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ── Jobs ─────────────────────────────────────────────────────────────────────

class JobCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str = Field(min_length=20, max_length=20_000)

class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    requirements: dict | None = None


# ── Upload ────────────────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    candidate_id: str
    job_id: str
    filename: str
    chars_extracted: int
    chunks_indexed: int


# ── Score ─────────────────────────────────────────────────────────────────────

class ScoreRequest(BaseModel):
    job_id: str
    candidate_id: str
    model: Literal["groq", "fallback", "custom"] = "groq"
    top_k: int = Field(default=5, ge=1, le=20)

class DimensionScore(BaseModel):
    name: str
    score: float = Field(ge=0, le=100)
    reasoning: str = Field(max_length=600)

class ScorePayload(BaseModel):
    overall: float = Field(ge=0, le=100)
    dimensions: list[DimensionScore] = Field(min_length=1, max_length=8)
    summary: str = Field(max_length=1500)
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)

class ScoreResponse(BaseModel):
    score_id: str
    candidate_id: str
    status: Literal["pending", "complete", "failed"]
    model: str
    payload: ScorePayload | None = None
    error: str | None = None


# ── Rank ──────────────────────────────────────────────────────────────────────

class RankedCandidate(BaseModel):
    candidate_id: str
    name: str | None
    overall: float | None
    summary: str | None
    rank: int

class RankResponse(BaseModel):
    job_id: str
    total: int
    candidates: list[RankedCandidate]


# ── Error contract ──────────────────────────────────────────────────────────

class ProblemDetail(BaseModel):
    """RFC-style problem JSON returned by every error path in the app."""
    detail: str
    code: str
    request_id: str