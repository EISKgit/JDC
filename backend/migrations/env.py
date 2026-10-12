"""Alembic environment: migrates the database the app itself is configured for.

Run from backend/:
    .venv/Scripts/alembic.exe upgrade head        # apply migrations
    .venv/Scripts/alembic.exe revision --autogenerate -m "add x"   # after changing a model

The app also runs `upgrade head` on startup (app/db/migrate.py), so local users
never need to run these by hand.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app import models  # noqa: F401 — registers every table on Base.metadata
from app.core.config import get_settings
from app.db.base import Base

config = context.config
# Only configure logging when run from the alembic CLI; when the app runs migrations
# on startup, its own (uvicorn) logging must not be replaced.
if config.config_file_name is not None and config.attributes.get("configure_logging", True):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _url() -> str:
    return config.attributes.get("database_url") or get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        _run(connection)
        return
    connectable = engine_from_config({"sqlalchemy.url": _url()}, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as conn:
        _run(conn)


def _run(connection) -> None:
    # SQLite can't ALTER most column properties in place; batch mode makes Alembic
    # rebuild the table (copy, swap) so future migrations work on SQLite too.
    context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
