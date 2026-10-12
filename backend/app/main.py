import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import check_security, get_settings
from app.db.migrate import run_migrations
from app.db.session import engine

logger = logging.getLogger("app")

settings = get_settings()
# Fail fast, before serving anything, if the config is unsafe outside development.
for warning in check_security(settings):
    logger.warning(warning)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    run_migrations(engine)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

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

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
