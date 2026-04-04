"""
app/core/secret_validator.py

Startup validator — reject known-weak or placeholder secrets in production.
Called once during lifespan startup via validate_production_secrets().
"""

from __future__ import annotations

import logging
import os
import sys

logger = logging.getLogger(__name__)

# Patterns that indicate a placeholder or dev secret (case-insensitive)
_WEAK_PATTERNS = [
    "dev_",
    "change_me",
    "your-key-here",
    "placeholder",
    "example",
    "sk-your-",
    "test_secret",
    "ci_test",
    "minimum",
    "changeme",
    "xxxxx",
]


def validate_production_secrets() -> None:
    """Raise SystemExit on weak secrets if ENV=production. Warn otherwise."""
    env = os.getenv("ENV", "dev").strip().lower()
    is_prod = env == "production"

    required = {
        "JWT_SECRET": os.getenv("JWT_SECRET", ""),
        "DATABASE_URL": os.getenv("DATABASE_URL", ""),
        "API_KEY_PEPPER": os.getenv("API_KEY_PEPPER", "super-secret-pepper-change-me"),
    }

    # Optional — only validate if set
    optional = {
        "ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY", ""),
        "FINNHUB_API_KEY": os.getenv("FINNHUB_API_KEY", ""),
    }

    errors: list[str] = []

    for name, value in required.items():
        if not value:
            errors.append(f"{name} is empty")
            continue
        if name == "JWT_SECRET" and len(value) < 32:
            errors.append(f"{name} is too short ({len(value)} chars, need ≥32)")
        for pattern in _WEAK_PATTERNS:
            if pattern.lower() in value.lower():
                errors.append(f"{name} contains weak pattern '{pattern}'")
                break

    for name, value in optional.items():
        if not value:
            continue
        for pattern in _WEAK_PATTERNS:
            if pattern.lower() in value.lower():
                errors.append(f"{name} contains weak pattern '{pattern}'")
                break

    if errors:
        msg = "Secret validation failed:\n" + "\n".join(f"  - {e}" for e in errors)
        if is_prod:
            logger.critical(msg)
            sys.exit(1)  # Hard fail — do not start with weak secrets in production
        else:
            logger.warning(msg + "\n  (non-production — continuing with warning)")
