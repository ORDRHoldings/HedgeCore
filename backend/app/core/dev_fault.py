"""
app/core/dev_fault.py — Shared dev fault injection guard.

DEV-FAULT-1 Safety Belt
========================
Fault injection (forced HTTP 500 / synthetic chain-fail) is only active when
ALL THREE conditions hold simultaneously:

  1. ALLOW_DEV_FAULT_INJECTION=true  — explicit opt-in env var
  2. ENV / APP_ENV is dev/development/test  — non-production app env
  3. Request originates from localhost — strict IP/hostname allowlist

If ANY condition fails the guard returns False and the params are ignored
silently (no error, no detail leak).

Production safety:
  Render never sets ALLOW_DEV_FAULT_INJECTION, so condition 1 always fails
  in production regardless of request origin.  The ENV var is "production" on
  Render, so condition 2 also fails independently.  Double-guarded.

X-Forwarded-For:
  Only respected when TRUST_PROXY_HEADERS=true.  Default: false.
  When false, XFF cannot be used to fake locality.
"""
from __future__ import annotations

import os

from fastapi import Request

# ---------------------------------------------------------------------------
# Loopback address sets
# ---------------------------------------------------------------------------

_LOOPBACK_IPS: frozenset[str] = frozenset({
    "127.0.0.1",
    "::1",
    "0:0:0:0:0:0:0:1",   # IPv6 long-form loopback
    "::ffff:127.0.0.1",   # IPv4-mapped loopback
})

_LOOPBACK_HOSTNAMES: frozenset[str] = frozenset({
    "localhost",
    "127.0.0.1",
    "::1",
})

# ---------------------------------------------------------------------------
# Dev-env labels (any of these are accepted as "not production")
# ---------------------------------------------------------------------------

_DEV_ENVS: frozenset[str] = frozenset({
    "dev", "development", "test", "testing", "ci", "local",
})


# ---------------------------------------------------------------------------
# Public guard function
# ---------------------------------------------------------------------------

def is_dev_fault_allowed(request: Request | None) -> bool:
    """
    Return True iff all three conditions hold:
      1. ALLOW_DEV_FAULT_INJECTION=true
      2. ENV or APP_ENV is a recognised development environment label
      3. The request originates from a loopback address

    Parameters
    ----------
    request:
        The FastAPI Request object.  When None (e.g. unit tests with no
        request context) the function returns False — deny by default.

    Returns
    -------
    bool
        True  → fault injection may proceed.
        False → silently ignore the fault param (normal behaviour).
    """
    # ── Condition 1: env var explicit opt-in ─────────────────────────────────
    if os.getenv("ALLOW_DEV_FAULT_INJECTION", "false").lower() != "true":
        return False

    # ── Condition 2: app env is non-production ───────────────────────────────
    # ENV is the canonical HedgeCalc setting (see config.py).
    # APP_ENV is an alias some deployment scripts set.
    app_env = (
        os.getenv("ENV", os.getenv("APP_ENV", "dev"))
        .strip()
        .lower()
    )
    if app_env not in _DEV_ENVS:
        return False

    # ── Condition 3: localhost origin ────────────────────────────────────────
    if request is None:
        return False

    # 3a. Direct client IP (most reliable — not forgeable via headers)
    client_host: str = ""
    if request.client is not None:
        client_host = request.client.host or ""
    if client_host in _LOOPBACK_IPS:
        return True

    # 3b. URL hostname  (covers http://localhost:8000/... in dev)
    url_hostname = (request.url.hostname or "").lower().rstrip(".")
    if url_hostname in _LOOPBACK_HOSTNAMES:
        return True

    # 3c. X-Forwarded-For — ONLY when proxy trust is explicitly enabled
    if os.getenv("TRUST_PROXY_HEADERS", "false").lower() == "true":
        xff = request.headers.get("x-forwarded-for", "").strip()
        if xff:
            # Rightmost IP is the most trustworthy; we use leftmost (client)
            # because in a local dev proxy the client is still loopback.
            first_ip = xff.split(",")[0].strip()
            if first_ip in _LOOPBACK_IPS:
                return True

    return False


# ---------------------------------------------------------------------------
# Convenience raiser (for policy routes)
# ---------------------------------------------------------------------------

def raise_if_dev_fault(request: Request | None, code: int | None) -> None:
    """
    Raise HTTPException(code) if fault injection is allowed and code is set.
    Otherwise does nothing — callers see normal behaviour.
    """
    if code is None:
        return
    if not is_dev_fault_allowed(request):
        return
    from fastapi import HTTPException  # local import to avoid circular deps
    raise HTTPException(
        status_code=code,
        detail=f"[DEV FAULT INJECTION] Simulated HTTP {code}",
    )
