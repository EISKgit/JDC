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

    def check(self, key: str, limit: int) -> None:
        """Record one hit for `key`; raise 429 if it's over `limit` per minute."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] >= WINDOW_SECONDS:
                hits.popleft()
            if len(hits) >= limit:
                retry_after = max(1, math.ceil(WINDOW_SECONDS - (now - hits[0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many requests. Please try again in {retry_after} seconds.",
                    headers={"Retry-After": str(retry_after)},
                )
            hits.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


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
