"""FastAPI dependencies that apply the core RateLimiter to requests.

- per IP: login, sign-up, password reset (stops password guessing and spam)
- per user, "ai": posting/editing updates, Ask JDC, day summaries (protects the AI quota)
- per user, "sensitive": signed-in actions that check a password
"""

from collections.abc import Callable

from fastapi import Depends, Request

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.models.user import User


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
