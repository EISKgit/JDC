import os
import tempfile

# Point the app at a throwaway database before anything imports settings: a temporary
# SQLite file by default, or TEST_DATABASE_URL (e.g. a Postgres container) when set,
# so the same suite proves the app works on both. CI runs it both ways.
_db_dir = tempfile.mkdtemp(prefix="jdc-tests-")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_db_dir}/test.db"
os.environ["AI_PROVIDER"] = "mock"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.api.deps import get_email_sender  # noqa: E402
from app.core.rate_limit import limiter  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    limiter.reset()
    yield


class Outbox:
    """An EmailSender that keeps messages in memory instead of sending them."""

    def __init__(self) -> None:
        self.messages: list[tuple[str, str, str]] = []

    def send(self, to: str, subject: str, body: str) -> bool:
        self.messages.append((to, subject, body))
        return True


@pytest.fixture
def outbox() -> Outbox:
    """Swap the real email sender for an in-memory one, via FastAPI dependency overrides
    (the services receive their sender; nothing needs monkeypatching)."""
    fake = Outbox()
    app.dependency_overrides[get_email_sender] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_email_sender, None)


@pytest.fixture
def client():
    with TestClient(app) as test_client:  # startup runs the migrations
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    with engine.begin() as connection:
        # Forget the migration history too, so the next test migrates a truly empty DB.
        connection.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
