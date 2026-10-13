from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app.api.v1 import auth as auth_api
from app.core.config import get_settings
from app.core.security import create_token
from app.db.session import SessionLocal
from app.models.event import Event
from app.models.update import Update

API = "/api/v1"


def register(client, email="acct@example.com", password="correct-horse") -> dict[str, str]:
    token = client.post(f"{API}/auth/register", json={"email": email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ------------------------------------------------------------ change password


def test_change_password_signs_out_other_sessions(client):
    old = register(client)
    assert client.post(
        f"{API}/auth/change-password", headers=old, json={"current_password": "wrong", "new_password": "new-password-1"}
    ).status_code == 400

    response = client.post(
        f"{API}/auth/change-password",
        headers=old,
        json={"current_password": "correct-horse", "new_password": "new-password-1"},
    )
    assert response.status_code == 200
    assert client.get(f"{API}/auth/me", headers=bearer(response.json()["access_token"])).status_code == 200
    assert client.get(f"{API}/auth/me", headers=old).status_code == 401  # old session is gone
    login = {"email": "acct@example.com", "password": "new-password-1"}
    assert client.post(f"{API}/auth/login", json=login).status_code == 200


# ------------------------------------------------------------ forgot / reset password


@pytest.fixture
def sent_emails(monkeypatch):
    sent = []
    monkeypatch.setattr(auth_api, "send_email", lambda to, subject, body: sent.append((to, body)) or True)
    return sent


def reset_token_from(body: str) -> str:
    link = next(word for word in body.split() if "/reset-password?token=" in word)
    return parse_qs(urlparse(link).query)["token"][0]


def test_forgot_password_does_not_reveal_which_emails_exist(client, sent_emails):
    register(client)
    known = client.post(f"{API}/auth/forgot-password", json={"email": "ACCT@example.com"})
    unknown = client.post(f"{API}/auth/forgot-password", json={"email": "nobody@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert [to for to, _ in sent_emails] == ["acct@example.com"]
    assert sent_emails[0][1].count(get_settings().frontend_url) == 1


def test_reset_link_works_once(client, sent_emails):
    register(client)
    client.post(f"{API}/auth/forgot-password", json={"email": "acct@example.com"})
    token = reset_token_from(sent_emails[0][1])

    first = client.post(f"{API}/auth/reset-password", json={"token": token, "new_password": "brand-new-pass"})
    assert first.status_code == 200
    assert client.get(f"{API}/auth/me", headers=bearer(first.json()["access_token"])).status_code == 200

    again = client.post(f"{API}/auth/reset-password", json={"token": token, "new_password": "another-pass-1"})
    assert again.status_code == 401
    assert client.post(
        f"{API}/auth/login", json={"email": "acct@example.com", "password": "brand-new-pass"}
    ).status_code == 200


def test_a_login_token_cannot_be_used_as_a_reset_link(client):
    headers = register(client)
    login_token = headers["Authorization"].split()[1]
    response = client.post(f"{API}/auth/reset-password", json={"token": login_token, "new_password": "hijacked-pw"})
    assert response.status_code == 401


# ------------------------------------------------------------ export / delete


def test_export_contains_everything(client):
    headers = register(client)
    client.put(f"{API}/onboarding", headers=headers, json={"about": "Developer", "focus_categories": ["health"]})
    client.post(f"{API}/goals", headers=headers, json={"category": "health", "title": "Run 5k"})
    client.post(f"{API}/updates", headers=headers, json={"content": "Went to the gym"})

    response = client.get(f"{API}/auth/me/export", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-disposition"].startswith('attachment; filename="jdc-export-')
    data = response.json()
    assert data["user"]["email"] == "acct@example.com"
    assert data["life_profile"]["about"] == "Developer"
    assert [g["title"] for g in data["goals"]] == ["Run 5k"]
    assert data["updates"][0]["content"] == "Went to the gym"
    assert data["updates"][0]["events"][0]["category"] == "health"


def test_delete_account_removes_all_their_data_only(client):
    headers = register(client)
    client.post(f"{API}/updates", headers=headers, json={"content": "Went to the gym"})
    client.post(f"{API}/goals", headers=headers, json={"category": "health", "title": "Run 5k"})
    other = register(client, "keep@example.com")
    client.post(f"{API}/updates", headers=other, json={"content": "Read a book"})

    delete = lambda body: client.request("DELETE", f"{API}/auth/me", headers=headers, json=body)  # noqa: E731
    assert delete({"password": "correct-horse", "confirm": "delete"}).status_code == 400
    assert delete({"password": "wrong", "confirm": "DELETE"}).status_code == 400
    assert delete({"password": "correct-horse", "confirm": "DELETE"}).status_code == 204

    assert client.get(f"{API}/auth/me", headers=headers).status_code == 401
    with SessionLocal() as db:
        assert db.query(Update).count() == 1 and db.query(Event).count() == 1  # only the other user's
    assert len(client.get(f"{API}/updates", headers=other).json()) == 1


# ------------------------------------------------------------ public config (privacy notice, Google button)


def test_public_config_without_login(client, monkeypatch):
    assert client.get(f"{API}/config").json() == {"google_sign_in": False, "ai": {"external": False, "vendor": None}}
    monkeypatch.setattr(get_settings(), "ai_provider", "groq")
    monkeypatch.setattr(get_settings(), "google_client_id", "client-id")
    assert client.get(f"{API}/config").json() == {"google_sign_in": True, "ai": {"external": True, "vendor": "Groq"}}


# ------------------------------------------------------------ rate limits


def test_login_attempts_are_rate_limited_per_ip(client):
    register(client)
    # Different emails each time, so this exercises the per-IP limit, not the per-account lockout.
    statuses = [
        client.post(f"{API}/auth/login", json={"email": f"guess{i}@example.com", "password": "guess-guess"}).status_code
        for i in range(12)
    ]
    # register used 1 of the 10/minute auth requests; 9 more are allowed, then 429.
    assert statuses[:9] == [401] * 9
    assert set(statuses[9:]) == {429}
    blocked = client.post(f"{API}/auth/login", json={"email": "x@example.com", "password": "guess-guess"})
    assert blocked.status_code == 429 and int(blocked.headers["retry-after"]) > 0


def test_ai_endpoints_are_rate_limited_per_user(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_ai_per_minute", 2)
    alice, bob = register(client), register(client, "bob@example.com")
    ask = lambda headers: client.post(f"{API}/assistant/ask", headers=headers, json={"question": "gym"})  # noqa: E731
    assert [ask(alice).status_code for _ in range(3)] == [200, 200, 429]
    assert ask(bob).status_code == 200  # a different user has their own budget
    # posting updates shares the same AI budget
    assert client.post(f"{API}/updates", headers=alice, json={"content": "Went to the gym"}).status_code == 429


# ------------------------------------------------------------ Google sign-in


@pytest.fixture
def google(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "client-id")
    monkeypatch.setattr(settings, "google_client_secret", "client-secret")
    profile = {"sub": "google-123", "email": "Gina@Example.com", "email_verified": True, "name": "Gina"}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/token":
            return httpx.Response(200, json={"access_token": "google-access"})
        return httpx.Response(200, json=profile)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs)
    )
    return profile


def fragment(response) -> dict[str, str]:
    location = response.headers["location"]
    assert location.startswith(f"{get_settings().frontend_url}/auth/callback#")
    return {k: v[0] for k, v in parse_qs(urlparse(location).fragment).items()}


def start_google_login(client) -> str:
    response = client.get(f"{API}/auth/google/login", follow_redirects=False)
    assert response.status_code == 307
    return parse_qs(urlparse(response.headers["location"]).query)["state"][0]


def test_google_login_is_501_when_not_configured(client):
    assert client.get(f"{API}/auth/google/login", follow_redirects=False).status_code == 501


def test_google_sign_in_returns_to_the_app_with_a_token(client, google):
    state = start_google_login(client)
    response = client.get(f"{API}/auth/google/callback", params={"code": "c", "state": state}, follow_redirects=False)
    token = fragment(response)["token"]
    me = client.get(f"{API}/auth/me", headers=bearer(token)).json()
    assert me["email"] == "gina@example.com" and me["has_password"] is False


def test_google_callback_rejects_a_state_from_another_browser(client, google):
    forged = create_token("google_state", "someone-else", 10)  # validly signed, but not this browser's cookie
    start_google_login(client)
    response = client.get(f"{API}/auth/google/callback", params={"code": "c", "state": forged}, follow_redirects=False)
    assert "could not be verified" in fragment(response)["error"]


@pytest.mark.parametrize(
    ("params", "message"),
    [({"error": "access_denied"}, "cancelled"), ({"code": "c", "state": "garbage"}, "expired")],
)
def test_google_callback_errors_go_back_to_the_app(client, google, params, message):
    start_google_login(client)
    response = client.get(f"{API}/auth/google/callback", params=params, follow_redirects=False)
    assert message in fragment(response)["error"]


def test_google_unverified_email_is_refused(client, google):
    google["email_verified"] = False
    state = start_google_login(client)
    response = client.get(f"{API}/auth/google/callback", params={"code": "c", "state": state}, follow_redirects=False)
    assert "isn't verified" in fragment(response)["error"]


# ------------------------------------------------------------ search understands related words


def test_search_finds_entries_by_related_life_area(client):
    from app.services.journal_search import search_journal

    headers = register(client)
    gym = client.post(f"{API}/updates", headers=headers, json={"content": "Went to the gym"}).json()
    workout_word = client.post(f"{API}/updates", headers=headers, json={"content": "Skipped my workout"}).json()
    client.post(f"{API}/updates", headers=headers, json={"content": "Spent $40 on groceries"})
    with SessionLocal() as db:
        user_id = db.get(Update, gym["id"]).user_id
        ids = [h.update_id for h in search_journal(db, user_id, "workout")]
    # the entry with the word itself first, then the gym entry via the Health area; groceries never
    assert ids == [workout_word["id"], gym["id"]]


def test_browser_can_read_export_filename_and_retry_after(client):
    headers = {**register(client), "Origin": "http://localhost:5173"}
    response = client.get(f"{API}/auth/me/export", headers=headers)
    exposed = response.headers["access-control-expose-headers"].lower()
    assert "content-disposition" in exposed and "retry-after" in exposed
