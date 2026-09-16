from functools import lru_cache

from app.ai.providers.base import AIProvider
from app.ai.providers.mock import MockProvider
from app.core.config import get_settings


@lru_cache
def get_ai_provider() -> AIProvider:
    settings = get_settings()
    if settings.ai_provider == "openai":
        from app.ai.providers.openai_provider import OpenAIProvider

        return OpenAIProvider(api_key=settings.openai_api_key, model=settings.openai_model)
    return MockProvider()
