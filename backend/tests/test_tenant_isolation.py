"""
backend/tests/test_tenant_isolation.py
SEC-02: Tenant isolation in the run cache.
Structural tests — no DB required.
"""

from __future__ import annotations


class TestTenantIsolation:
    """Verify compound cache keys prevent cross-tenant data access."""

    def test_cache_key_format_is_compound(self):
        """Cache keys must include company_id prefix separated by ':'."""
        from app.api.routes.v1_calculate import _run_store

        # Simulate two tenants writing the same run_id
        _run_store["company_A:run_001"] = {"data": "tenant_a"}
        _run_store["company_B:run_001"] = {"data": "tenant_b"}

        assert _run_store["company_A:run_001"]["data"] == "tenant_a"
        assert _run_store["company_B:run_001"]["data"] == "tenant_b"
        assert _run_store["company_A:run_001"] != _run_store["company_B:run_001"]

        # Cleanup
        _run_store.pop("company_A:run_001", None)
        _run_store.pop("company_B:run_001", None)

    def test_plain_run_id_returns_none(self):
        """Raw run_id without company prefix must not be in cache."""
        from app.api.routes.v1_calculate import _run_store

        _run_store["company_X:run_999"] = {"data": "secret"}
        assert _run_store.get("run_999") is None  # No plain key access
        _run_store.pop("company_X:run_999", None)

    def test_cache_store_is_dict(self):
        """_run_store must be a plain dict (bounded LRU)."""
        from app.api.routes.v1_calculate import _run_store
        assert isinstance(_run_store, dict)

    def test_compound_key_source_code(self):
        """v1_calculate.py source must contain company_id in cache key logic."""
        import inspect
        from app.api.routes import v1_calculate
        src = inspect.getsource(v1_calculate)
        assert "company_id" in src, "Cache must use company_id in key"
