"""
app/core/logging_config.py
Unified logging configuration for ORDR Terminal API.

Features:
- production (ENV=production): JSON structured logging to stdout
- development/test: human-readable format + rotating file handler
- Auto-creation of LOG directory
"""

from __future__ import annotations

import json
import logging
import logging.handlers
import os
from datetime import UTC, datetime

from app.core.config import settings


class _JsonFormatter(logging.Formatter):
    """Emit each log record as a single JSON line (for production log aggregators)."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "ts": datetime.now(tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


LOG_DIR = os.path.dirname(settings.LOG_FILE)
os.makedirs(LOG_DIR, exist_ok=True)


def configure_logging() -> None:
    """Configure global logging for the entire application."""
    env = os.getenv("ENV", "development").lower()
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    if env == "production":
        # Production: JSON to stdout only (Render / Docker log aggregators)
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(_JsonFormatter())
        root_logger.addHandler(console_handler)
    else:
        # Development / test: human-readable format + rotating file
        formatter = logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        file_handler = logging.handlers.RotatingFileHandler(
            settings.LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
        )
        file_handler.setFormatter(formatter)
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)
        root_logger.addHandler(console_handler)

    # Reduce verbosity for third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    root_logger.info("? Logging configured (level=%s, env=%s)", settings.LOG_LEVEL, env)


# Initialize logging once on import
configure_logging()
