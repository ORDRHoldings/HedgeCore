"""
tests/test_db_migrations.py

Unit tests for app/core/db_migrations.py.
Covers the SQLite skip guard and the Alembic error fallback.
No real DB or Alembic required — all external calls are mocked.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


class TestRunAlembicUpgrade:

    def test_skips_on_sqlite_env_var(self, caplog):
        """DATABASE_URL containing 'sqlite' must skip Alembic and log info."""
        import logging
        from app.core.db_migrations import run_alembic_upgrade

        with patch.dict("os.environ", {"DATABASE_URL": "sqlite+aiosqlite:///:memory:"}), \
             patch("app.core.db_migrations.logger") as mock_log:
            run_alembic_upgrade()
            mock_log.info.assert_called_once()
            logged = mock_log.info.call_args[0][0]
            assert "sqlite" in logged.lower() or "skipped" in logged.lower()

    def test_skips_on_async_database_url_sqlite(self):
        """ASYNC_DATABASE_URL takes priority; sqlite in it triggers skip."""
        from app.core.db_migrations import run_alembic_upgrade

        with patch.dict("os.environ", {
            "ASYNC_DATABASE_URL": "sqlite+aiosqlite://:memory:",
            "DATABASE_URL": "postgresql://prod",
        }), patch("app.core.db_migrations.logger") as mock_log:
            run_alembic_upgrade()
            mock_log.info.assert_called_once()

    def test_calls_alembic_upgrade_on_postgres_url(self):
        """Non-SQLite URL: Alembic upgrade should be invoked."""
        from app.core.db_migrations import run_alembic_upgrade

        mock_config = MagicMock()
        mock_command = MagicMock()

        with patch.dict("os.environ", {"DATABASE_URL": "postgresql+asyncpg://localhost/test"}), \
             patch("app.core.db_migrations.logger"), \
             patch("app.core.db.DATABASE_URL", "postgresql+asyncpg://localhost/test"), \
             patch("alembic.config.Config", return_value=mock_config), \
             patch("alembic.command.upgrade", mock_command):
            run_alembic_upgrade()

        mock_command.assert_called_once_with(mock_config, "head")

    def test_non_fatal_on_alembic_error(self):
        """Alembic failure must be caught and logged as warning, not raised."""
        from app.core.db_migrations import run_alembic_upgrade

        with patch.dict("os.environ", {"DATABASE_URL": "postgresql+asyncpg://localhost/test"}), \
             patch("app.core.db.DATABASE_URL", "postgresql+asyncpg://localhost/test"), \
             patch("app.core.db_migrations.logger") as mock_log, \
             patch("alembic.config.Config", side_effect=RuntimeError("alembic not configured")):
            # Must not raise — Alembic errors are non-fatal at startup
            run_alembic_upgrade()
            mock_log.warning.assert_called_once()

    def test_url_sync_conversion_strips_asyncpg(self):
        """postgresql+asyncpg → postgresql+psycopg2 for the sync Alembic config."""
        from app.core.db_migrations import run_alembic_upgrade

        captured_url: list[str] = []

        def fake_config(ini_path):
            cfg = MagicMock()
            cfg.set_main_option.side_effect = lambda key, val: captured_url.append(val) if key == "sqlalchemy.url" else None
            return cfg

        with patch.dict("os.environ", {"DATABASE_URL": "postgresql+asyncpg://localhost/hedge"}), \
             patch("app.core.db.DATABASE_URL", "postgresql+asyncpg://localhost/hedge"), \
             patch("app.core.db_migrations.logger"), \
             patch("alembic.config.Config", side_effect=fake_config), \
             patch("alembic.command.upgrade"):
            run_alembic_upgrade()

        assert captured_url, "set_main_option should have been called"
        assert "+asyncpg" not in captured_url[0]
        assert "psycopg2" in captured_url[0]
