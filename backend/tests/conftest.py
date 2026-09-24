import os
import tempfile

# Point the app at a throwaway SQLite file before anything imports settings.
_db_dir = tempfile.mkdtemp(prefix="jdc-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_db_dir}/test.db"
os.environ["AI_PROVIDER"] = "mock"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(bind=engine)
