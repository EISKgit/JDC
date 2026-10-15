"""Talking to Google's OAuth servers (and nothing else).

Kept apart from sign-in rules (AuthService) and from HTTP cookies/redirects (the
route), so each piece has one reason to change: Google changing its API, our
account-linking rules, or how the browser round-trip works.
"""

import logging
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlencode

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


class OAuthError(Exception):
    """Google couldn't complete the exchange (network, bad code, unexpected response)."""


@dataclass(frozen=True)
class GoogleProfile:
    google_id: str
    email: str
    email_verified: bool
    name: str | None


class OAuthProvider(Protocol):
    def authorization_url(self, state: str) -> str: ...

    async def fetch_profile(self, code: str) -> GoogleProfile: ...


class GoogleOAuthClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def authorization_url(self, state: str) -> str:
        params = {
            "client_id": self._settings.google_client_id,
            "redirect_uri": self._settings.google_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "prompt": "select_account",
            "state": state,
        }
        return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"

    async def fetch_profile(self, code: str) -> GoogleProfile:
        s = self._settings
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                token_response = await client.post(
                    GOOGLE_TOKEN_URL,
                    data={
                        "code": code,
                        "client_id": s.google_client_id,
                        "client_secret": s.google_client_secret,
                        "redirect_uri": s.google_redirect_uri,
                        "grant_type": "authorization_code",
                    },
                )
                token_response.raise_for_status()
                userinfo_response = await client.get(
                    GOOGLE_USERINFO_URL,
                    headers={"Authorization": f"Bearer {token_response.json()['access_token']}"},
                )
                userinfo_response.raise_for_status()
                data = userinfo_response.json()
            return GoogleProfile(
                google_id=data["sub"],
                email=str(data.get("email") or "").strip().lower(),
                email_verified=bool(data.get("email_verified", False)),
                name=data.get("name"),
            )
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            logger.warning("Google sign-in failed", exc_info=True)
            raise OAuthError("Google sign-in failed") from exc
