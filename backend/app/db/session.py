from collections.abc import Generator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

is_sqlite = settings.database_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}
# pool_pre_ping: transparently replace connections a database server dropped (Postgres
# restarts, idle timeouts) instead of failing the next request.
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=not is_sqlite)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def configure_sqlite(engine_: Engine) -> None:
    """SQLite ships with safety features switched off; turn them on for every connection.

    - foreign_keys: SQLite ignores FOREIGN KEY constraints unless asked, so nothing at
      the database level stopped orphaned rows (e.g. events pointing at a deleted update).
    - journal_mode=WAL: readers no longer block the writer and vice versa, which matters
      because the API serves requests from a thread pool.
    - busy_timeout: wait up to 5s for a lock instead of failing with "database is locked".
    """

    @event.listens_for(engine_, "connect")
    def _on_connect(dbapi_connection, _record) -> None:  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


if is_sqlite:
    configure_sqlite(engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
