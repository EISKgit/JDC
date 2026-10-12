"""Bring the database schema up to date on startup (Alembic `upgrade head`).

`Base.metadata.create_all` only creates *missing tables*; it never adds a new
column to an existing one, so the first model change would have broken every
existing database. Migrations (backend/migrations/versions/) record each schema
change as a step, and `upgrade head` applies whichever steps a database hasn't
had yet.
"""

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, inspect

from app import models  # noqa: F401 — registers every table on Base.metadata
from app.db.base import Base

logger = logging.getLogger(__name__)

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"
# The first migration: exactly the schema databases had before migrations existed.
BASELINE_REVISION = "87898b467109"


def run_migrations(engine: Engine) -> None:
    config = Config(str(ALEMBIC_INI))
    config.attributes["configure_logging"] = False

    with engine.begin() as connection:
        config.attributes["connection"] = connection
        existing = set(inspect(connection).get_table_names())
        app_tables = set(Base.metadata.tables)

        if "alembic_version" not in existing and existing & app_tables:
            if not app_tables <= existing:
                raise RuntimeError(
                    "The database has only some of JDC's tables and no migration history "
                    f"(missing: {sorted(app_tables - existing)}). Back it up and start from an empty database."
                )
            # A database created by the old create_all() startup: its schema is the
            # baseline, so record that instead of trying to create the tables again.
            logger.info("Existing database without migration history: marking it as %s", BASELINE_REVISION)
            command.stamp(config, BASELINE_REVISION)

        command.upgrade(config, "head")
