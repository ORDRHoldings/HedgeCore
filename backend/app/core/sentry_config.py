"""
app/core/sentry_config.py

Sentry SDK initialisation for ORDR Terminal backend.

Design decisions:
- No-op when SENTRY_DSN is unset (local dev / test env).
- PII scrubbing: strip email, name, password from all events.
- Capture tenant_id and user_id as tags (not as PII fields).
- traces_sample_rate=0.1 (10% of transactions).
"""
from __future__ import annotations

import logging
import os

_log = logging.getLogger(__name__)

# Fields to remove from event payloads to prevent PII leakage
_PII_FIELDS = frozenset(
    {
        "email",
        "username",
        "name",
        "first_name",
        "last_name",
        "password",
        "token",
        "user_email",
        "user_name",
    }
)


def scrub_pii_before_send(event: dict, hint: dict) -> dict:  # type: ignore[type-arg]
    """Sentry before_send hook — strip PII from event payloads.

    Mutates and returns the event dict with PII fields removed from:
    - event["user"]
    - event["request"]["data"]
    - event["extra"]
    """
    # Scrub user context
    user = event.get("user")
    if isinstance(user, dict):
        for field in _PII_FIELDS:
            user.pop(field, None)

    # Scrub request body / form data
    request = event.get("request")
    if isinstance(request, dict):
        data = request.get("data")
        if isinstance(data, dict):
            for field in _PII_FIELDS:
                data.pop(field, None)

    # Scrub extra context
    extra = event.get("extra")
    if isinstance(extra, dict):
        for field in list(extra.keys()):
            if field in _PII_FIELDS:
                del extra[field]

    return event


def init_sentry() -> bool:
    """Initialise Sentry SDK. Returns True if initialised, False if no-op.

    Designed to be called once at application startup (inside lifespan).
    Safe to call in test/dev environments where SENTRY_DSN is unset.
    """
    dsn = os.getenv("SENTRY_DSN", "").strip()

    if not dsn:
        _log.info("Sentry: SENTRY_DSN not set — error tracking disabled (no-op)")
        return False

    env = os.getenv("ENV", "dev")

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
        import logging as _logging

        sentry_sdk.init(
            dsn=dsn,
            environment=env,
            traces_sample_rate=0.1,
            before_send=scrub_pii_before_send,
            integrations=[
                FastApiIntegration(transaction_style="url"),
                SqlalchemyIntegration(),
                LoggingIntegration(
                    level=_logging.WARNING,
                    event_level=_logging.ERROR,
                ),
            ],
            # Do not send default PII (IP address, cookies, etc.)
            send_default_pii=False,
        )
        _log.info("Sentry: initialised (env=%s, dsn=...%s)", env, dsn[-8:])
        return True

    except ImportError:
        _log.warning(
            "Sentry: sentry-sdk not installed — pip install sentry-sdk[fastapi]"
        )
        return False
    except Exception as exc:
        _log.warning("Sentry: init failed (%s) — continuing without error tracking", exc)
        return False
