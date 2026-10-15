"""Simple in-memory rate limiting (sliding window). No HTTP here: going over a limit
raises the domain error TooManyRequests, and the API layer decides how that looks
(429 + Retry-After). The FastAPI dependencies that apply limits per IP / per user
live in app/api/rate_limits.py.

In-memory means limits are per server process and reset on restart. That's right
for a single-process app; behind several workers this would move to Redis by
writing another class with the same methods.
"""

import math
import threading
import time
from collections import defaultdict, deque

from app.domain.errors import TooManyRequests

WINDOW_SECONDS = 60.0


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window: float = WINDOW_SECONDS) -> None:
        """Record one hit for `key`; raise TooManyRequests if it's over `limit` per `window` seconds."""
        self.ensure_below(key, limit, window)
        self.record(key)

    def ensure_below(
        self, key: str, limit: int, window: float = WINDOW_SECONDS, detail: str | None = None
    ) -> None:
        """Raise TooManyRequests if `key` already has `limit` hits in the window (without adding one)."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] >= window:
                hits.popleft()
            if len(hits) < limit:
                return
            retry_after = max(1, math.ceil(window - (now - hits[0])))
        message = detail or "Too many requests. Please try again in {wait}."
        raise TooManyRequests(message.format(wait=_human(retry_after)), retry_after)

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
