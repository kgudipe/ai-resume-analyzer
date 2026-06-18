from __future__ import annotations

import asyncio
import json
from typing import Protocol

import structlog
from groq import APIError, AsyncGroq, RateLimitError
from pydantic import ValidationError

from app.config import settings
from app.schemas import ScorePayload

log = structlog.get_logger(__name__)


# ── Pluggable interface ────────────────────────────────────────────────────
# Phase 2's CustomModelScorer implements this exact same shape, so the
# `/api/score` route never needs to know which one it's talking to.
class Scorer(Protocol):
    async def score(
        self,
        jd_text: str,
        resume_chunks: list[str],
        requirements: dict | None = None,
        skill_match: dict | None = None,
    ) -> ScorePayload: ...


_SYSTEM_PROMPT = """You are an expert technical recruiter scoring how well a candidate \
matches a job. You MUST respond with a single JSON object and nothing else. \
Do not include markdown fences or commentary. The JSON MUST match this schema exactly:
{
  "overall": <number 0-100>,
  "dimensions": [
    {"name": "<string>", "score": <number 0-100>, "reasoning": "<string, <600 chars>"}
  ],
  "summary": "<string, <1500 chars>",
  "matched_skills": ["<string>", ...],
  "missing_skills": ["<string>", ...]
}
Score conservatively and ground every claim in the provided text. Use 3-6 dimensions \
such as required_skills, preferred_skills, experience, education, domain_fit.
If STRUCTURED REQUIREMENTS and DETERMINISTIC SKILL MATCH are provided, use those exact \
matched_skills and missing_skills values in your JSON. Do not invent extra skills."""


def _build_user_prompt(
    jd_text: str,
    resume_chunks: list[str],
    requirements: dict | None = None,
    skill_match: dict | None = None,
) -> str:
    joined = "\n---\n".join(resume_chunks)
    requirements_json = json.dumps(requirements or {}, indent=2, sort_keys=True)
    skill_match_json = json.dumps(skill_match or {}, indent=2, sort_keys=True)
    return (
        f"JOB DESCRIPTION:\n{jd_text}\n\n"
        f"STRUCTURED REQUIREMENTS:\n{requirements_json}\n\n"
        f"DETERMINISTIC SKILL MATCH:\n{skill_match_json}\n\n"
        f"MOST RELEVANT RESUME EXCERPTS:\n{joined}\n\n"
        f"Return the scoring JSON now. The matched_skills and missing_skills arrays must "
        f"match DETERMINISTIC SKILL MATCH exactly when it is non-empty."
    )


class GroqScorer:
    """
    Wraps Groq's chat completions API with:
      - JSON mode (response_format) so the model can't ramble outside the schema
      - Pydantic validation of the *content* of that JSON (shape, ranges, lengths)
      - retry-with-backoff: rate limits get exponential backoff respecting
        retry_after; schema failures get a corrective follow-up message instead
        of a blind retry, since the same prompt would likely fail again.
    """

    def __init__(
        self,
        model: str | None = None,
        max_retries: int = 4,
    ) -> None:
        self._client = AsyncGroq(api_key=settings.groq_api_key)
        self._model = model or settings.groq_model_primary
        self._max_retries = max_retries

    async def score(
        self,
        jd_text: str,
        resume_chunks: list[str],
        requirements: dict | None = None,
        skill_match: dict | None = None,
    ) -> ScorePayload:
        messages: list[dict] = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": _build_user_prompt(
                    jd_text,
                    resume_chunks,
                    requirements=requirements,
                    skill_match=skill_match,
                ),
            },
        ]
        last_err: Exception | None = None

        for attempt in range(1, self._max_retries + 1):
            try:
                resp = await self._client.chat.completions.create(
                    model=self._model,
                    messages=messages,
                    temperature=0.1,
                    max_tokens=1200,
                    response_format={"type": "json_object"},
                )
                raw = resp.choices[0].message.content

                # This is the line that turns "plausible text" into
                # "trustworthy data" — schema, ranges, and lengths are
                # all enforced before the caller ever sees a ScorePayload.
                payload = ScorePayload.model_validate_json(raw)
                log.info(
                    "groq.score.ok",
                    model=self._model,
                    attempt=attempt,
                    overall=payload.overall,
                )
                return payload

            except RateLimitError as e:
                wait = _retry_after_seconds(e) or min(2**attempt, 30)
                log.warning("groq.rate_limited", attempt=attempt, wait_s=wait)
                last_err = e
                await asyncio.sleep(wait)

            except ValidationError as e:
                # The model returned JSON, but not OUR schema. Retrying the
                # identical prompt would likely fail again, so we append the
                # bad output + a corrective instruction instead of just looping.
                log.warning(
                    "groq.invalid_schema", attempt=attempt, errors=e.error_count()
                )
                messages.append({"role": "assistant", "content": raw})
                messages.append(
                    {
                        "role": "user",
                        "content": f"Your JSON was invalid: {e}. Return corrected JSON only.",
                    }
                )
                last_err = e

            except (APIError, json.JSONDecodeError) as e:
                log.warning("groq.api_error", attempt=attempt, err=str(e))
                last_err = e
                await asyncio.sleep(min(2**attempt, 15))

        log.error("groq.score.exhausted", model=self._model, err=str(last_err))
        raise RuntimeError(
            f"Scoring failed after {self._max_retries} attempts: {last_err}"
        )


def _retry_after_seconds(exc: RateLimitError) -> float | None:
    """
    Groq surfaces the standard `retry-after` header on 429s. The SDK exposes
    response headers via exc.response; fall back to None (→ exponential
    backoff) if the header is missing or the SDK shape changes.
    """
    try:
        headers = exc.response.headers
        val = headers.get("retry-after")
        return float(val) if val is not None else None
    except Exception:
        return None


class FallbackScorer:
    """
    Routes to the fast/high-volume Groq model (llama-3.1-8b-instant,
    14,400 RPD) instead of the primary 70B model (1,000 RPD). Use this
    for bulk/low-stakes scoring passes when you're near the daily cap —
    same Scorer protocol, just a different model string.
    """

    def __init__(self, max_retries: int = 4) -> None:
        self._inner = GroqScorer(
            model=settings.groq_model_fallback, max_retries=max_retries
        )

    async def score(
        self,
        jd_text: str,
        resume_chunks: list[str],
        requirements: dict | None = None,
        skill_match: dict | None = None,
    ) -> ScorePayload:
        return await self._inner.score(
            jd_text,
            resume_chunks,
            requirements=requirements,
            skill_match=skill_match,
        )
