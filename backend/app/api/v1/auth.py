import logging
import secrets
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, selectinload
from starlette.responses import RedirectResponse

from app.core.config import get_settings
from app.core.rate_limit import limit_by_ip
from app.core.security import (
    GOOGLE_STATE,
    PASSWORD_RESET,
    create_access_token,
    create_token,
    get_current_user,
    hash_password,
    password_fingerprint,
    read_token,
    verify_password,
)
from app.db.session import get_db
from app.models.update import Update
from app.models.user import User
from app.schemas.auth import (
    AccountExport,
    ChangePassword,
    DeleteAccount,
    ForgotPassword,
    ResetPassword,
    Token,
    UserCreate,
    UserLogin,
    UserOut,
)
from app.services.email import send_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_STATE_COOKIE = "jdc_google_state"
GOOGLE_STATE_MINUTES = 10

auth_rate_limit = Depends(limit_by_ip("auth"))


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED, dependencies=[auth_rate_limit])
def register(payload: UserCreate, db: Session = Depends(get_db)) -> Token:
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return Token(access_token=create_access_token(user))


@router.post("/login", response_model=Token, dependencies=[auth_rate_limit])
def login(payload: UserLogin, db: Session = Depends(get_db)) -> Token:
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    return Token(access_token=create_access_token(user))


@router.get("/me", response_model=UserOut)
def read_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


# ---------------------------------------------------------------- passwords


@router.post("/change-password", response_model=Token)
def change_password(
    payload: ChangePassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Token:
    """Change (or, for Google-only accounts, set) the password. Other sessions are
    signed out; the returned token keeps this one signed in."""
    if current_user.hashed_password and not (
        payload.current_password and verify_password(payload.current_password, current_user.hashed_password)
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return Token(access_token=create_access_token(current_user))


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED, dependencies=[auth_rate_limit])
def forgot_password(payload: ForgotPassword, db: Session = Depends(get_db)) -> dict[str, str]:
    """Email a reset link. Always answers the same way, so it can't be used to find
    out which emails have accounts."""
    settings = get_settings()
    user = db.query(User).filter(User.email == payload.email).first()
    if user is not None:
        token = create_token(
            PASSWORD_RESET, str(user.id), settings.password_reset_expire_minutes, pv=password_fingerprint(user)
        )
        link = f"{settings.frontend_url}/reset-password?token={token}"
        send_email(
            user.email,
            "Reset your JDC password",
            f"Someone asked to reset the password for your JDC account.\n\n"
            f"Choose a new password here (valid for {settings.password_reset_expire_minutes} minutes):\n{link}\n\n"
            f"If this wasn't you, ignore this email; your password stays the same.",
        )
    return {"detail": "If an account exists for that email, a reset link has been sent."}


@router.post("/reset-password", response_model=Token, dependencies=[auth_rate_limit])
def reset_password(payload: ResetPassword, db: Session = Depends(get_db)) -> Token:
    claims = read_token(payload.token, PASSWORD_RESET)
    user = db.get(User, int(claims["sub"]))
    # The link carries the old password's fingerprint: once used (or once the password
    # changes any other way) it stops working.
    if user is None or claims.get("pv") != password_fingerprint(user):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="This reset link has already been used")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return Token(access_token=create_access_token(user))


# ---------------------------------------------------------------- your data


@router.get("/me/export", response_model=AccountExport)
def export_my_data(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> JSONResponse:
    """Everything stored about the user, as one JSON file."""
    updates = (
        db.query(Update)
        .options(selectinload(Update.events))
        .filter(Update.user_id == current_user.id)
        .order_by(Update.created_at)
        .all()
    )
    export = AccountExport(
        exported_at=datetime.now(timezone.utc),
        user=current_user,
        life_profile=current_user.profile,
        goals=current_user.goals,
        updates=updates,
    )
    filename = f"jdc-export-{datetime.now(timezone.utc):%Y-%m-%d}.json"
    return JSONResponse(
        export.model_dump(mode="json"),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_account(
    payload: DeleteAccount,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Permanently delete the account and everything in it (profile, goals, updates, events)."""
    if payload.confirm != "DELETE":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Type DELETE to confirm')
    if current_user.hashed_password and not (
        payload.password and verify_password(payload.password, current_user.hashed_password)
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password is incorrect")
    db.delete(current_user)  # cascades: profile, goals, updates -> events
    db.commit()


# ---------------------------------------------------------------- Google sign-in


@router.get("/google/login", dependencies=[auth_rate_limit])
def google_login() -> RedirectResponse:
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google sign-in is not configured. Set GOOGLE_CLIENT_ID/SECRET in .env.",
        )
    # CSRF protection: Google sends `state` back unchanged, and it must match the
    # cookie set on this browser, so nobody can trick a browser into finishing
    # someone else's sign-in.
    nonce = secrets.token_urlsafe(16)
    state = create_token(GOOGLE_STATE, nonce, GOOGLE_STATE_MINUTES)
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "prompt": "select_account",
        "state": state,
    }
    response = RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")
    response.set_cookie(
        GOOGLE_STATE_COOKIE,
        state,
        max_age=GOOGLE_STATE_MINUTES * 60,
        httponly=True,
        samesite="lax",
        secure=not settings.is_development,
        path="/",
    )
    return response


def _frontend_redirect(fragment: dict[str, str]) -> RedirectResponse:
    # The token goes in the #fragment: browsers never send fragments to servers, so it
    # doesn't end up in server logs or Referer headers.
    response = RedirectResponse(f"{get_settings().frontend_url}/auth/callback#{urlencode(fragment)}")
    response.delete_cookie(GOOGLE_STATE_COOKIE, path="/")
    return response


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Google sends the browser here after sign-in; we finish it and send the browser
    back to the React app with a JDC token (or an error) in the URL fragment."""
    settings = get_settings()
    if not settings.google_client_id:
        return _frontend_redirect({"error": "Google sign-in is not configured"})
    if error or not code:
        return _frontend_redirect({"error": "Google sign-in was cancelled"})
    try:
        read_token(state or "", GOOGLE_STATE)
    except HTTPException:
        return _frontend_redirect({"error": "Google sign-in expired, please try again"})
    if not secrets.compare_digest(state or "", request.cookies.get(GOOGLE_STATE_COOKIE, "")):
        return _frontend_redirect({"error": "Google sign-in could not be verified, please try again"})

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token_response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": settings.google_redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            token_response.raise_for_status()
            userinfo_response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {token_response.json()['access_token']}"},
            )
            userinfo_response.raise_for_status()
            profile = userinfo_response.json()
    except (httpx.HTTPError, KeyError, ValueError):
        logger.warning("Google sign-in failed", exc_info=True)
        return _frontend_redirect({"error": "Google sign-in failed, please try again"})

    if not profile.get("email_verified", False) or not profile.get("email"):
        return _frontend_redirect({"error": "Your Google email address isn't verified"})

    google_id = profile["sub"]
    email = profile["email"].strip().lower()
    user = db.query(User).filter(User.google_id == google_id).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, full_name=profile.get("name"), google_id=google_id)
        db.add(user)
    elif not user.google_id:
        user.google_id = google_id
    db.commit()
    db.refresh(user)
    return _frontend_redirect({"token": create_access_token(user)})
