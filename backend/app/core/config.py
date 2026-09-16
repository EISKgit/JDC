from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    app_name: str = "Intelligent Life Companion API"
    api_v1_prefix: str = "/api/v1"

    # Database
    database_url: str = "sqlite:///./ilc.db"

    # Auth
    secret_key: str = "dev-only-secret-change-me"
    access_token_expire_minutes: int = 10080  # 7 days
    jwt_algorithm: str = "HS256"

    # CORS
    cors_origins: str = "http://localhost:5173"

    # Google OAuth (optional — disabled when client id is blank)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"

    # AI provider
    ai_provider: str = "mock"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
