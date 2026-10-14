import importlib
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import auth as auth_api
from app.core.config import get_settings
from app.core.middleware import SecurityHeadersMiddleware
from app.core.passwords import password_problem
from app.services import email as email_service

API = "/api/v1"


def register(client, email="sec@example.com", password="correct-horse") -> dict[str, str]:
    token = client.post(f"{API}/auth/register", json={"email": email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def login(client, password, email="sec@example.com"):
    return client.post(f"{API}/auth/login", json={"email": email, "password": password})


# ------------------------------------------------------------ security headers


def test_api_responses_carry_security_headers(client):
    response = client.get(f"{API}/config")
    h = response.headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "no-referrer"
    assert h["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert h["cache-control"] == "no-store"
    assert "strict-transport-security" not in h  # development runs on plain http


def test_errors_get_the_headers_too(client):
    assert client.get(f"{API}/auth/me").headers["x-frame-options"] == "DENY"  # a 401


def test_hsts_outside_development():
    inner = FastAPI()
    inner.get("/x")(lambda: {"ok": True})
    response = TestClient(SecurityHeadersMiddleware(inner, https_only=True)).get("/x")
    assert response.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"


def test_api_docs_are_hidden_in_production(client, monkeypatch):
    import app.main as main

    assert client.get("/docs").status_code == 200  # development
    monkeypatch.setattr(get_settings(), "environment", "production")
    monkeypatch.setattr(get_settings(), "secret_key", "x" * 48)
    try:
        prod = importlib.reload(main).app
        with TestClient(prod) as prod_client:
            assert prod_client.get("/docs").status_code == 404
            assert prod_client.get("/openapi.json").status_code == 404
    finally:
        monkeypatch.undo()
        importlib.reload(main)


# ------------------------------------------------------------ request size


def test_oversized_request_is_rejected(client):
    headers = register(client)
    huge = {"content": "x" * 1_100_000}
    response = client.post(f"{API}/updates", headers=headers, json=huge)
    assert response.status_code == 413
    assert response.json() == {"detail": "Request is too large"}


def test_oversized_streamed_request_without_length_is_rejected(client):
    headers = {**register(client), "Content-Type": "application/json"}

    def chunks():
        yield b'{"content": "'
        for _ in range(12):
            yield b"x" * 100_000
        yield b'"}'

    response = client.post(f"{API}/updates", headers=headers, content=chunks())
    assert response.status_code == 413


def test_profile_text_sent_to_the_ai_is_bounded(client):
    headers = register(client)
    assert client.put(f"{API}/onboarding", headers=headers, json={"about": "x" * 2001}).status_code == 422
    assert client.put(f"{API}/onboarding", headers=headers, json={"about": "x" * 2000}).status_code == 200


# ------------------------------------------------------------ login hardening


def test_unknown_email_takes_as_long_as_a_wrong_password(client, monkeypatch):
    calls = []
    monkeypatch.setattr(auth_api, "burn_password_check", lambda password: calls.append(password))
    assert login(client, "whatever-pw", email="nobody@example.com").status_code == 401
    assert calls == ["whatever-pw"]  # a full bcrypt check still ran


def test_account_locks_after_repeated_wrong_passwords(client):
    register(client)
    assert [login(client, f"wrong-{i}").status_code for i in range(5)] == [401] * 5

    locked = login(client, "correct-horse")  # even the right password waits now
    assert locked.status_code == 429
    assert "for this account" in locked.json()["detail"]
    assert int(locked.headers["retry-after"]) > 60

    # other accounts are unaffected
    register(client, "other@example.com")
    assert login(client, "correct-horse", email="other@example.com").status_code == 200


def test_successful_login_resets_the_failure_count(client):
    register(client)
    for i in range(4):
        login(client, f"wrong-{i}")
    assert login(client, "correct-horse").status_code == 200
    assert [login(client, f"wrong-again-{i}").status_code for i in range(4)] == [401] * 4


def test_password_reset_lifts_a_lockout(client, monkeypatch):
    sent = []
    monkeypatch.setattr(auth_api, "send_email", lambda to, subject, body: sent.append(body) or True)
    register(client)
    for i in range(5):
        login(client, f"wrong-{i}")
    assert login(client, "correct-horse").status_code == 429

    client.post(f"{API}/auth/forgot-password", json={"email": "sec@example.com"})
    token = sent[0].split("token=")[1].split()[0]
    client.post(f"{API}/auth/reset-password", json={"token": token, "new_password": "fresh-secret-9"})
    assert login(client, "fresh-secret-9").status_code == 200


def test_password_checks_are_rate_limited_for_signed_in_users(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_auth_per_minute", 3)
    headers = register(client)
    attempt = lambda: client.post(  # noqa: E731
        f"{API}/auth/change-password",
        headers=headers,
        json={"current_password": "guess", "new_password": "n3w-pass-word"},
    )
    assert [attempt().status_code for _ in range(4)] == [400, 400, 400, 429]


# ------------------------------------------------------------ password strength


@pytest.mark.parametrize(
    ("password", "email", "problem"),
    [
        ("password123", None, "too common"),
        ("Password123", None, "too common"),  # case doesn't help
        ("zzzzzzzzzz", None, "repeats"),
        ("abababab", None, "repeats"),
        ("asha.k-2026!", "asha.k@example.com", "email"),
        ("correct-horse-battery", "asha@example.com", None),
    ],
)
def test_password_rules(password, email, problem):
    result = password_problem(password, email)
    assert (result is None) if problem is None else (problem in result)


def test_weak_passwords_are_refused_everywhere(client):
    weak = client.post(f"{API}/auth/register", json={"email": "w@example.com", "password": "password123"})
    assert weak.status_code == 400 and "too common" in weak.json()["detail"]

    headers = register(client)
    change = client.post(
        f"{API}/auth/change-password",
        headers=headers,
        json={"current_password": "correct-horse", "new_password": "12345678"},
    )
    assert change.status_code == 400


# ------------------------------------------------------------ sign out everywhere


def test_logout_all_invalidates_every_other_session(client):
    phone = register(client)
    laptop = {"Authorization": f"Bearer {login(client, 'correct-horse').json()['access_token']}"}

    response = client.post(f"{API}/auth/logout-all", headers=laptop)
    assert response.status_code == 200
    fresh = {"Authorization": f"Bearer {response.json()['access_token']}"}

    assert client.get(f"{API}/auth/me", headers=phone).status_code == 401
    assert client.get(f"{API}/auth/me", headers=laptop).status_code == 401
    assert client.get(f"{API}/auth/me", headers=fresh).status_code == 200


# ------------------------------------------------------------ logs


def test_reset_links_never_reach_production_logs(monkeypatch, caplog):
    monkeypatch.setattr(get_settings(), "environment", "production")
    monkeypatch.setattr(get_settings(), "smtp_host", "")
    with caplog.at_level(logging.WARNING):
        email_service.send_email("a@example.com", "Reset your JDC password", "secret link: token=abc123")
    assert "token=abc123" not in caplog.text
    assert "could not send" in caplog.text


def test_reset_links_are_logged_for_local_development(monkeypatch, caplog):
    monkeypatch.setattr(get_settings(), "smtp_host", "")
    with caplog.at_level(logging.WARNING):
        email_service.send_email("a@example.com", "Reset", "token=abc123")
    assert "token=abc123" in caplog.text
