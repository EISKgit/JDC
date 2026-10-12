import os
import tempfile

# Point the app at a throwaway SQLite file before anything imports settings.
_db_dir = tempfile.mkdtemp(prefix="jdc-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_db_dir}/test.db"
os.environ["AI_PROVIDER"] = "mock"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.core.rate_limit import limiter  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    limiter.reset()
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:  # startup runs the migrations
        yield test_client
    Base.metadata.drop_all(bind=engine)
    with engine.begin() as connection:
        # Forget the migration history too, so the next test migrates a truly empty DB.
        connection.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
