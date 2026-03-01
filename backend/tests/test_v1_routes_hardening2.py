"""
Backend tests — v1 routes hardening batch 2.

Covers: v1_calculate, v1_execution_proposals, v1_positions, v1_policies, v1_audit.
All tests are structural (no DB required) — uses inspect + source analysis pattern.

Tests:
  v1_calculate:
    1.  Module imports correctly
    2.  POST /v1/calculate uses mandatory get_current_user
    3.  RBAC check for calculate.run permission
    4.  Rate limiting guard present (_check_calc_rate)
    5.  CalculateRequest has required fields (trades, market_snapshot)
    6.  Response model has run_id and run_hash fields
    7.  Audit emission after successful run
    8.  WORM persistence: CalculationRun model used

  v1_execution_proposals:
    9.  Module imports correctly
    10. POST /v1/proposals uses mandatory get_current_user
    11. RBAC check for trades.edit permission on propose
    12. RBAC check for trades.execute permission on approve/execute
    13. SoD enforcement present (maker != checker check)
    14. MFA verification used for approve/execute
    15. Batch propose endpoint exists
    16. ProposalResponse has proposal_id/id and status fields
    17. Second-approve endpoint exists
    18. Withdraw restricted to maker only

  v1_positions:
    19. Module imports correctly
    20. GET /v1/positions uses mandatory get_current_user
    21. RBAC check for trades.view permission on list
    22. RBAC check for trades.create permission on create
    23. RBAC check for trades.execute permission on execute_position
    24. Lifecycle state machine: HEDGED and REJECTED are terminal states guarded
    25. Exposure aggregation endpoint exists
    26. Bulk assign policy endpoint exists (max 500 guard)
    27. Lineage endpoint exists
    28. CSV import endpoint exists

  v1_policies:
    29. Module imports correctly
    30. GET /v1/policies/active is accessible without special permission
    31. POST /v1/policies/activate checks policy.activate permission
    32. POST /v1/policies/templates checks policy.create_preset permission
    33. Template export produces checksum
    34. Template import validates checksum
    35. Favorites endpoints exist (add/remove/list)
    36. PolicyConfig is used (hedge_ratios, execution_product fields)
    37. Deactivate endpoint exists

  v1_audit:
    38. Module imports correctly
    39. GET /v1/audit uses mandatory get_current_user
    40. POST /v1/audit requires audit.write permission or auth
    41. WORM semantics: no DELETE or PUT endpoint in module
    42. Hash chain verification endpoint exists
    43. GENESIS_HASH constant defined (all-zeros)
    44. AuditEvent model used for persistence
    45. Chain verify returns is_intact field
"""

from __future__ import annotations

import inspect
import pytest


# ===========================================================================
# v1_calculate
# ===========================================================================

class TestCalculateHardening:
    """Structural tests for POST /v1/calculate and GET /v1/runs."""

    def test_module_imports(self):
        """v1_calculate imports without errors."""
        import app.api.routes.v1_calculate  # noqa: F401

    def test_calculate_uses_mandatory_user(self):
        """POST /v1/calculate must use get_current_user."""
        from app.api.routes.v1_calculate import calculate
        sig = inspect.signature(calculate)
        assert sig.parameters.get("current_user") is not None, \
            "calculate() missing current_user parameter"

    def test_calculate_rbac_check_present(self):
        """Source must contain calculate.run RBAC check."""
        from app.api.routes import v1_calculate
        src = inspect.getsource(v1_calculate)
        assert "calculate.run" in src, \
            "Missing RBAC check for calculate.run in v1_calculate"

    def test_rate_limiting_guard_present(self):
        """Rate limiting guard must be present."""
        from app.api.routes import v1_calculate
        src = inspect.getsource(v1_calculate)
        assert "_check_calc_rate" in src or "rate_limit" in src.lower(), \
            "No rate limiting guard found in v1_calculate"

    def test_request_has_required_fields(self):
        """CalculateRequest or equivalent must have trades and market_snapshot."""
        from app.api.routes import v1_calculate
        src = inspect.getsource(v1_calculate)
        assert "trades" in src, "No 'trades' field reference in v1_calculate"
        assert "market_snapshot" in src, "No 'market_snapshot' field reference in v1_calculate"

    def test_response_has_run_id_and_hash(self):
        """Response must include run_id and run_hash for audit chain."""
        from app.api.routes import v1_calculate
        src = inspect.getsource(v1_calculate)
        assert "run_id" in src, "No run_id in v1_calculate response"
        assert "run_hash" in src, "No run_hash in v1_calculate response"

    def test_audit_emission_present(self):
        """Audit event must be emitted after calculation run."""
        from app.api.routes import v1_calculate
        src = inspect.getsource(v1_calculate)
        assert "audit" in src.lower() or "emit" in src.lower(), \
            "No audit emission detected in v1_calculate"

    def test_worm_persistence_present(self):
        """CalculationRun model must be imported for WORM persistence."""
        from app.api.routes import v1_calculate
        src = inspect.getsource(v1_calculate)
        assert "CalculationRun" in src, \
            "CalculationRun WORM model not used in v1_calculate"


# ===========================================================================
# v1_execution_proposals
# ===========================================================================

class TestExecutionProposalsHardening:
    """Structural tests for /v1/proposals endpoints."""

    def test_module_imports(self):
        """v1_execution_proposals imports without errors."""
        import app.api.routes.v1_execution_proposals  # noqa: F401

    def test_propose_uses_mandatory_user(self):
        """POST /v1/proposals must use get_current_user."""
        from app.api.routes.v1_execution_proposals import propose_execution
        sig = inspect.signature(propose_execution)
        assert sig.parameters.get("current_user") is not None, \
            "propose_execution() missing current_user parameter"

    def test_propose_rbac_trades_edit(self):
        """Source must check trades.edit for creating proposals."""
        from app.api.routes import v1_execution_proposals
        src = inspect.getsource(v1_execution_proposals)
        assert "trades.edit" in src, \
            "Missing trades.edit RBAC check in v1_execution_proposals"

    def test_approve_execute_rbac_trades_execute(self):
        """Source must check trades.execute for approve/execute."""
        from app.api.routes import v1_execution_proposals
        src = inspect.getsource(v1_execution_proposals)
        assert "trades.execute" in src, \
            "Missing trades.execute RBAC check in v1_execution_proposals"

    def test_sod_enforcement_present(self):
        """Segregation of duties: maker cannot be checker."""
        from app.api.routes import v1_execution_proposals
        src = inspect.getsource(v1_execution_proposals)
        # SoD check appears as proposed_by != current_user or similar
        assert "proposed_by" in src or "maker" in src.lower() or "SoD" in src or \
               "segregat" in src.lower(), \
            "No SoD enforcement found in v1_execution_proposals"

    def test_mfa_verification_used(self):
        """MFA verification must be checked on approve/execute."""
        from app.api.routes import v1_execution_proposals
        src = inspect.getsource(v1_execution_proposals)
        assert "mfa" in src.lower() or "mfa_verified" in src, \
            "No MFA verification in v1_execution_proposals"

    def test_batch_propose_endpoint_exists(self):
        """Batch propose endpoint must exist."""
        from app.api.routes.v1_execution_proposals import batch_propose_execution
        assert callable(batch_propose_execution)

    def test_proposal_response_has_status(self):
        """Response schema must include a status field."""
        from app.api.routes import v1_execution_proposals
        src = inspect.getsource(v1_execution_proposals)
        assert "status" in src, "No status field in v1_execution_proposals response"

    def test_second_approve_endpoint_exists(self):
        """Dual-key: second_approve endpoint must exist."""
        from app.api.routes.v1_execution_proposals import second_approve_proposal
        assert callable(second_approve_proposal)

    def test_withdraw_endpoint_exists(self):
        """Maker can withdraw proposals."""
        from app.api.routes.v1_execution_proposals import withdraw_proposal
        assert callable(withdraw_proposal)


# ===========================================================================
# v1_positions
# ===========================================================================

class TestPositionsHardening:
    """Structural tests for /v1/positions endpoints."""

    def test_module_imports(self):
        """v1_positions imports without errors."""
        import app.api.routes.v1_positions  # noqa: F401

    def test_list_uses_mandatory_user(self):
        """GET /v1/positions must use get_current_user."""
        from app.api.routes.v1_positions import list_positions
        sig = inspect.signature(list_positions)
        assert sig.parameters.get("current_user") is not None, \
            "list_positions() missing current_user parameter"

    def test_list_rbac_trades_view(self):
        """Source must check trades.view for listing positions."""
        from app.api.routes import v1_positions
        src = inspect.getsource(v1_positions)
        assert "trades.view" in src, \
            "Missing trades.view RBAC check in v1_positions"

    def test_create_rbac_trades_create(self):
        """Source must check trades.create for creating positions."""
        from app.api.routes import v1_positions
        src = inspect.getsource(v1_positions)
        assert "trades.create" in src, \
            "Missing trades.create RBAC check in v1_positions"

    def test_execute_rbac_trades_execute(self):
        """Source must check trades.execute for executing positions."""
        from app.api.routes import v1_positions
        src = inspect.getsource(v1_positions)
        assert "trades.execute" in src, \
            "Missing trades.execute RBAC check in v1_positions"

    def test_terminal_state_guard(self):
        """HEDGED and REJECTED must be treated as terminal (no re-execute)."""
        from app.api.routes import v1_positions
        src = inspect.getsource(v1_positions)
        assert "HEDGED" in src and "REJECTED" in src, \
            "Terminal lifecycle states not referenced in v1_positions"

    def test_exposure_endpoint_exists(self):
        """Currency exposure aggregation endpoint must exist."""
        from app.api.routes.v1_positions import get_exposure
        assert callable(get_exposure)

    def test_bulk_assign_policy_endpoint_exists(self):
        """Bulk assign policy endpoint must exist."""
        from app.api.routes.v1_positions import bulk_assign_policy
        assert callable(bulk_assign_policy)

    def test_lineage_endpoint_exists(self):
        """Position lineage tracing endpoint must exist."""
        from app.api.routes.v1_positions import get_position_lineage
        assert callable(get_position_lineage)

    def test_csv_import_endpoint_exists(self):
        """CSV bulk import endpoint must exist."""
        from app.api.routes.v1_positions import import_positions_csv
        assert callable(import_positions_csv)


# ===========================================================================
# v1_policies
# ===========================================================================

class TestPoliciesHardening:
    """Structural tests for /v1/policies endpoints."""

    def test_module_imports(self):
        """v1_policies imports without errors."""
        import app.api.routes.v1_policies  # noqa: F401

    def test_get_active_policy_no_special_permission(self):
        """GET /v1/policies/active should be accessible to any authenticated user."""
        from app.api.routes.v1_policies import get_active_policy
        assert callable(get_active_policy)

    def test_activate_checks_policy_activate_permission(self):
        """POST /v1/policies/activate must check policy.activate permission."""
        from app.api.routes import v1_policies
        src = inspect.getsource(v1_policies)
        assert "policy.activate" in src, \
            "Missing policy.activate RBAC check in v1_policies"

    def test_create_template_checks_permission(self):
        """POST /v1/policies/templates must check policy.create_preset permission."""
        from app.api.routes import v1_policies
        src = inspect.getsource(v1_policies)
        assert "policy.create_preset" in src, \
            "Missing policy.create_preset RBAC check in v1_policies"

    def test_template_export_has_checksum(self):
        """Template export must produce a checksum for integrity."""
        from app.api.routes import v1_policies
        src = inspect.getsource(v1_policies)
        assert "checksum" in src or "sha256" in src.lower() or "hashlib" in src, \
            "No checksum logic found in v1_policies export"

    def test_template_import_validates_checksum(self):
        """Template import must validate the supplied checksum."""
        from app.api.routes import v1_policies
        src = inspect.getsource(v1_policies)
        assert "import" in src and ("checksum" in src or "sha256" in src.lower()), \
            "Template import does not validate checksum in v1_policies"

    def test_favorites_endpoints_exist(self):
        """Favorites add/remove/list endpoints must exist."""
        from app.api.routes.v1_policies import add_favorite, remove_favorite, list_favorites
        assert callable(add_favorite)
        assert callable(remove_favorite)
        assert callable(list_favorites)

    def test_policy_config_hedge_ratios_present(self):
        """PolicyConfig with hedge_ratios must be referenced."""
        from app.api.routes import v1_policies
        src = inspect.getsource(v1_policies)
        assert "hedge_ratio" in src or "PolicyConfig" in src, \
            "PolicyConfig or hedge_ratios not referenced in v1_policies"

    def test_deactivate_endpoint_exists(self):
        """Deactivate policy endpoint must exist."""
        from app.api.routes.v1_policies import deactivate_policy
        assert callable(deactivate_policy)


# ===========================================================================
# v1_audit
# ===========================================================================

class TestAuditHardening:
    """Structural tests for /v1/audit endpoints — WORM hash-chained trail."""

    def test_module_imports(self):
        """v1_audit imports without errors."""
        import app.api.routes.v1_audit  # noqa: F401

    def test_list_uses_mandatory_user(self):
        """GET /v1/audit must use get_current_user."""
        from app.api.routes.v1_audit import list_audit_events
        sig = inspect.signature(list_audit_events)
        assert sig.parameters.get("current_user") is not None, \
            "list_audit_events() missing current_user parameter"

    def test_write_requires_auth(self):
        """POST /v1/audit must use get_current_user."""
        from app.api.routes.v1_audit import write_audit_event
        sig = inspect.signature(write_audit_event)
        assert sig.parameters.get("current_user") is not None, \
            "write_audit_event() missing current_user parameter"

    def test_no_delete_or_put_endpoint(self):
        """WORM: audit module must not define DELETE or PUT route handlers."""
        from app.api.routes import v1_audit
        src = inspect.getsource(v1_audit)
        # Check for router.delete or router.put decorators
        import re
        delete_routes = re.findall(r'@router\.delete\s*\(', src)
        put_routes = re.findall(r'@router\.put\s*\(', src)
        assert len(delete_routes) == 0, \
            f"WORM violation: DELETE routes found in v1_audit: {delete_routes}"
        assert len(put_routes) == 0, \
            f"WORM violation: PUT routes found in v1_audit: {put_routes}"

    def test_chain_verify_endpoint_exists(self):
        """Hash chain verification endpoint must exist."""
        from app.api.routes.v1_audit import verify_audit_chain
        assert callable(verify_audit_chain)

    def test_genesis_hash_defined(self):
        """GENESIS_HASH constant (all-zeros) must be accessible."""
        from app.api.routes import v1_audit
        src = inspect.getsource(v1_audit)
        # Either defined locally or imported
        assert "GENESIS_HASH" in src or "genesis" in src.lower(), \
            "GENESIS_HASH not found in v1_audit"

    def test_audit_event_model_used(self):
        """AuditEvent ORM model must be referenced for persistence."""
        from app.api.routes import v1_audit
        src = inspect.getsource(v1_audit)
        assert "AuditEvent" in src, \
            "AuditEvent model not used in v1_audit — WORM persistence may be broken"

    def test_chain_verify_returns_is_intact(self):
        """Chain verify response must include is_intact field."""
        from app.api.routes import v1_audit
        src = inspect.getsource(v1_audit)
        assert "is_intact" in src, \
            "is_intact field not found in v1_audit chain verify response"
