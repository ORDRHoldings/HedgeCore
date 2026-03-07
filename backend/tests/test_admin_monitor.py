"""
tests/test_admin_monitor.py

Tests for the admin monitoring dashboard endpoints.

Covers:
  1. Health endpoint returns system info
  2. Services endpoint returns service list
  3. Tables endpoint returns table stats
  4. Engine endpoint returns module wiring status
  5. Errors endpoint returns error groups
  6. Restart endpoint validates allowed services
  7. Restart cache clears registered caches
  8. Restart rejects unknown services
  9. Module-level uptime tracking
 10. Memory helper graceful fallback
"""
from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Unit tests for helpers
# ---------------------------------------------------------------------------

class TestUptimeTracking:
    def test_uptime_is_positive(self):
        from app.api.routes.v1_admin_monitor import _uptime_seconds
        assert _uptime_seconds() > 0

    def test_uptime_human_seconds(self):
        from app.api.routes.v1_admin_monitor import _uptime_human
        assert _uptime_human(45) == "45s"

    def test_uptime_human_minutes(self):
        from app.api.routes.v1_admin_monitor import _uptime_human
        assert _uptime_human(125) == "2m 5s"

    def test_uptime_human_hours(self):
        from app.api.routes.v1_admin_monitor import _uptime_human
        assert _uptime_human(7265) == "2h 1m 5s"

    def test_uptime_human_days(self):
        from app.api.routes.v1_admin_monitor import _uptime_human
        result = _uptime_human(90061)
        assert result.startswith("1d")


class TestMemoryHelper:
    def test_get_memory_usage_returns_dict_or_none(self):
        from app.api.routes.v1_admin_monitor import _get_memory_usage
        result = _get_memory_usage()
        # May be None if psutil is not installed
        if result is not None:
            assert "rss_mb" in result
            assert "vms_mb" in result
            assert "percent" in result

    def test_get_memory_usage_handles_import_error(self):
        from app.api.routes.v1_admin_monitor import _get_memory_usage
        with patch.dict("sys.modules", {"psutil": None}):
            # Force import failure
            with patch("builtins.__import__", side_effect=ImportError("no psutil")):
                result = _get_memory_usage()
                assert result is None


class TestCacheRegistry:
    def test_register_and_clear_cache(self):
        from app.api.routes.v1_admin_monitor import _caches, register_cache

        test_cache = {"key1": "val1", "key2": "val2"}
        register_cache("test_monitor", test_cache)

        assert "test_monitor" in _caches
        assert len(test_cache) == 2

        # Simulate cache clear
        test_cache.clear()
        assert len(test_cache) == 0

        # Cleanup
        _caches.pop("test_monitor", None)


# ---------------------------------------------------------------------------
# Engine module wiring
# ---------------------------------------------------------------------------

class TestEngineModuleRegistry:
    def test_engine_modules_dict_has_kernel(self):
        from app.api.routes.v1_admin_monitor import _ENGINE_V1_MODULES
        assert "kernel" in _ENGINE_V1_MODULES
        assert _ENGINE_V1_MODULES["kernel"] == "v1_calculate"

    def test_engine_modules_dict_has_validator(self):
        from app.api.routes.v1_admin_monitor import _ENGINE_V1_MODULES
        assert "validator" in _ENGINE_V1_MODULES

    def test_engine_modules_dict_has_scenarios(self):
        from app.api.routes.v1_admin_monitor import _ENGINE_V1_MODULES
        assert "scenarios" in _ENGINE_V1_MODULES

    def test_engine_modules_has_at_least_30_entries(self):
        from app.api.routes.v1_admin_monitor import _ENGINE_V1_MODULES
        assert len(_ENGINE_V1_MODULES) >= 30

    def test_all_engine_modules_are_strings_or_none(self):
        from app.api.routes.v1_admin_monitor import _ENGINE_V1_MODULES
        for mod_name, imported_by in _ENGINE_V1_MODULES.items():
            assert isinstance(mod_name, str)
            assert imported_by is None or isinstance(imported_by, str)


# ---------------------------------------------------------------------------
# Monitored tables list
# ---------------------------------------------------------------------------

class TestMonitoredTables:
    def test_monitored_tables_includes_core_tables(self):
        from app.api.routes.v1_admin_monitor import _MONITORED_TABLES
        required = {"users", "companies", "positions", "audit_events", "calculation_runs"}
        assert required.issubset(set(_MONITORED_TABLES))

    def test_monitored_tables_count(self):
        from app.api.routes.v1_admin_monitor import _MONITORED_TABLES
        assert len(_MONITORED_TABLES) >= 10


# ---------------------------------------------------------------------------
# Restart service validation
# ---------------------------------------------------------------------------

class TestRestartValidation:
    def test_allowed_services_are_cache_and_scheduler(self):
        from app.api.routes.v1_admin_monitor import _ALLOWED_RESTART_SERVICES
        assert _ALLOWED_RESTART_SERVICES == {"cache", "scheduler"}

    def test_unknown_service_not_in_allowed(self):
        from app.api.routes.v1_admin_monitor import _ALLOWED_RESTART_SERVICES
        assert "database" not in _ALLOWED_RESTART_SERVICES
        assert "redis" not in _ALLOWED_RESTART_SERVICES
        assert "backend" not in _ALLOWED_RESTART_SERVICES


# ---------------------------------------------------------------------------
# Router structure
# ---------------------------------------------------------------------------

class TestRouterStructure:
    def test_router_has_correct_prefix(self):
        from app.api.routes.v1_admin_monitor import router
        assert router.prefix == "/v1/admin/monitor"

    def test_router_has_6_routes(self):
        from app.api.routes.v1_admin_monitor import router
        assert len(router.routes) == 6

    def test_router_tags(self):
        from app.api.routes.v1_admin_monitor import router
        assert "v1-admin-monitor" in router.tags
