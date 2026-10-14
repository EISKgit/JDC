from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Public (it's in the source code), so anyone could sign tokens with it.
DEFAULT_SECRET_KEY = "dev-only-secret-change-me"
MIN_SECRET_KEY_LENGTH = 32


class InsecureConfigError(RuntimeError):
    """Raised at startup when settings are unsafe outside development."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    app_name: str = "JDC — Just a Daily Companion API"
    api_v1_prefix: str = "/api/v1"
    # "development" allows the built-in SECRET_KEY (with a warning); anything else
    # ("production", "staging", ...) refuses to start without a real one.
    environment: str = "development"
    # Where the React app is served; used for links the backend sends people to
    # (Google sign-in redirect, password-reset emails).
    frontend_url: str = "http://localhost:5173"
    log_level: str = "INFO"

    # Database
    database_url: str = "sqlite:///./ilc.db"

    # Auth
    secret_key: str = DEFAULT_SECRET_KEY
    access_token_expire_minutes: int = 10080  # 7 days
    jwt_algorithm: str = "HS256"

    # CORS
    cors_origins: str = "http://localhost:5173"

    # Google OAuth (optional — disabled when client id is blank)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"

    # AI provider: "mock" (rule-based, no key), "openai" or "groq"
    ai_provider: str = "mock"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    # Email for password resets (optional). Without SMTP_HOST the reset link is
    # written to the server log instead, which is fine for local use.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "JDC <no-reply@localhost>"
    password_reset_expire_minutes: int = 30

    # Rate limits (requests per minute). Auth limits are per client IP, AI limits per user.
    rate_limit_auth_per_minute: int = 10
    rate_limit_ai_per_minute: int = 20
    # Per-account lockout: after this many wrong passwords for one email (from any IP),
    # that account's password login pauses for the lockout window.
    login_max_failures: int = 5
    login_lockout_minutes: int = 15

    # Largest request body accepted, in bytes (JSON API: 1 MB is plenty).
    max_request_bytes: int = 1_000_000

    @property
    def is_development(self) -> bool:
        return self.environment.strip().lower() in ("development", "dev", "local")

    @property
    def uses_default_secret(self) -> bool:
        return self.secret_key == DEFAULT_SECRET_KEY

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def check_security(settings: Settings) -> list[str]:
    """Refuse to run with a guessable SECRET_KEY outside development.

    The JWT secret signs every login token: with the public default anyone could
    mint a token for any account. In development it's allowed (with a warning)
    so the app still runs with zero setup. Returns the warnings to log.
    """
    problems = []
    if settings.uses_default_secret:
        problems.append("SECRET_KEY is the built-in default, which is public")
    elif len(settings.secret_key) < MIN_SECRET_KEY_LENGTH:
        problems.append(f"SECRET_KEY is shorter than {MIN_SECRET_KEY_LENGTH} characters")
    if problems and not settings.is_development:
        raise InsecureConfigError(
            "; ".join(problems)
            + f' (ENVIRONMENT="{settings.environment}"). Set a long random SECRET_KEY in .env, e.g. '
            + 'python -c "import secrets; print(secrets.token_urlsafe(48))"'
        )
    return [f"{p}. Fine for local development, never deploy like this." for p in problems]
