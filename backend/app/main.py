from __future__ import annotations

import time
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.db.session import init_db
from app.logging_config import configure_logging

configure_logging(is_production=settings.is_production)
log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init DB tables. Shutdown: nothing to clean up."""
    log.info("startup.begin", environment=settings.environment)
    init_db()
    log.info("startup.db_ready")
    # NOTE: Day 3 will add EmbeddingService init + Chroma rebuild here
    yield
    log.info("shutdown")


app = FastAPI(
    title="Resume Intelligence Platform",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS — in production, lock this to your Vercel/Render frontend URL
origins = (
    ["*"]
    if not settings.is_production
    else [
        "https://your-frontend.vercel.app",  # TODO: update before deploying
    ]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request-id + timing middleware ──────────────────────────────────────────
@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    import uuid

    request_id = str(uuid.uuid4())[:8]
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)

    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = round((time.perf_counter() - start) * 1000, 1)

    log.info(
        "http.request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        elapsed_ms=elapsed_ms,
    )
    response.headers["X-Request-Id"] = request_id
    return response


# ── Global exception handler ─────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = structlog.contextvars.get_contextvars().get("request_id", "?")
    log.error("unhandled_exception", exc=str(exc), path=request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "code": "internal_error",
            "request_id": request_id,
        },
    )


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["ops"])
async def health():
    """
    Liveness endpoint — also the UptimeRobot keep-alive target.
    Returns the environment so you can confirm prod vs dev at a glance.
    """
    return {"status": "ok", "environment": settings.environment, "version": "0.1.0"}
