"""Tests for synex-kernel governance integration in TreasuryFX."""

import asyncio
import os
from unittest.mock import patch, MagicMock

import pytest


class TestKernelGovernance:
    """Test kernel governance layer alongside existing WORM chain."""

    def test_init_kernel(self, tmp_path):
        """Kernel initializes with SQLite and creates governance chain."""
        db_url = f"sqlite:///{tmp_path / 'kernel.db'}"

        with patch.dict(os.environ, {"SYNEX_KERNEL_DB_URL": db_url}):
            from app.core import kernel
            kernel._initialized = False
            kernel._engine = None
            kernel._session_factory = None

            kernel.init_kernel()
            assert kernel._initialized is True

    def test_kernel_health(self, tmp_path):
        """Kernel health returns valid status after init."""
        db_url = f"sqlite:///{tmp_path / 'kernel.db'}"

        with patch.dict(os.environ, {"SYNEX_KERNEL_DB_URL": db_url}):
            from app.core import kernel
            kernel._initialized = False
            kernel._engine = None
            kernel._session_factory = None

            kernel.init_kernel()
            health = kernel.kernel_health()
            assert health["status"] == "alive"
            assert health["chain_valid"] is True
            assert health["chain_length"] >= 1
            assert health["limb_id"] == "synexfund-treasuryfx"

    def test_governance_event(self, tmp_path):
        """Governance events are appended to kernel chain."""
        db_url = f"sqlite:///{tmp_path / 'kernel.db'}"

        with patch.dict(os.environ, {"SYNEX_KERNEL_DB_URL": db_url}):
            from app.core import kernel
            kernel._initialized = False
            kernel._engine = None
            kernel._session_factory = None

            kernel.init_kernel()
            initial = kernel.kernel_health()["chain_length"]

            kernel.audit_governance_event("policy_epoch_change", {
                "old_epoch": 1,
                "new_epoch": 2,
            })

            updated = kernel.kernel_health()["chain_length"]
            assert updated == initial + 1

    def test_kernel_health_not_initialized(self):
        """Health returns not_initialized when kernel is not set up."""
        from app.core import kernel
        kernel._initialized = False
        kernel._engine = None
        kernel._session_factory = None

        health = kernel.kernel_health()
        assert health["status"] == "not_initialized"

    def test_sync_url_conversion(self):
        """Async DB URLs are converted to sync."""
        from app.core.kernel import _get_sync_db_url

        with patch.dict(os.environ, {
            "SYNEX_KERNEL_DB_URL": "postgresql+asyncpg://user:pass@host/db"
        }):
            url = _get_sync_db_url()
            assert "asyncpg" not in url
            assert url == "postgresql://user:pass@host/db"

        with patch.dict(os.environ, {
            "SYNEX_KERNEL_DB_URL": "sqlite+aiosqlite:///test.db"
        }):
            url = _get_sync_db_url()
            assert "aiosqlite" not in url

    def test_coexistence_with_existing_worm(self, tmp_path):
        """Kernel chain and existing audit_events can coexist."""
        db_url = f"sqlite:///{tmp_path / 'kernel.db'}"

        with patch.dict(os.environ, {"SYNEX_KERNEL_DB_URL": db_url}):
            from app.core import kernel
            kernel._initialized = False
            kernel._engine = None
            kernel._session_factory = None

            kernel.init_kernel()

            # Verify kernel tables exist
            from sqlalchemy import inspect
            inspector = inspect(kernel._engine)
            tables = inspector.get_table_names()
            assert "synex_audit_chain" in tables
            assert "synex_healing_log" in tables

            # Log multiple governance events
            for i in range(5):
                kernel.audit_governance_event(f"test_event_{i}", {"index": i})

            health = kernel.kernel_health()
            assert health["chain_valid"] is True
            assert health["chain_length"] >= 6  # genesis + init + 5 events

    def test_collect_health(self, tmp_path):
        """_collect_health builds a valid HealthReport."""
        db_url = f"sqlite:///{tmp_path / 'kernel.db'}"

        with patch.dict(os.environ, {"SYNEX_KERNEL_DB_URL": db_url}):
            from app.core import kernel
            kernel._initialized = False
            kernel._engine = None
            kernel._session_factory = None

            kernel.init_kernel()
            report = kernel._collect_health()
            assert report.limb_id == "synexfund-treasuryfx"
            assert report.status.value in ("alive", "degraded")
            assert report.uptime_seconds >= 0

    def test_send_beacon_no_core_url(self, tmp_path):
        """_send_beacon is a no-op when SYNEX_CORE_URL is not set."""
        db_url = f"sqlite:///{tmp_path / 'kernel.db'}"

        with patch.dict(os.environ, {"SYNEX_KERNEL_DB_URL": db_url}, clear=False):
            os.environ.pop("SYNEX_CORE_URL", None)
            from app.core import kernel
            kernel._initialized = False
            kernel._engine = None
            kernel._session_factory = None

            kernel.init_kernel()
            report = kernel._collect_health()
            kernel._send_beacon(report)  # should not raise

    @pytest.mark.asyncio
    async def test_start_heartbeat_no_core_url(self, tmp_path):
        """start_heartbeat is a no-op when SYNEX_CORE_URL is not set."""
        db_url = f"sqlite:///{tmp_path / 'kernel.db'}"

        with patch.dict(os.environ, {"SYNEX_KERNEL_DB_URL": db_url}, clear=False):
            os.environ.pop("SYNEX_CORE_URL", None)
            from app.core import kernel
            kernel._initialized = False
            kernel._engine = None
            kernel._session_factory = None
            kernel._heartbeat = None

            kernel.init_kernel()
            await kernel.start_heartbeat()
            assert kernel._heartbeat is None

    @pytest.mark.asyncio
    async def test_start_stop_heartbeat(self, tmp_path):
        """Heartbeat starts and stops cleanly with a Core URL."""
        db_url = f"sqlite:///{tmp_path / 'kernel.db'}"

        with patch.dict(os.environ, {
            "SYNEX_KERNEL_DB_URL": db_url,
            "SYNEX_CORE_URL": "http://localhost:8100",
        }):
            from app.core import kernel
            kernel._initialized = False
            kernel._engine = None
            kernel._session_factory = None
            kernel._heartbeat = None

            kernel.init_kernel()
            await kernel.start_heartbeat()
            assert kernel._heartbeat is not None
            assert kernel._heartbeat._running is True

            await kernel.stop_heartbeat()
            assert kernel._heartbeat is None


class TestGovernanceMiddleware:
    """Test governance middleware budget costs and exemptions."""

    def test_budget_cost_lookup(self):
        """Budget costs are assigned per route category."""
        from app.middleware.governance import _get_budget_cost
        # Compute-heavy routes cost more
        assert _get_budget_cost("/api/v1/calculate/pnl", "GET") == 20
        assert _get_budget_cost("/api/v1/calculate/pnl", "POST") == 60  # 20 * 3
        assert _get_budget_cost("/api/v1/hedge/optimize", "POST") == 45  # 15 * 3
        assert _get_budget_cost("/api/v1/audit/events", "GET") == 1
        # Default cost for unknown routes
        assert _get_budget_cost("/api/v1/unknown", "GET") == 1

    def test_exempt_routes(self):
        """Health, auth, and system routes are exempt."""
        from app.middleware.governance import EXEMPT_PREFIXES
        exempt_paths = [
            "/health", "/api/system/health", "/api/docs",
            "/api/v1/auth/login", "/api/v1/public/stats",
        ]
        for path in exempt_paths:
            assert any(path.startswith(p) for p in EXEMPT_PREFIXES), f"{path} should be exempt"

    def test_governance_check_consumes_budget(self, tmp_path):
        """governance_check() consumes budget."""
        db_url = f"sqlite:///{tmp_path / 'kernel.db'}"
        with patch.dict(os.environ, {"SYNEX_KERNEL_DB_URL": db_url}):
            from app.core import kernel
            kernel._initialized = False
            kernel._engine = None
            kernel._session_factory = None
            kernel.init_kernel()

            initial = kernel._governance.budget.remaining
            kernel.governance_check(budget_cost=100)
            assert kernel._governance.budget.remaining == initial - 100

    def test_kill_switch_blocks_governance_check(self, tmp_path):
        """governance_check() raises after kill switch activation."""
        db_url = f"sqlite:///{tmp_path / 'kernel.db'}"
        with patch.dict(os.environ, {"SYNEX_KERNEL_DB_URL": db_url}):
            from app.core import kernel
            kernel._initialized = False
            kernel._engine = None
            kernel._session_factory = None
            kernel.init_kernel()

            kernel._governance.kill_switch.activate("test amputation")
            with pytest.raises(Exception, match="amputated|kill"):
                kernel.governance_check(budget_cost=1)

            # Clean up
            kernel._initialized = False


class TestPolicyEnforcement:
    """Test policy enforcer integration."""

    def test_bootstrap_enforcer_builds(self):
        """Bootstrap enforcer builds with all TreasuryFX route rules."""
        from app.core.policy_rules import build_bootstrap_enforcer
        enforcer = build_bootstrap_enforcer()
        assert enforcer is not None
        assert enforcer.rule_count == 23  # 22 routes + 1 default

    def test_match_sig_resolution(self):
        """Route paths resolve to correct match signatures."""
        from app.core.policy_rules import get_match_sig, SIG_CALCULATE, SIG_HEDGE, SIG_DEFAULT
        assert get_match_sig("/api/v1/calculate/pnl") == SIG_CALCULATE
        assert get_match_sig("/api/v1/hedge/optimize") == SIG_HEDGE
        assert get_match_sig("/api/v1/unknown") == SIG_DEFAULT

    def test_enforcer_matches_compute_routes(self):
        """Enforcer assigns higher budget costs to compute-heavy routes."""
        from app.core.policy_rules import build_bootstrap_enforcer, SIG_CALCULATE, SIG_HEDGE, SIG_AUDIT
        enforcer = build_bootstrap_enforcer()
        assert enforcer.evaluate(SIG_CALCULATE).budget_cost == 20
        assert enforcer.evaluate(SIG_HEDGE).budget_cost == 15
        assert enforcer.evaluate(SIG_AUDIT).budget_cost == 1

    def test_governance_check_with_policy(self, tmp_path):
        """governance_check with match_sig enforces policy + consumes budget."""
        db_url = f"sqlite:///{tmp_path / 'kernel.db'}"
        with patch.dict(os.environ, {"SYNEX_KERNEL_DB_URL": db_url}):
            from app.core import kernel
            kernel._initialized = False
            kernel._engine = None
            kernel._session_factory = None
            kernel._governance = None
            kernel.init_kernel()

            assert kernel._governance.enforcer is not None
            from app.core.policy_rules import SIG_CALCULATE
            initial = kernel._governance.budget.remaining
            kernel.governance_check(match_sig=SIG_CALCULATE, budget_cost=0)
            assert kernel._governance.budget.remaining == initial - 20
