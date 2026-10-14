import logging

import pytest
from fastapi import APIRouter
from sqlalchemy import event, inspect, text
from sqlalchemy.exc import IntegrityError

import app.main as main
from app.db.session import engine

API = "/api/v1"


def register(client, email="ops@example.com") -> dict[str, str]:
    token = client.post(f"{API}/auth/register", json={"email": email, "password": "correct-horse-9"}).json()
    return {"Authorization": f"Bearer {token['access_token']}"}


# ------------------------------------------------------------ database


@pytest.mark.skipif(engine.dialect.name != "sqlite", reason="SQLite-only settings")
def test_sqlite_safety_settings_are_on(client):
    with engine.connect() as c:
        assert c.execute(text("PRAGMA foreign_keys")).scalar() == 1
        assert c.execute(text("PRAGMA journal_mode")).scalar() == "wal"
        assert c.execute(text("PRAGMA busy_timeout")).scalar() == 5000


def test_foreign_keys_are_enforced(client):
    with engine.begin() as c, pytest.raises(IntegrityError):
        c.execute(text("insert into updates (user_id, content, created_at) values (999999, 'orphan', '2026-01-01')"))


def test_per_user_indexes_exist(client):
    tables = ("updates", "events", "goals")
    indexes = {table: {i["name"] for i in inspect(engine).get_indexes(table)} for table in tables}
    assert "ix_updates_user_id_created_at" in indexes["updates"]
    assert "ix_events_user_id_created_at" in indexes["events"]
    assert "ix_goals_user_id" in indexes["goals"]


def count_queries(fn) -> int:
    count = [0]

    def listener(*_args):
        count[0] += 1

    event.listen(engine, "before_cursor_execute", listener)
    try:
        fn()
    finally:
        event.remove(engine, "before_cursor_execute", listener)
    return count[0]


def test_listing_updates_uses_a_fixed_number_of_queries(client):
    headers = register(client)
    client.post(f"{API}/updates", headers=headers, json={"content": "Went to the gym. Read a book."})
    few = count_queries(lambda: client.get(f"{API}/updates", headers=headers))
    for i in range(10):
        client.post(f"{API}/updates", headers=headers, json={"content": f"Went to the gym {i}. Read a book."})
    many = count_queries(lambda: client.get(f"{API}/updates", headers=headers))
    assert many == few  # no extra query per update (the N+1 problem)


# ------------------------------------------------------------ health + errors


def test_health_reports_database_problems(client, monkeypatch):
    def broken_connect(*_args, **_kwargs):
        raise OSError("database file is gone")

    monkeypatch.setattr(main.engine, "connect", broken_connect)
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "error", "database": "unreachable"}


def test_unexpected_errors_return_json_with_a_reference(client, caplog):
    boom = APIRouter()

    @boom.get("/api/v1/_boom")
    def explode():
        raise RuntimeError("kaboom")

    main.app.include_router(boom)
    try:
        with caplog.at_level(logging.ERROR, logger="app.errors"):
            response = client.get("/api/v1/_boom", headers={"Origin": "http://localhost:5173"})
    finally:
        main.app.router.routes = [r for r in main.app.router.routes if getattr(r, "path", "") != "/api/v1/_boom"]

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail.startswith("Something went wrong on our side. Reference: ")
    reference = detail.rsplit(" ", 1)[1]
    # the same reference is in the log, with the traceback
    assert reference in caplog.text and "kaboom" in caplog.text
    # CORS headers present, so the browser can actually read this error
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["x-content-type-options"] == "nosniff"
