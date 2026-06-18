from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.db.models import Candidate, Job, OwnerType, Score, ScoreStatus
from app.db.session import get_db
from app.dependencies import get_embedding_service, get_scorer
from app.schemas import ScoreRequest, ScoreResponse
from app.services.embeddings import EmbeddingService
from app.services.errors import NoChunksIndexedError, NotFoundError, ScoringFailedError
from app.services.requirements import compare_requirements, extract_job_requirements

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/api", tags=["scoring"])

# model field stored on the Score row, keyed by the client-facing choice
_MODEL_NAMES = {
    "groq": "llama-3.3-70b-versatile",
    "fallback": "llama-3.1-8b-instant",
    "custom": "qlora-llama3.1-8b",
}

# How much the final `overall` leans on the LLM's holistic judgement vs. the
# deterministic skill-coverage ratio. The LLM stays the majority voice (it also
# weighs experience, education, domain fit), but coverage keeps it honest.
# Keyword coverage has more false-negatives than false-positives, so we don't
# let it dominate. Must sum to 1.0.
_LLM_SCORE_WEIGHT = 0.6
_SKILL_SCORE_WEIGHT = 0.4


@router.post("/score", response_model=ScoreResponse)
async def score_candidate(
    req: ScoreRequest,
    db: Session = Depends(get_db),
    embedder: EmbeddingService = Depends(get_embedding_service),
) -> ScoreResponse:
    job = db.get(Job, req.job_id)
    candidate = db.get(Candidate, req.candidate_id)
    if not job:
        raise NotFoundError("job_not_found")
    if not candidate:
        raise NotFoundError("candidate_not_found")

    # Create a PENDING row up front so /scores/{id} can be polled immediately,
    # even before the Groq call returns.
    score_row = Score(
        job_id=job.id,
        candidate_id=candidate.id,
        status=ScoreStatus.PENDING,
        model=_MODEL_NAMES[req.model],
    )
    db.add(score_row)
    db.commit()
    db.refresh(score_row)

    log_bound = log.bind(
        score_id=score_row.id, job_id=job.id, candidate_id=candidate.id
    )

    try:
        # Retrieval is CPU-bound (model inference) — offload to a thread so
        # we don't block the event loop while embedding the query.
        chunks = await run_in_threadpool(
            embedder.retrieve,
            query=job.description,
            owner_id=candidate.id,
            top_k=req.top_k,
        )
        if not chunks:
            raise NoChunksIndexedError(
                "No indexed resume chunks for this candidate. Re-upload the resume."
            )

        requirements = job.requirements or extract_job_requirements(job.description).model_dump()
        if not job.requirements:
            job.requirements = requirements
            db.commit()
        skill = compare_requirements(requirements, chunks)
        skill_match = {
            "matched_skills": skill.matched,
            "missing_skills": skill.missing,
        }

        scorer = get_scorer(req.model)
        payload = await scorer.score(
            job.description,
            chunks,
            requirements=requirements,
            skill_match=skill_match,
        )
        # Ground the headline number in deterministic skill coverage so it can't
        # contradict the matched/missing lists shown next to it. When the JD
        # yields no known skills, we can't measure coverage — trust the LLM fully.
        if skill.assessable:
            grounded = round(
                _LLM_SCORE_WEIGHT * payload.overall
                + _SKILL_SCORE_WEIGHT * skill.coverage * 100,
                1,
            )
            payload = payload.model_copy(
                update={
                    "overall": grounded,
                    "matched_skills": skill.matched,
                    "missing_skills": skill.missing,
                }
            )

        score_row.status = ScoreStatus.COMPLETE
        score_row.overall = payload.overall
        score_row.dimensions = {d.name: d.score for d in payload.dimensions}
        score_row.evidence = {
            "summary": payload.summary,
            "matched": payload.matched_skills,
            "missing": payload.missing_skills,
        }
        score_row.raw_response = payload.model_dump()  # Phase 2 training data
        db.commit()
        log_bound.info("score.complete", overall=payload.overall)

        return ScoreResponse(
            score_id=score_row.id,
            candidate_id=candidate.id,
            status="complete",
            model=score_row.model,
            payload=payload,
        )

    except NoChunksIndexedError:
        score_row.status = ScoreStatus.FAILED
        score_row.error = "no_resume_chunks_indexed"
        db.commit()
        raise

    except Exception as e:
        score_row.status = ScoreStatus.FAILED
        score_row.error = str(e)[:1000]
        db.commit()
        log_bound.error("score.failed", err=str(e))
        raise ScoringFailedError("Scoring failed. You can retry this candidate.") from e


@router.get("/scores/{score_id}", response_model=ScoreResponse)
def get_score(score_id: str, db: Session = Depends(get_db)) -> ScoreResponse:
    """Poll a single score — used by the Processing screen while a score is in flight."""
    score = db.get(Score, score_id)
    if not score:
        raise NotFoundError("score_not_found")

    payload = None
    if score.status == ScoreStatus.COMPLETE:
        payload = {
            "overall": score.overall,
            "dimensions": [
                {"name": k, "score": v, "reasoning": ""}
                for k, v in (score.dimensions or {}).items()
            ],
            "summary": (score.evidence or {}).get("summary", ""),
            "matched_skills": (score.evidence or {}).get("matched", []),
            "missing_skills": (score.evidence or {}).get("missing", []),
        }

    return ScoreResponse(
        score_id=score.id,
        candidate_id=score.candidate_id,
        status=score.status.value,
        model=score.model,
        payload=payload,
        error=score.error,
    )
