from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Candidate, Job, Score, ScoreStatus
from app.db.session import get_db
from app.schemas import RankedCandidate, RankResponse
from app.services.errors import NotFoundError

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/api/jobs", tags=["rank"])


@router.get("/{job_id}/rank", response_model=RankResponse)
def rank_candidates(
    job_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> RankResponse:
    job = db.get(Job, job_id)
    if not job:
        raise NotFoundError("job_not_found")

    # One COMPLETE score per candidate, most recent if a candidate was
    # re-scored. The ix_scores_job_overall index keeps this fast.
    stmt = (
        select(Score, Candidate)
        .join(Candidate, Candidate.id == Score.candidate_id)
        .where(Score.job_id == job_id, Score.status == ScoreStatus.COMPLETE)
        .order_by(Score.overall.desc(), Score.created_at.desc())
    )
    rows = db.execute(stmt).all()

    # Dedup to latest score per candidate while preserving overall-desc order
    seen: set[str] = set()
    ranked: list[RankedCandidate] = []
    rank = 0
    for score, candidate in rows:
        if candidate.id in seen:
            continue
        seen.add(candidate.id)
        rank += 1
        ranked.append(
            RankedCandidate(
                candidate_id=candidate.id,
                name=candidate.name,
                overall=score.overall,
                summary=(score.evidence or {}).get("summary"),
                rank=rank,
            )
        )
        if len(ranked) >= limit:
            break

    return RankResponse(job_id=job_id, total=len(ranked), candidates=ranked)