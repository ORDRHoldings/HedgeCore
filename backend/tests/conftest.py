"""
HedgeCalc - Async Test Fixtures (Windows Selector Policy + Loop Stability Patch)
-------------------------------------------------------------------------------
Ensures deterministic async testing on Windows + Python 3.12 with asyncpg + SQLAlchemy.
Includes:
- SelectorEventLoopPolicy for Windows
- Engine disposal before loop close
- Full async teardown & cross-loop cleanup patch
"""

import asyncio
import contextlib
import logging
import os
import sys

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Disable CSRF for all tests — test clients don't send browser cookies.
# CSRF_DISABLED=1 is read by app/middleware/csrf.py at request time.
os.environ.setdefault("CSRF_DISABLED", "1")

# Disable API key middleware for all tests — auth is handled via dependency_overrides.
# API_KEY_AUTH_DISABLED=1 is read by app/middleware/api_key_auth.py at request time.
os.environ.setdefault("API_KEY_AUTH_DISABLED", "1")

# ---------------------------------------------------------------------
# Windows Selector Policy (avoid Proactor teardown errors)
# ---------------------------------------------------------------------
if sys.platform.startswith("win"):
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())  # type: ignore[attr-defined]
    except Exception:
        pass

# ---------------------------------------------------------------------
# Path Setup
# ---------------------------------------------------------------------
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
APP_DIR = os.path.join(BACKEND_DIR, "app")

for path in [PROJECT_ROOT, BACKEND_DIR, APP_DIR]:
    if path not in sys.path:
        sys.path.insert(0, path)

from app.core.db import async_engine, async_session_maker
from app.core.security import create_access_token
from app.main import app

# ---------------------------------------------------------------------
# Database Backend Detection
# ---------------------------------------------------------------------
_DB_URL = os.environ.get("DATABASE_URL", "")
IS_SQLITE = "sqlite" in _DB_URL.lower() or not _DB_URL
IS_POSTGRES = "postgres" in _DB_URL.lower()


# ---------------------------------------------------------------------
# AsyncSession mock compatibility shim
# ---------------------------------------------------------------------
# SQLAlchemy AsyncSession.add/add_all/delete are synchronous, but tests
# routinely mock the session with `AsyncMock()`, which makes those methods
# return un-awaited coroutines and emit RuntimeWarning. Patch AsyncMock so
# new instances expose those three names as MagicMock by default; tests
# that need different behavior can override afterwards.
import unittest.mock as _stdmock

_orig_AsyncMock_init = _stdmock.AsyncMock.__init__

def _async_mock_init_with_sync_session_methods(self, *args, **kwargs):
    _orig_AsyncMock_init(self, *args, **kwargs)
    if "spec" in kwargs or "spec_set" in kwargs or (args and args[0] is not None):
        return
    # SQLAlchemy AsyncSession: add/add_all are synchronous (delete is async)
    self.add = _stdmock.MagicMock()
    self.add_all = _stdmock.MagicMock()

_stdmock.AsyncMock.__init__ = _async_mock_init_with_sync_session_methods


def pytest_configure(config):
    config.addinivalue_line("markers", "requires_postgres: skip when not using PostgreSQL")


def pytest_collection_modifyitems(config, items):
    if IS_POSTGRES:
        return
    skip_pg = pytest.mark.skip(reason="Requires PostgreSQL (running SQLite)")
    for item in items:
        if "requires_postgres" in item.keywords:
            item.add_marker(skip_pg)

# ---------------------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------------------
os.makedirs("LOG", exist_ok=True)
logger = logging.getLogger("hedgecalc.tests")
if not logger.handlers:
    fh = logging.FileHandler("LOG/backend_tests.log", encoding="utf-8")
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] [%(name)s] %(message)s")
    fh.setFormatter(fmt)
    logger.addHandler(fh)
logger.setLevel(logging.DEBUG)

# ---------------------------------------------------------------------
# Event Loop Fixture - one loop per test
# ---------------------------------------------------------------------
@pytest_asyncio.fixture(scope="function")
def event_loop():
    """Create fresh loop per test and dispose engine before loop closes."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    try:
        async def _safe_dispose():
            with contextlib.suppress(Exception):
                await async_engine.dispose()
        loop.run_until_complete(_safe_dispose())

        pending = asyncio.all_tasks(loop)
        for t in pending:
            t.cancel()
        if pending:
            loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
    finally:
        with contextlib.suppress(Exception):
            loop.stop()
        with contextlib.suppress(Exception):
            loop.close()
        asyncio.set_event_loop(None)
        logger.info("Event loop closed cleanly (selector policy).")


@pytest.fixture(autouse=True)
def ensure_default_event_loop():
    """Keep legacy synchronous tests compatible with Python 3.12.

    Several older tests call asyncio.get_event_loop().run_until_complete(...)
    directly. Python 3.12 no longer creates a default loop implicitly, so
    provide one for sync tests that do not request the event_loop fixture.
    """
    created = False
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed event loop")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        created = True

    yield

    if created:
        with contextlib.suppress(Exception):
            loop.close()
        asyncio.set_event_loop(None)

# ---------------------------------------------------------------------
# Database Session Fixture
# ---------------------------------------------------------------------
@pytest_asyncio.fixture(scope="function")
async def db_session():
    """Provides isolated async session."""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            with contextlib.suppress(Exception):
                await session.close()
            logger.debug("Closed async SQLAlchemy session.")

# ---------------------------------------------------------------------
# FastAPI Async Client Fixture
# ---------------------------------------------------------------------
@pytest_asyncio.fixture(scope="function")
async def client(db_session):
    """Provides in-memory async FastAPI client (httpx>=0.28)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

# ---------------------------------------------------------------------
# Auth Headers Fixture (synthetic JWT for tests without real DB login)
# ---------------------------------------------------------------------
DEMO_USER_ID = "11111111-2222-3333-4444-555555555555"
DEMO_COMPANY_ID = "11111111-1111-1111-1111-111111111111"

@pytest.fixture
def auth_headers() -> dict:
    """Provide synthetic JWT auth headers for integration tests.

    Creates a valid JWT token using the app's own create_access_token(),
    so middleware will accept it. The user may not exist in DB (SQLite),
    so tests that hit DB-backed user lookups will still fail appropriately.
    """
    token = create_access_token(
        sub=DEMO_USER_ID,
        email="demo@test.com",
    )
    return {
        "Authorization": f"Bearer {token}",
        "X-API-Key": "HK_live_test_key_for_ci",
    }

# ---------------------------------------------------------------------
# Final Global Engine Disposal - After All Tests
# ---------------------------------------------------------------------
@pytest.fixture(scope="session", autouse=True)
def finalize_session(request):
    """Ensure async engine disposed cleanly at session end."""
    def fin():
        try:
            tmp_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(tmp_loop)
            async def _final_dispose():
                with contextlib.suppress(Exception):
                    await async_engine.dispose()
            tmp_loop.run_until_complete(_final_dispose())
        except Exception as e:
            logger.error(f"? Final disposal error: {e}")
        finally:
            with contextlib.suppress(Exception):
                tmp_loop.close()
            asyncio.set_event_loop(None)
            logger.info("? Final global async engine disposal complete.")
    request.addfinalizer(fin)

# ---------------------------------------------------------------------
# Asyncio Compatibility Patch (Python 3.12 + pytest-asyncio)
# ---------------------------------------------------------------------
@pytest.fixture(scope="session", autouse=True)
def fix_asyncio_cleanup():
    """Prevent 'Future attached to a different loop' / 'Event loop closed' errors."""
    yield
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            asyncio.set_event_loop(asyncio.new_event_loop())
    except RuntimeError:
        asyncio.set_event_loop(asyncio.new_event_loop())

# ---------------------------------------------------------------------
# Rate limiter reset — prevent cross-test state contamination
# ---------------------------------------------------------------------
@pytest.fixture(autouse=True)
def reset_rate_limiter_state():
    """Clear in-memory rate limiter buckets before each test.

    RateLimiterMiddleware._buckets is an instance dict on the middleware object
    embedded in the app's middleware stack. Without this reset, tests that make
    many requests (or deliberately exhaust the limit) bleed state into later
    tests, causing spurious 429 responses.
    """
    def _clear():
        try:
            from app.main import app
            from app.middleware.rate_limit import RateLimitMiddleware
            # Use app.middleware_stack — set lazily by Starlette on first dispatch.
            # build_middleware_stack() creates a NEW instance each call — wrong.
            stack = app.middleware_stack
            if stack is None:
                return
            node = stack
            while node is not None:
                if isinstance(node, RateLimitMiddleware):
                    node._buckets.clear()
                    break
                node = getattr(node, "app", None)
        except Exception:
            pass

    _clear()
    yield
    _clear()


# ---------------------------------------------------------------------
# Extra safety: pytest session finish hook
# ---------------------------------------------------------------------
def pytest_sessionfinish(session, exitstatus):
    """Guarantee disposal even if pytest ends abruptly."""
    try:
        asyncio.run(async_engine.dispose())
    except Exception:
        pass
