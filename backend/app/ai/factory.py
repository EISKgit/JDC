from functools import lru_cache

from app.ai.providers.base import AIProvider
from app.ai.providers.mock import MockProvider
from app.core.config import get_settings


@lru_cache
def get_ai_provider() -> AIProvider:
    settings = get_settings()
    if settings.ai_provider not in ("openai", "groq"):
        return MockProvider()

    from app.ai.providers.fallback import FallbackProvider
    from app.ai.providers.openai_provider import GROQ_BASE_URL, OpenAIProvider

    if settings.ai_provider == "groq":
        primary = OpenAIProvider(
            api_key=settings.groq_api_key,
            model=settings.groq_model,
            base_url=GROQ_BASE_URL,
            key_name="GROQ_API_KEY",
            # gpt-oss "thinks" before answering; low effort is ~30% faster with the same output here.
            reasoning_effort="low" if "gpt-oss" in settings.groq_model else None,
        )
    else:
        primary = OpenAIProvider(api_key=settings.openai_api_key, model=settings.openai_model)
    return FallbackProvider(primary, MockProvider())
