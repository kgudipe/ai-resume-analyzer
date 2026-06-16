from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.db.session import SessionLocal, init_db
from app.logging_config import configure_logging
from app.routers import jobs, upload
from app.services.embeddings import EmbeddingService

configure_logging(is_production=settings.is_production)
log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("startup.begin", environment=settings.environment)
    init_db()
    log.info("startup.db_ready")

    # Build the embedder once (loads the model — can take a few seconds)
    embedder = EmbeddingService()
    app.state.embedder = embedder

    # Rebuild Chroma's in-memory index from SQLite's durable `vectors` table.
    # Required because Chroma here is a process-local cache, not persisted disk.
    db = SessionLocal()
    try:
        n = embedder.rebuild_from_db(db)
        log.info("startup.chroma_rebuilt", vectors=n)
    finally:
        db.close()

    yield
    log.info("shutdown")


app = FastAPI(
    title="Resume Intelligence Platform",
    version="0.3.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

origins = (
    ["*"] if not settings.is_production else ["https://your-frontend.vercel.app"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    req_id = str(uuid.uuid4())[:8]
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=req_id)
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
    response.headers["X-Request-Id"] = req_id
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    req_id = structlog.contextvars.get_contextvars().get("request_id", "?")
    log.error("unhandled_exception", exc=str(exc), path=request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "code": "internal_error",
            "request_id": req_id,
        },
    )


@app.get("/health", tags=["ops"])
async def health(request: Request):
    embedder_ready = hasattr(request.app.state, "embedder")
    return {
        "status": "ok",
        "environment": settings.environment,
        "version": "0.3.0",
        "embedder_ready": embedder_ready,
    }


app.include_router(jobs.router)
app.include_router(upload.router)