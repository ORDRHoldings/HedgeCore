"""
tests/test_sprint3_architecture.py
Sprint 3 — Architecture improvement validation

Covers:
  S3-1: Position.active_query() generates IS TRUE filter
  S3-2: User relationships lazy="raise" — verified in model source
  S3-3: selectinload added to get_current_user, get_current_user_optional, _get_user_or_401
  S3-4: Redis rate limiter has Lua script for atomic consume
  S3-5: REDIS_URL in Settings
"""

import sys
import os
import inspect

import pytest
from sqlalchemy import inspect as sa_inspect
from unittest.mock import MagicMock

# ── Path setup ────────────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))
BACKEND_DIR  = os.path.join(PROJECT_ROOT, "backend")
for p in [PROJECT_ROOT, BACKEND_DIR]:
    if p not in sys.path:
        sys.path.insert(0, p)

os.environ.setdefault("ALLOW_SQLITE_DEMO", "true")
os.environ.setdefault("JWT_SECRET", "***REDACTED_JWT_SECRET***")
os.environ.setdefault("ENV", "test")

pytestmark = pytest.mark.asyncio


# ══════════════════════════════════════════════════════════════════════════════
# S3-1: Position.active_query() soft-delete filter
# ══════════════════════════════════════════════════════════════════════════════

class TestPositionActiveQuery:
    """Unit tests for Position.active_query() classmethod."""

    def test_active_query_exists(self):
        from app.models.position import Position
        assert hasattr(Position, "active_query"), "active_query not found on Position"
        assert callable(Position.active_query)

    def test_active_query_returns_select_statement(self):
        from app.models.position import Position
        from sqlalchemy.sql import Select
        stmt = Position.active_query()
        assert isinstance(stmt, Select), "active_query must return a SQLAlchemy Select"

    def test_active_query_targets_positions_table(self):
        from app.models.position import Position
        stmt = Position.active_query()
        # The FROM clause should reference the positions table
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": False}))
        assert "positions" in compiled.lower()

    def test_active_query_includes_is_active_filter(self):
        from app.models.position import Position
        stmt = Position.active_query()
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": False}))
        # Should contain is_active = true filter
        assert "is_active" in compiled.lower()

    def test_active_query_can_chain_where(self):
        from app.models.position import Position
        import uuid
        company_id = uuid.uuid4()
        stmt = Position.active_query().where(Position.company_id == company_id)
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": False}))
        assert "is_active" in compiled.lower()
        assert "company_id" in compiled.lower()

    def test_active_query_can_chain_order_by(self):
        from app.models.position import Position
        stmt = Position.active_query().order_by(Position.created_at.desc())
        assert stmt is not None

    def test_active_query_different_from_full_select(self):
        """active_query must produce fewer results than a full SELECT (has WHERE filter)."""
        from app.models.position import Position
        from sqlalchemy import select
        full_stmt = select(Position)
        active_stmt = Position.active_query()
        full_compiled = str(full_stmt.compile(compile_kwargs={"literal_binds": False}))
        active_compiled = str(active_stmt.compile(compile_kwargs={"literal_binds": False}))
        # Active query has extra WHERE clause
        assert len(active_compiled) > len(full_compiled)


# ══════════════════════════════════════════════════════════════════════════════
# S3-2: User relationships lazy="raise"
# ══════════════════════════════════════════════════════════════════════════════

class TestUserRelationshipsLazyRaise:
    """Verify User model relationships use lazy='raise' to prevent N+1."""

    def test_user_model_source_has_lazy_raise(self):
        from app.models import user as user_mod
        source_path = inspect.getfile(user_mod)
        with open(source_path, "r", encoding="utf-8") as f:
            source = f.read()
        # Should have lazy="raise" for org relationships
        assert 'lazy="raise"' in source, "lazy=raise not found in user.py"

    def test_user_model_source_no_lazy_selectin_for_org(self):
        """company/branch/department relationships must NOT use lazy=selectin (N+1 risk)."""
        from app.models import user as user_mod
        source_path = inspect.getfile(user_mod)
        with open(source_path, "r", encoding="utf-8") as f:
            source = f.read()
        # The old lazy="selectin" for org relationships should be replaced
        # (refresh_tokens may still use selectin — that's ok)
        # We check that the org relationship lines specifically have lazy="raise"
        lines = source.splitlines()
        org_lines = [l for l in lines if
                     ("company" in l or "branch" in l or "department" in l)
                     and "relationship(" in l]
        for line in org_lines:
            assert 'lazy="raise"' in line, f"Org relationship not using lazy=raise: {line}"

    def test_user_model_has_comment_about_selectinload(self):
        """Model source should document how to load relationships explicitly."""
        from app.models import user as user_mod
        source_path = inspect.getfile(user_mod)
        with open(source_path, "r", encoding="utf-8") as f:
            source = f.read()
        assert "selectinload" in source, "No selectinload documentation in user.py"


# ══════════════════════════════════════════════════════════════════════════════
# S3-3: selectinload added to auth queries
# ══════════════════════════════════════════════════════════════════════════════

class TestSelectinloadInAuthQueries:
    """Verify get_current_user and _get_user_or_401 explicitly load org relationships."""

    def test_security_py_imports_selectinload(self):
        from app.core import security as sec_mod
        source_path = inspect.getfile(sec_mod)
        with open(source_path, "r", encoding="utf-8") as f:
            source = f.read()
        assert "selectinload" in source, "selectinload not imported in core/security.py"

    def test_security_py_get_current_user_uses_selectinload(self):
        from app.core import security as sec_mod
        source_path = inspect.getfile(sec_mod)
        with open(source_path, "r", encoding="utf-8") as f:
            source = f.read()
        # get_current_user must use selectinload for company, branch, department
        assert "selectinload(User.company)" in source
        assert "selectinload(User.branch)" in source
        assert "selectinload(User.department)" in source

    def test_security_py_optional_also_uses_selectinload(self):
        """get_current_user_optional must also load relationships explicitly."""
        from app.core import security as sec_mod
        source_path = inspect.getfile(sec_mod)
        with open(source_path, "r", encoding="utf-8") as f:
            source = f.read()
        # Should appear twice (once for each function)
        count = source.count("selectinload(")
        assert count >= 6, f"Expected at least 6 selectinload calls, found {count}"

    def test_auth_py_imports_selectinload(self):
        from app.api.routes import auth as auth_mod
        source_path = inspect.getfile(auth_mod)
        with open(source_path, "r", encoding="utf-8") as f:
            source = f.read()
        assert "selectinload" in source, "selectinload not found in auth.py"

    def test_auth_py_get_user_or_401_uses_selectinload(self):
        from app.api.routes import auth as auth_mod
        source_path = inspect.getfile(auth_mod)
        with open(source_path, "r", encoding="utf-8") as f:
            source = f.read()
        # _get_user_or_401 should have selectinload options
        assert "selectinload(User.company)" in source
        assert "selectinload(User.branch)" in source
        assert "selectinload(User.department)" in source


# ══════════════════════════════════════════════════════════════════════════════
# S3-4: Redis rate limiter Lua script
# ══════════════════════════════════════════════════════════════════════════════

class TestRedisRateLimiterLua:
    """Verify the Redis token bucket uses atomic Lua script."""

    def test_redis_bucket_has_lua_script(self):
        from app.middleware.rate_limit import _RedisTokenBucket
        # Check the Lua script is defined as class attribute
        assert hasattr(_RedisTokenBucket, "_LUA_CONSUME")
        lua = _RedisTokenBucket._LUA_CONSUME
        assert "KEYS[1]" in lua
        assert "ARGV" in lua
        assert "redis.call" in lua

    def test_lua_script_has_atomic_operations(self):
        from app.middleware.rate_limit import _RedisTokenBucket
        lua = _RedisTokenBucket._LUA_CONSUME
        assert "HMGET" in lua  # read tokens + last_refill atomically
        assert "HMSET" in lua  # write back atomically
        assert "EXPIRE" in lua  # key TTL for cleanup

    def test_redis_bucket_fail_open_on_exception(self):
        from app.middleware.rate_limit import _RedisTokenBucket
        mock_redis = MagicMock()
        mock_script = MagicMock(side_effect=Exception("Redis down"))
        mock_redis.register_script.return_value = mock_script

        bucket = _RedisTokenBucket(mock_redis, capacity=60, refill_rate=1.0)
        allowed, remaining = bucket.consume("test-key")

        assert allowed is True   # fail-open
        assert remaining == 60   # full capacity returned on error

    def test_redis_bucket_allowed_request(self):
        from app.middleware.rate_limit import _RedisTokenBucket
        mock_redis = MagicMock()
        mock_script = MagicMock(return_value=[1, 59])  # allowed=1, remaining=59
        mock_redis.register_script.return_value = mock_script

        bucket = _RedisTokenBucket(mock_redis, capacity=60, refill_rate=1.0)
        allowed, remaining = bucket.consume("test-key")

        assert allowed is True
        assert remaining == 59

    def test_redis_bucket_denied_request(self):
        from app.middleware.rate_limit import _RedisTokenBucket
        mock_redis = MagicMock()
        mock_script = MagicMock(return_value=[0, 0])  # allowed=0, remaining=0
        mock_redis.register_script.return_value = mock_script

        bucket = _RedisTokenBucket(mock_redis, capacity=60, refill_rate=1.0)
        allowed, remaining = bucket.consume("test-key")

        assert allowed is False
        assert remaining == 0


# ══════════════════════════════════════════════════════════════════════════════
# S3-5: REDIS_URL in Settings
# ══════════════════════════════════════════════════════════════════════════════

class TestRedisUrlInSettings:
    def test_settings_has_redis_url(self):
        from app.core.config import settings
        assert hasattr(settings, "REDIS_URL")

    def test_redis_url_defaults_to_none(self):
        from app.core.config import settings
        # Default is None (in-memory fallback)
        assert settings.REDIS_URL is None

    def test_main_py_passes_redis_url_to_middleware(self):
        """main.py must pass settings.REDIS_URL to RateLimitMiddleware."""
        main_path = os.path.join(BACKEND_DIR, "app", "main.py")
        with open(main_path, "r", encoding="utf-8") as f:
            source = f.read()
        assert "REDIS_URL" in source
        assert "redis_url" in source


# ══════════════════════════════════════════════════════════════════════════════
# Additional: apiBase shared utility (frontend)
# ══════════════════════════════════════════════════════════════════════════════

class TestApiBaseSharedUtility:
    """Verify frontend apiBase.ts is the single source of truth."""

    def test_apibase_file_exists(self):
        path = os.path.join(
            PROJECT_ROOT, "frontend", "src", "lib", "api", "apiBase.ts"
        )
        assert os.path.exists(path), "apiBase.ts not found"

    def test_apibase_exports_api_base(self):
        path = os.path.join(
            PROJECT_ROOT, "frontend", "src", "lib", "api", "apiBase.ts"
        )
        with open(path, "r", encoding="utf-8") as f:
            source = f.read()
        assert "export const API_BASE" in source
        assert "export function getApiBase" in source

    def test_dashboardclient_imports_from_apibase(self):
        path = os.path.join(
            PROJECT_ROOT, "frontend", "src", "lib", "api", "dashboardClient.ts"
        )
        with open(path, "r", encoding="utf-8") as f:
            source = f.read()
        assert 'from "@/lib/api/apiBase"' in source
        # Should not have duplicate inline URL resolution
        assert "_PROD_HOSTNAMES" not in source

    def test_authcontext_imports_from_apibase(self):
        path = os.path.join(
            PROJECT_ROOT, "frontend", "src", "lib", "authContext.tsx"
        )
        with open(path, "r", encoding="utf-8") as f:
            source = f.read()
        assert 'from "@/lib/api/apiBase"' in source
        # Old inline definition should be removed
        assert "const API_BASE = (" not in source
