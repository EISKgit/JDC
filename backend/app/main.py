import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import check_security, get_settings
from app.core.middleware import BodySizeLimitMiddleware, SecurityHeadersMiddleware
from app.core.observability import UnhandledErrorMiddleware, configure_logging
from app.db.migrate import run_migrations
from app.db.session import engine

logger = logging.getLogger("app")

settings = get_settings()
configure_logging(settings.log_level)
# Fail fast, before serving anything, if the config is unsafe outside development.
for warning in check_security(settings):
    logger.warning(warning)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    run_migrations(engine)
    yield


# The interactive API docs list every endpoint and schema: handy locally, but no
# reason to publish that map of the API in production.
_docs = settings.is_development
app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
    docs_url="/docs" if _docs else None,
    redoc_url="/redoc" if _docs else None,
    openapi_url="/openapi.json" if _docs else None,
)

# Middleware runs outermost-last-added: security headers wrap everything (even
# errors and CORS preflights), and CORS wraps the size limit so a 413 still carries
# CORS headers and the browser can show the real error.
app.add_middleware(UnhandledErrorMiddleware)
app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_request_bytes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Browsers hide other response headers from cross-origin JavaScript: the export
    # needs its filename, and rate-limited clients need to know how long to wait.
    expose_headers=["Content-Disposition", "Retry-After"],
)
app.add_middleware(SecurityHeadersMiddleware, https_only=not settings.is_development)

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/health")
def health() -> JSONResponse:
    """Liveness + readiness: also checks the database, so a load balancer or Docker
    stops sending traffic to an instance whose database is unreachable."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Health check: database unreachable")
        return JSONResponse({"status": "error", "database": "unreachable"}, status_code=503)
    return JSONResponse({"status": "ok", "database": "ok"})
