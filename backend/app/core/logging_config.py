"""
app/core/logging_config.py
Unified logging configuration for HedgeCalc API.

Features:
- RotatingFileHandler for persistent logs (LOG/backend.log)
- StreamHandler for console output (colorized when available)
- Structured formatter with timestamps, level, module, message
- Auto-creation of LOG directory
"""

from __future__ import annotations
import logging
import logging.handlers
import os
from app.core.config import settings

LOG_DIR = os.path.dirname(settings.LOG_FILE)
os.makedirs(LOG_DIR, exist_ok=True)

def configure_logging() -> None:
    """Configure global logging for the entire application."""
    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # File handler (rotates at 5 MB, keeps 5 backups)
    file_handler = logging.handlers.RotatingFileHandler(
        settings.LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(formatter)

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

    # Reduce verbosity for third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    root_logger.info("? Logging configured (level=%s)", settings.LOG_LEVEL)

# Initialize logging once on import
configure_logging()
