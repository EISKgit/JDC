"""Services tested in isolation with plain in-memory fakes: no HTTP, no database.

This is the practical payoff of dependency inversion: AuthService gets its
repository, hasher, throttle and email sender handed in, so each can be replaced
by a few lines of fake code.
"""

import pytest

from app.api.errors import status_code_for
from app.core.config import Settings
from app.core.rate_limit import RateLimiter
from app.core.security import ACCESS, read_token
from app.domain.errors import Conflict, InvalidInput, NotConfigured, NotFound, TooManyRequests, Unauthorized
from app.models.user import User
from app.services.auth_service import AuthService, UnverifiedGoogleEmail
from app.services.google_oauth import GoogleProfile
from app.services.login_throttle import LoginThrottle


class FakeSession:
    def commit(self) -> None:
        pass

    def refresh(self, _entity) -> None:
        pass


class InMemoryUsers:
    def __init__(self) -> None:
        self.rows: dict[int, User] = {}

    def add(self, user: User) -> User:
        user.id = len(self.rows) + 1
        user.token_version = 0
        self.rows[user.id] = user
        return user

    def get(self, id_: int) -> User | None:
        return self.rows.get(id_)

    def get_by_email(self, email: str) -> User | None:
        return next((u for u in self.rows.values() if u.email == email), None)

    def get_by_google_id(self, google_id: str) -> User | None:
        return next((u for u in self.rows.values() if u.google_id == google_id), None)


class PlainHasher:
    """Instant 'hashing' so unit tests don't spend 0.2s per bcrypt call."""

    def __init__(self) -> None:
        self.burned = 0

    def hash(self, password: str) -> str:
        return f"hashed:{password}"

    def verify(self, password: str, hashed: str) -> bool:
        return hashed == f"hashed:{password}"

    def burn(self, password: str) -> None:
        self.burned += 1


class Outbox:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []

    def send(self, to: str, subject: str, body: str) -> bool:
        self.sent.append((to, subject, body))
        return True


@pytest.fixture
def auth():
    settings = Settings(_env_file=None, login_max_failures=3)
    service = AuthService(
        session=FakeSession(),
        users=InMemoryUsers(),
        hasher=PlainHasher(),
        throttle=LoginThrottle(RateLimiter(), settings),
        email=Outbox(),
        settings=settings,
    )
    return service


def user_id_of(token: str) -> int:
    return int(read_token(token, ACCESS)["sub"])


def test_register_then_login(auth):
    token = auth.register("asha@example.com", "good-horse-9", "Asha")
    assert user_id_of(token) == 1
    assert user_id_of(auth.login("asha@example.com", "good-horse-9")) == 1


def test_register_rejects_duplicates_and_weak_passwords(auth):
    auth.register("asha@example.com", "good-horse-9", None)
    with pytest.raises(Conflict):
        auth.register("asha@example.com", "another-horse-9", None)
    with pytest.raises(InvalidInput, match="too common"):
        auth.register("new@example.com", "password123", None)


def test_unknown_email_still_spends_a_password_check(auth):
    with pytest.raises(Unauthorized):
        auth.login("nobody@example.com", "whatever")
    assert auth.hasher.burned == 1


def test_lockout_after_max_failures(auth):
    auth.register("asha@example.com", "good-horse-9", None)
    for _ in range(3):
        with pytest.raises(Unauthorized):
            auth.login("asha@example.com", "wrong-password")
    with pytest.raises(TooManyRequests) as locked:
        auth.login("asha@example.com", "good-horse-9")
    assert locked.value.retry_after > 0


def test_password_reset_email_and_single_use_link(auth):
    auth.register("asha@example.com", "good-horse-9", None)
    auth.request_password_reset("asha@example.com")
    auth.request_password_reset("nobody@example.com")  # silently ignored
    assert [to for to, _, _ in auth.email.sent] == ["asha@example.com"]

    token = auth.email.sent[0][2].split("token=")[1].split()[0]
    auth.reset_password(token, "brand-new-horse-9")
    with pytest.raises(Unauthorized, match="already been used"):
        auth.reset_password(token, "another-new-horse-9")
    assert user_id_of(auth.login("asha@example.com", "brand-new-horse-9")) == 1


def test_sign_out_everywhere_bumps_the_token_version(auth):
    auth.register("asha@example.com", "good-horse-9", None)
    user = auth.users.get(1)
    auth.sign_out_everywhere(user)
    assert user.token_version == 1


def test_google_sign_in_links_existing_account_by_email(auth):
    auth.register("asha@example.com", "good-horse-9", None)
    token = auth.google_sign_in(GoogleProfile("g-1", "asha@example.com", True, "Asha"))
    assert user_id_of(token) == 1
    assert auth.users.get(1).google_id == "g-1"
    with pytest.raises(UnverifiedGoogleEmail):
        auth.google_sign_in(GoogleProfile("g-2", "x@example.com", False, None))


# ------------------------------------------------------------ errors -> HTTP


@pytest.mark.parametrize(
    ("error", "status"),
    [
        (InvalidInput("x"), 400),
        (Unauthorized("x"), 401),
        (NotFound("x"), 404),
        (Conflict("x"), 409),
        (TooManyRequests("x", 5), 429),
        (NotConfigured("x"), 501),
        (UnverifiedGoogleEmail(), 400),  # subclasses inherit their parent's status
    ],
)
def test_domain_errors_map_to_status_codes(error, status):
    assert status_code_for(error) == status


# ------------------------------------------------------------ open/closed: narratives


def test_new_narrative_kinds_plug_in_without_changing_the_provider():
    from app.ai.providers.mock import NARRATIVE_TEMPLATES, MockProvider, narrative

    @narrative("streak_celebration")
    def _streak(context):
        return f"{context['days']} days in a row!"

    try:
        assert MockProvider().generate_narrative(kind="streak_celebration", context={"days": 5}) == "5 days in a row!"
    finally:
        NARRATIVE_TEMPLATES.pop("streak_celebration")


# ------------------------------------------------------------ ownership rule, through HTTP


def test_other_users_items_are_not_found(client):
    def token(email):
        r = client.post("/api/v1/auth/register", json={"email": email, "password": "correct-horse-9"})
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    alice, bob = token("alice@example.com"), token("bob@example.com")
    goal = client.post("/api/v1/goals", headers=alice, json={"category": "health", "title": "Run"}).json()
    update = client.post("/api/v1/updates", headers=alice, json={"content": "Went to the gym"}).json()
    event_id = update["events"][0]["id"]

    for method, path in [
        ("PATCH", f"/api/v1/goals/{goal['id']}"),
        ("DELETE", f"/api/v1/goals/{goal['id']}"),
        ("GET", f"/api/v1/updates/{update['id']}"),
        ("DELETE", f"/api/v1/updates/{update['id']}"),
        ("PATCH", f"/api/v1/events/{event_id}"),
        ("DELETE", f"/api/v1/events/{event_id}"),
    ]:
        response = client.request(method, path, headers=bob, json={} if method == "PATCH" else None)
        assert response.status_code == 404, (method, path)
        assert response.json()["detail"].endswith("not found")
