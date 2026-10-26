"""HTTP endpoints for accounts. Thin adapters: parse the request, call a service,
shape the response. The rules themselves live in AuthService / AccountService."""

import secrets
from datetime import UTC, datetime
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse
from starlette.responses import RedirectResponse

from app.api.deps import (
    get_account_service,
    get_auth_service,
    get_current_user,
    get_oauth_provider,
)
from app.api.rate_limits import limit_by_ip, limit_sensitive
from app.core.config import Settings, get_settings
from app.core.security import GOOGLE_STATE, create_token, read_token
from app.domain.errors import DomainError, NotConfigured
from app.models.user import User
from app.schemas.auth import (
    AccountExport,
    ChangePassword,
    DeleteAccount,
    ForgotPassword,
    ProfilePictureIn,
    ResetPassword,
    Token,
    UserCreate,
    UserLogin,
    UserOut,
)
from app.services.account_service import AccountService
from app.services.auth_service import AuthService
from app.services.google_oauth import OAuthError, OAuthProvider

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_STATE_COOKIE = "jdc_google_state"
GOOGLE_STATE_MINUTES = 10

auth_rate_limit = Depends(limit_by_ip("auth"))
sensitive_rate_limit = Depends(limit_sensitive("sensitive"))


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED, dependencies=[auth_rate_limit])
def register(payload: UserCreate, auth: AuthService = Depends(get_auth_service)) -> Token:
    return Token(access_token=auth.register(payload.email, payload.password, payload.full_name))


@router.post("/login", response_model=Token, dependencies=[auth_rate_limit])
def login(payload: UserLogin, auth: AuthService = Depends(get_auth_service)) -> Token:
    return Token(access_token=auth.login(payload.email, payload.password))


@router.get("/me", response_model=UserOut)
def read_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.put("/me/profile-picture", response_model=UserOut)
def update_my_profile_picture(
    payload: ProfilePictureIn,
    current_user: User = Depends(get_current_user),
    accounts: AccountService = Depends(get_account_service),
) -> User:
    """Set (or clear) the signed-in user's profile picture."""
    return accounts.update_profile_picture(current_user, payload.profile_picture_url)


# ---------------------------------------------------------------- passwords and sessions


@router.post("/change-password", response_model=Token, dependencies=[sensitive_rate_limit])
def change_password(
    payload: ChangePassword,
    current_user: User = Depends(get_current_user),
    auth: AuthService = Depends(get_auth_service),
) -> Token:
    return Token(access_token=auth.change_password(current_user, payload.current_password, payload.new_password))


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED, dependencies=[auth_rate_limit])
def forgot_password(payload: ForgotPassword, auth: AuthService = Depends(get_auth_service)) -> dict[str, str]:
    auth.request_password_reset(payload.email)
    return {"detail": "If an account exists for that email, a reset link has been sent."}


@router.post("/reset-password", response_model=Token, dependencies=[auth_rate_limit])
def reset_password(payload: ResetPassword, auth: AuthService = Depends(get_auth_service)) -> Token:
    return Token(access_token=auth.reset_password(payload.token, payload.new_password))


@router.post("/logout-all", response_model=Token)
def logout_everywhere_else(
    current_user: User = Depends(get_current_user), auth: AuthService = Depends(get_auth_service)
) -> Token:
    """Sign out every other device; returns a fresh token so this session stays signed in."""
    return Token(access_token=auth.sign_out_everywhere(current_user))


# ---------------------------------------------------------------- your data


@router.get("/me/export", response_model=AccountExport)
def export_my_data(
    current_user: User = Depends(get_current_user), accounts: AccountService = Depends(get_account_service)
) -> JSONResponse:
    export = accounts.export(current_user)
    filename = f"jdc-export-{datetime.now(UTC):%Y-%m-%d}.json"
    return JSONResponse(
        export.model_dump(mode="json"),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, dependencies=[sensitive_rate_limit])
def delete_my_account(
    payload: DeleteAccount,
    current_user: User = Depends(get_current_user),
    accounts: AccountService = Depends(get_account_service),
) -> None:
    accounts.delete(current_user, payload.password, payload.confirm)


# ---------------------------------------------------------------- Google sign-in (browser round-trip)


@router.get("/google/login", dependencies=[auth_rate_limit])
def google_login(
    settings: Settings = Depends(get_settings), google: OAuthProvider = Depends(get_oauth_provider)
) -> RedirectResponse:
    if not settings.google_client_id:
        raise NotConfigured("Google sign-in is not configured. Set GOOGLE_CLIENT_ID/SECRET in .env.")
    # CSRF protection: Google sends `state` back unchanged, and it must match the
    # cookie set on this browser, so nobody can trick a browser into finishing
    # someone else's sign-in.
    state = create_token(GOOGLE_STATE, secrets.token_urlsafe(16), GOOGLE_STATE_MINUTES)
    response = RedirectResponse(google.authorization_url(state))
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
    settings: Settings = Depends(get_settings),
    google: OAuthProvider = Depends(get_oauth_provider),
    auth: AuthService = Depends(get_auth_service),
) -> RedirectResponse:
    """Google sends the browser here; finish sign-in and send the browser back to the
    React app with a JDC token (or an error) in the URL fragment."""
    if not settings.google_client_id:
        return _frontend_redirect({"error": "Google sign-in is not configured"})
    if error or not code:
        return _frontend_redirect({"error": "Google sign-in was cancelled"})
    try:
        read_token(state or "", GOOGLE_STATE)
    except DomainError:
        return _frontend_redirect({"error": "Google sign-in expired, please try again"})
    if not secrets.compare_digest(state or "", request.cookies.get(GOOGLE_STATE_COOKIE, "")):
        return _frontend_redirect({"error": "Google sign-in could not be verified, please try again"})

    try:
        profile = await google.fetch_profile(code)
        return _frontend_redirect({"token": auth.google_sign_in(profile)})
    except OAuthError:
        return _frontend_redirect({"error": "Google sign-in failed, please try again"})
    except DomainError as exc:
        return _frontend_redirect({"error": exc.message})
