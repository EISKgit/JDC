from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings

router = APIRouter(tags=["meta"])

_AI_VENDORS = {"groq": "Groq", "openai": "OpenAI"}


class AIInfo(BaseModel):
    # Whether journal text is sent to an outside AI service, and which one. Shown to
    # users as a privacy notice (sign-up, Life Profile, Ask JDC, Account).
    external: bool
    vendor: str | None


class PublicConfig(BaseModel):
    google_sign_in: bool
    ai: AIInfo


@router.get("/config", response_model=PublicConfig)
def public_config() -> PublicConfig:
    """Public, non-secret facts the UI needs before anyone logs in."""
    settings = get_settings()
    vendor = _AI_VENDORS.get(settings.ai_provider)
    return PublicConfig(
        google_sign_in=bool(settings.google_client_id),
        ai=AIInfo(external=vendor is not None, vendor=vendor),
    )
