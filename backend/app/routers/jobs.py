from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.models import Job, OwnerType
from app.db.session import get_db
from app.dependencies import get_embedding_service
from app.schemas import JobCreate, JobOut
from app.services.embeddings import EmbeddingService
from app.services.parser import chunk_text

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("", response_model=JobOut, status_code=201)
async def create_job(
    payload: JobCreate,
    db: Session = Depends(get_db),
    embedder: EmbeddingService = Depends(get_embedding_service),
) -> JobOut:
    """
    Persist a new job description and index its chunks for retrieval.
    Day 4 will add: Groq call to extract structured requirements.
    """
    job = Job(title=payload.title, description=payload.description)
    db.add(job)
    db.commit()
    db.refresh(job)

    chunks = chunk_text(payload.description)

    from starlette.concurrency import run_in_threadpool

    n_indexed = await run_in_threadpool(
        embedder.index_chunks,
        db=db,
        owner_type=OwnerType.JOB,
        owner_id=job.id,
        chunks=chunks,
    )

    log.info("job.created", job_id=job.id, title=job.title, chunks=n_indexed)
    return JobOut.model_validate(job)


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: str, db: Session = Depends(get_db)) -> JobOut:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_not_found")
    return JobOut.model_validate(job)


@router.get("", response_model=list[JobOut])
def list_jobs(db: Session = Depends(get_db)) -> list[JobOut]:
    jobs = db.query(Job).order_by(Job.created_at.desc()).limit(50).all()
    return [JobOut.model_validate(j) for j in jobs]