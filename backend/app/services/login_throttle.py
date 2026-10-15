"""Per-account login lockout policy (the rules, separate from the counting mechanism)."""

from app.core.config import Settings
from app.core.rate_limit import RateLimiter

LOCKED_MESSAGE = (
    "Too many failed login attempts for this account. Please try again in {wait}, or reset your password."
)


class LoginThrottle:
    """After `login_max_failures` wrong passwords for one email (from any IP), password
    login for that account pauses for `login_lockout_minutes`.

    Keyed by email whether or not the account exists, so the lockout itself doesn't
    reveal which emails are registered.
    """

    def __init__(self, limiter: RateLimiter, settings: Settings) -> None:
        self._limiter = limiter
        self._max_failures = settings.login_max_failures
        self._window = settings.login_lockout_minutes * 60

    @staticmethod
    def _key(email: str) -> str:
        return f"login-failures:{email}"

    def ensure_allowed(self, email: str) -> None:
        """Raise TooManyRequests while the account is locked."""
        self._limiter.ensure_below(self._key(email), self._max_failures, self._window, detail=LOCKED_MESSAGE)

    def record_failure(self, email: str) -> None:
        self._limiter.record(self._key(email))

    def reset(self, email: str) -> None:
        """After a successful login or password reset."""
        self._limiter.clear(self._key(email))
