"""Simple in-memory rate limiting (sliding one-minute window).

- Auth endpoints (login, register, password reset) are limited per client IP,
  which stops password guessing and sign-up spam.
- AI endpoints (posting/editing updates, Ask JDC, day summaries) are limited per
  user, which protects the free Groq quota from one runaway client.

In-memory means limits are per server process and reset on restart. That's right
for a single-process app; behind several workers this would move to Redis.
"""

import math
import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status

from app.core.config import get_settings
from app.core.security import get_current_user
from app.models.user import User

WINDOW_SECONDS = 60.0


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window: float = WINDOW_SECONDS) -> None:
        """Record one hit for `key`; raise 429 if it's over `limit` per `window` seconds."""
        self.ensure_below(key, limit, window)
        self.record(key)

    def ensure_below(
        self, key: str, limit: int, window: float = WINDOW_SECONDS, detail: str | None = None
    ) -> None:
        """Raise 429 if `key` already has `limit` hits in the window (without adding one)."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] >= window:
                hits.popleft()
            if len(hits) < limit:
                return
            retry_after = max(1, math.ceil(window - (now - hits[0])))
        message = detail or "Too many requests. Please try again in {wait}."
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=message.format(wait=_human(retry_after)),
            headers={"Retry-After": str(retry_after)},
        )

    def record(self, key: str) -> None:
        with self._lock:
            self._hits[key].append(time.monotonic())

    def clear(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def _human(seconds: int) -> str:
    if seconds < 90:
        return f"{seconds} seconds"
    return f"{math.ceil(seconds / 60)} minutes"


limiter = RateLimiter()


def limit_by_ip(scope: str) -> Callable[[Request], None]:
    def dependency(request: Request) -> None:
        client = request.client.host if request.client else "unknown"
        limiter.check(f"{scope}:ip:{client}", get_settings().rate_limit_auth_per_minute)

    return dependency


def limit_by_user(scope: str) -> Callable[[User], None]:
    def dependency(current_user: User = Depends(get_current_user)) -> None:
        limiter.check(f"{scope}:user:{current_user.id}", get_settings().rate_limit_ai_per_minute)

    return dependency


def limit_sensitive(scope: str) -> Callable[[User], None]:
    """For signed-in actions that check a password (change password, delete account):
    a stolen session shouldn't be able to guess the current password at full speed."""

    def dependency(current_user: User = Depends(get_current_user)) -> None:
        limiter.check(f"{scope}:user:{current_user.id}", get_settings().rate_limit_auth_per_minute)

    return dependency
