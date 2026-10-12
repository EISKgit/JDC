import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login")

ACCESS = "access"
PASSWORD_RESET = "password_reset"
GOOGLE_STATE = "google_state"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def password_fingerprint(user: User) -> str:
    """Changes whenever the password changes. Tokens carry it, so a password
    change/reset logs out every other session and makes reset links single-use."""
    return hashlib.sha256((user.hashed_password or "").encode()).hexdigest()[:16]


def create_token(purpose: str, subject: str, minutes: int, **claims: Any) -> str:
    settings = get_settings()
    payload = {
        "sub": subject,
        "purpose": purpose,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes),
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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc
    if payload.get("purpose") != purpose or payload.get("sub") is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return payload


def create_access_token(user: User) -> str:
    return create_token(
        ACCESS, str(user.id), get_settings().access_token_expire_minutes, pv=password_fingerprint(user)
    )


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = read_token(token, ACCESS)
    user = db.get(User, int(payload["sub"]))
    if user is None or payload.get("pv") != password_fingerprint(user):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please log in again")
    return user
