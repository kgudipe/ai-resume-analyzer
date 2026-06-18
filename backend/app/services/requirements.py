from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.schemas import JobRequirements


_SKILL_ALIASES: dict[str, tuple[str, ...]] = {
    # Languages
    "Python": ("python",),
    "Java": ("java",),
    "JavaScript": ("javascript", "js"),
    "TypeScript": ("typescript", "ts"),
    "Go": ("golang", "go lang"),  # bare "go" is too noisy; require explicit forms
    "Rust": ("rust",),
    "C++": ("c++", "cpp"),
    "C#": ("c#", "c sharp", ".net", "dotnet"),
    "Ruby": ("ruby",),
    "PHP": ("php",),
    "Scala": ("scala",),
    "Kotlin": ("kotlin",),
    "Swift": ("swift",),
    "R": ("r language", "rstats"),
    # Frontend
    "React": ("react", "react.js", "reactjs"),
    "Vue": ("vue", "vue.js", "vuejs"),
    "Angular": ("angular", "angular.js", "angularjs"),
    "Svelte": ("svelte",),
    "Next.js": ("next.js", "nextjs"),
    "Tailwind": ("tailwind", "tailwindcss"),
    "HTML/CSS": ("html", "css"),
    # Backend frameworks
    "Node.js": ("node.js", "nodejs", "node"),
    "FastAPI": ("fastapi",),
    "Django": ("django",),
    "Flask": ("flask",),
    "Spring": ("spring", "spring boot", "springboot"),
    "Rails": ("rails", "ruby on rails"),
    "Express": ("express", "express.js", "expressjs"),
    # Data stores
    "SQL": ("sql",),
    "PostgreSQL": ("postgresql", "postgres"),
    "MySQL": ("mysql",),
    "SQLite": ("sqlite",),
    "MongoDB": ("mongodb", "mongo"),
    "Redis": ("redis",),
    "DynamoDB": ("dynamodb",),
    "Cassandra": ("cassandra",),
    "Snowflake": ("snowflake",),
    # Cloud / infra
    "AWS": ("aws", "amazon web services"),
    "Azure": ("azure",),
    "GCP": ("gcp", "google cloud"),
    "Docker": ("docker",),
    "Kubernetes": ("kubernetes", "k8s"),
    "Terraform": ("terraform",),
    "Ansible": ("ansible",),
    "Jenkins": ("jenkins",),
    "CI/CD": ("ci/cd", "cicd", "continuous integration", "continuous deployment"),
    "Prometheus": ("prometheus",),
    "Grafana": ("grafana",),
    # APIs / messaging
    "Git": ("git", "github", "gitlab"),
    "REST APIs": ("rest", "rest api", "restful"),
    "GraphQL": ("graphql",),
    "gRPC": ("grpc",),
    "Microservices": ("microservices", "microservice"),
    "Kafka": ("kafka", "apache kafka"),
    "RabbitMQ": ("rabbitmq",),
    "Elasticsearch": ("elasticsearch", "elastic search"),
    # Data / ML
    "Machine Learning": ("machine learning", "ml"),
    "Deep Learning": ("deep learning",),
    "NLP": ("nlp", "natural language processing"),
    "LLMs": ("llm", "llms", "large language model", "large language models"),
    "PyTorch": ("pytorch",),
    "TensorFlow": ("tensorflow",),
    "Pandas": ("pandas",),
    "NumPy": ("numpy",),
    "Spark": ("spark", "apache spark"),
    "Airflow": ("airflow", "apache airflow"),
    "dbt": ("dbt",),
    "Tableau": ("tableau",),
    "Power BI": ("power bi", "powerbi"),
    # Practices / platforms
    "Linux": ("linux", "unix"),
    "Agile": ("agile", "scrum"),
    "Testing": ("testing", "unit tests", "pytest", "jest"),
}

# Required skills dominate the score; preferred skills are a lighter signal.
_REQUIRED_WEIGHT = 1.0
_PREFERRED_WEIGHT = 0.4


@dataclass
class SkillMatch:
    """Deterministic skill comparison between a job's requirements and a resume."""

    matched: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    # Weighted fraction (0..1) of required+preferred skills found in the resume.
    coverage: float = 0.0
    # True when the JD yielded at least one known skill, i.e. coverage is meaningful.
    assessable: bool = False

_PREFERRED_TERMS = (
    "preferred",
    "nice to have",
    "nice-to-have",
    "bonus",
    "plus",
    "desired",
)
_REQUIRED_TERMS = ("required", "must", "need", "needs", "proficiency", "experience with")


def extract_job_requirements(jd_text: str) -> JobRequirements:
    """Extract a stable, deterministic requirements object from a job description."""
    required: list[str] = []
    preferred: list[str] = []
    keywords: list[str] = []

    for skill in _skills_in_text(jd_text):
        bucket = preferred if _skill_is_preferred(jd_text, skill) else required
        _append_unique(bucket, skill)
        _append_unique(keywords, skill)

    responsibilities = _extract_responsibilities(jd_text)
    return JobRequirements(
        required_skills=required,
        preferred_skills=[skill for skill in preferred if skill not in required],
        experience_years=_extract_experience_years(jd_text),
        responsibilities=responsibilities,
        keywords=keywords,
    )


def compare_requirements(
    requirements: JobRequirements | dict | None,
    resume_chunks: list[str],
) -> SkillMatch:
    """
    Compare saved job requirements against a resume, deterministically.

    Returns a weighted `coverage` (required skills count more than preferred)
    alongside the matched/missing lists, so the caller can ground the headline
    score in the same signal the user sees — rather than leaving the number
    and the skill lists to disagree.

    `missing` lists only *required* skills: absent nice-to-haves shouldn't be
    surfaced as gaps. `matched` is ordered required-first for display.
    """
    req = _coerce_requirements(requirements)
    resume_text = "\n".join(resume_chunks)

    required: list[str] = []
    for skill in req.required_skills:
        _append_unique(required, skill)
    preferred: list[str] = []
    for skill in req.preferred_skills:
        if skill not in required:
            _append_unique(preferred, skill)

    matched_required = [s for s in required if _contains_skill(resume_text, s)]
    matched_preferred = [s for s in preferred if _contains_skill(resume_text, s)]
    missing_required = [s for s in required if s not in matched_required]

    weighted_have = (
        _REQUIRED_WEIGHT * len(matched_required)
        + _PREFERRED_WEIGHT * len(matched_preferred)
    )
    weighted_total = (
        _REQUIRED_WEIGHT * len(required) + _PREFERRED_WEIGHT * len(preferred)
    )
    coverage = weighted_have / weighted_total if weighted_total else 0.0

    return SkillMatch(
        matched=[*matched_required, *matched_preferred],
        missing=missing_required,
        coverage=coverage,
        assessable=weighted_total > 0,
    )


def _coerce_requirements(requirements: JobRequirements | dict | None) -> JobRequirements:
    if isinstance(requirements, JobRequirements):
        return requirements
    if isinstance(requirements, dict):
        return JobRequirements.model_validate(requirements)
    return JobRequirements()


def _skills_in_text(text: str) -> list[str]:
    return [skill for skill in _SKILL_ALIASES if _contains_skill(text, skill)]


def _contains_skill(text: str, skill: str) -> bool:
    lowered = text.lower()
    aliases = _SKILL_ALIASES.get(skill, (skill,))
    return any(_contains_phrase(lowered, alias.lower()) for alias in aliases)


def _contains_phrase(lowered_text: str, phrase: str) -> bool:
    if re.search(r"[+#./]", phrase):
        return phrase in lowered_text
    return re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", lowered_text) is not None


def _skill_is_preferred(jd_text: str, skill: str) -> bool:
    lines = re.split(r"[\n.;]", jd_text)
    for line in lines:
        lowered = line.lower()
        if not _contains_skill(line, skill):
            continue
        if any(term in lowered for term in _PREFERRED_TERMS):
            return True
        if any(term in lowered for term in _REQUIRED_TERMS):
            return False
    return False


def _extract_experience_years(text: str) -> int | None:
    matches = re.findall(r"(\d+)\+?\s*(?:years|yrs)", text.lower())
    if not matches:
        return None
    return min(int(match) for match in matches)


def _extract_responsibilities(text: str) -> list[str]:
    responsibilities: list[str] = []
    for raw in text.splitlines():
        line = raw.strip(" \t-*•")
        if len(line) < 25:
            continue
        lowered = line.lower()
        if any(term in lowered for term in ("responsib", "build", "develop", "design", "maintain", "lead")):
            _append_unique(responsibilities, line[:240])
        if len(responsibilities) >= 8:
            break
    return responsibilities


def _append_unique(values: list[str], value: str) -> None:
    if value not in values:
        values.append(value)
