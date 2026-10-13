import tempfile
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from app.core.config import DEFAULT_SECRET_KEY, InsecureConfigError, Settings, check_security
from app.db.base import Base
from app.db.migrate import ALEMBIC_INI, BASELINE_REVISION, run_migrations


@pytest.fixture
def fresh_engine():
    path = Path(tempfile.mkdtemp(prefix="jdc-migrate-")) / "m.db"
    engine = create_engine(f"sqlite:///{path}")
    yield engine
    engine.dispose()


def make_pre_migration_database(engine) -> None:
    """A database as the app created it before migrations existed: exactly the
    baseline schema, with no migration history table."""
    config = Config(str(ALEMBIC_INI))
    config.attributes["configure_logging"] = False
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, BASELINE_REVISION)
        connection.exec_driver_sql("DROP TABLE alembic_version")


def version(engine) -> str:
    with engine.connect() as c:
        return c.execute(text("select version_num from alembic_version")).scalar()


def test_migrations_match_the_models(fresh_engine):
    """Fails if a model changed without a migration: run
    `alembic revision --autogenerate -m "..."` from backend/ to create one."""
    run_migrations(fresh_engine)
    with fresh_engine.connect() as c:
        assert compare_metadata(MigrationContext.configure(c), Base.metadata) == []


def test_database_from_before_migrations_is_adopted_with_its_data(fresh_engine):
    make_pre_migration_database(fresh_engine)
    with fresh_engine.begin() as c:
        c.execute(text("insert into users (email, created_at) values ('old@example.com', '2026-01-01')"))

    run_migrations(fresh_engine)
    run_migrations(fresh_engine)  # running again is a no-op

    assert version(fresh_engine) is not None
    with fresh_engine.connect() as c:
        assert c.execute(text("select email from users")).scalar() == "old@example.com"


def test_existing_database_ends_at_the_latest_migration(fresh_engine):
    make_pre_migration_database(fresh_engine)
    run_migrations(fresh_engine)
    # later migrations were applied on top of the adopted baseline (e.g. users.token_version)
    assert "token_version" in {c["name"] for c in inspect(fresh_engine).get_columns("users")}
    # Stamped at the baseline, then upgraded through any later migrations.
    head = ScriptDirectory.from_config(Config(str(ALEMBIC_INI))).get_current_head()
    assert version(fresh_engine) == head
    assert ScriptDirectory.from_config(Config(str(ALEMBIC_INI))).get_revision(BASELINE_REVISION) is not None


def test_partial_database_is_refused(fresh_engine):
    Base.metadata.tables["users"].create(fresh_engine)
    with pytest.raises(RuntimeError, match="only some of JDC's tables"):
        run_migrations(fresh_engine)
    assert "events" not in inspect(fresh_engine).get_table_names()


# ------------------------------------------------------------ SECRET_KEY guard


def settings(**overrides) -> Settings:
    return Settings(_env_file=None, **overrides)


def test_default_secret_is_allowed_in_development_with_a_warning():
    warnings = check_security(settings(environment="development", secret_key=DEFAULT_SECRET_KEY))
    assert len(warnings) == 1 and "default" in warnings[0]


@pytest.mark.parametrize("secret", [DEFAULT_SECRET_KEY, "short-but-not-default"])
def test_weak_secret_is_refused_outside_development(secret):
    with pytest.raises(InsecureConfigError, match="SECRET_KEY"):
        check_security(settings(environment="production", secret_key=secret))


def test_strong_secret_passes_in_production():
    assert check_security(settings(environment="production", secret_key="x" * 48)) == []
