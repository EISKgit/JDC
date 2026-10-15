"""Passwords and signed tokens. Pure building blocks: no HTTP, no database.

The request-level "who is calling?" check (get_current_user) lives in the API
layer (app/api/deps.py), which is the only place that knows about HTTP headers.
"""

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

import jwt
from passlib.context import CryptContext

from app.core.config import get_settings
from app.domain.errors import Unauthorized
from app.models.user import User

ACCESS = "access"
PASSWORD_RESET = "password_reset"
GOOGLE_STATE = "google_state"


class PasswordHasher(Protocol):
    """What the app needs from password hashing. Services depend on this, not on bcrypt."""

    def hash(self, password: str) -> str: ...

    def verify(self, password: str, hashed: str) -> bool: ...

    def burn(self, password: str) -> None:
        """Take as long as `verify` without checking anything (see BcryptPasswordHasher.burn)."""


class BcryptPasswordHasher:
    def __init__(self) -> None:
        self._context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        self._dummy_hash: str | None = None

    def hash(self, password: str) -> str:
        return self._context.hash(password)

    def verify(self, password: str, hashed: str) -> bool:
        return self._context.verify(password, hashed)

    def burn(self, password: str) -> None:
        """Spend the same time as a real check, for logins whose email has no password.
        Without this, "no such account" answers ~0.2s faster than "wrong password",
        and that difference reveals which emails are registered."""
        if self._dummy_hash is None:
            self._dummy_hash = self.hash("timing-equalizer-not-a-real-password")
        self._context.verify(password, self._dummy_hash)


password_hasher = BcryptPasswordHasher()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_hasher.verify(plain_password, hashed_password)


def password_fingerprint(user: User) -> str:
    """Changes whenever the password changes. Tokens carry it, so a password
    change/reset logs out every other session and makes reset links single-use."""
    return hashlib.sha256((user.hashed_password or "").encode()).hexdigest()[:16]


def create_token(purpose: str, subject: str, minutes: int, **claims: Any) -> str:
    settings = get_settings()
    payload = {
        "sub": subject,
        "purpose": purpose,
        "exp": datetime.now(UTC) + timedelta(minutes=minutes),
        **claims,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def read_token(token: str, purpose: str) -> dict[str, Any]:
    """Decode a token we signed, checking expiry and that it was made for `purpose`
    (so e.g. a password-reset link can't be used as a login token)."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise Unauthorized("Invalid or expired token") from exc
    if payload.get("purpose") != purpose or payload.get("sub") is None:
        raise Unauthorized("Invalid or expired token")
    return payload


def create_access_token(user: User) -> str:
    return create_token(
        ACCESS,
        str(user.id),
        get_settings().access_token_expire_minutes,
        pv=password_fingerprint(user),
        tv=user.token_version,
    )


def is_token_current(claims: dict[str, Any], user: User) -> bool:
    """pv: password unchanged since the token was issued; tv: not signed out everywhere since."""
    return claims.get("pv") == password_fingerprint(user) and claims.get("tv") == user.token_version
