"""
HedgeCalc - Async Test Fixtures (Windows Selector Policy + Loop Stability Patch)
-------------------------------------------------------------------------------
Ensures deterministic async testing on Windows + Python 3.12 with asyncpg + SQLAlchemy.
Includes:
- SelectorEventLoopPolicy for Windows
- Engine disposal before loop close
- Full async teardown & cross-loop cleanup patch
"""

import os
import sys
import asyncio
import logging
import contextlib
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

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

from app.main import app
from app.core.db import async_engine, async_session_maker

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
# Extra safety: pytest session finish hook
# ---------------------------------------------------------------------
def pytest_sessionfinish(session, exitstatus):
    """Guarantee disposal even if pytest ends abruptly."""
    try:
        asyncio.run(async_engine.dispose())
    except Exception:
        pass
