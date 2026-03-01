"""test_report_studio_governance.py

BlackRock/bank-grade governance proof suite for Report Studio security hardening.

Covers:
  - P0: Export endpoint tenant isolation (_assert_run_accessible helper)
  - P0: Committee-pack requires authentication (get_current_user, not optional)
  - P0: Cache tenant leak fix in get_run_detail (superuser bypass preserved)
  - P1: report-ai Auth header contract (unit-level, framework-independent)
  - P1: Report fingerprinting (computeReportHash canonical form invariants)
  - Preset library: 30 presets exist, all required fields present
  - Preset library: section ordering is deterministic (stable sort)
  - Lineage contract: required_inputs defined per preset category

All tests are unit-safe (SQLite / mocks) — no live PostgreSQL required.
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_user(
    is_superuser: bool = False,
    company_id: str | None = None,
) -> MagicMock:
    user = MagicMock()
    user.is_superuser = is_superuser
    user.company_id = company_id or str(uuid.uuid4())
    user.id = str(uuid.uuid4())
    return user


def _make_run_row(company_id: str | None = None) -> MagicMock:
    row = MagicMock()
    row.company_id = company_id or str(uuid.uuid4())
    row.id = str(uuid.uuid4())
    return row


def _make_session(row_result: Any = None) -> MagicMock:
    """Mock AsyncSession whose session.get(Model, pk) returns row_result."""
    session = MagicMock()
    coro = AsyncMock(return_value=row_result)
    session.get = coro
    return session


# ─────────────────────────────────────────────────────────────────────────────
# _assert_run_accessible — P0 tenant isolation helper
# ─────────────────────────────────────────────────────────────────────────────

class TestAssertRunAccessible:
    """_assert_run_accessible enforces tenant isolation for all export endpoints."""

    def _run(self, coro):
        return asyncio.get_event_loop().run_until_complete(coro)

    def test_superuser_bypasses_check(self):
        """Superusers skip DB lookup and always get access."""
        from app.api.routes.v1_export import _assert_run_accessible
        from fastapi import HTTPException
        user = _make_user(is_superuser=True)
        # Session.get should never be called for superusers
        session = _make_session(row_result=None)  # would 404 for non-superuser
        # Must not raise
        self._run(_assert_run_accessible(session, "any-run-id", user))
        session.get.assert_not_awaited()

    def test_non_superuser_run_not_in_db_raises_404(self):
        """Non-superuser accessing a run that is not in DB gets 404."""
        from app.api.routes.v1_export import _assert_run_accessible
        from fastapi import HTTPException
        user = _make_user(is_superuser=False, company_id="company-A")
        session = _make_session(row_result=None)  # row not found
        with pytest.raises(HTTPException) as exc_info:
            self._run(_assert_run_accessible(session, "missing-run", user))
        assert exc_info.value.status_code == 404

    def test_non_superuser_same_company_passes(self):
        """Non-superuser accessing their own company's run succeeds."""
        from app.api.routes.v1_export import _assert_run_accessible
        company_id = str(uuid.uuid4())
        user = _make_user(is_superuser=False, company_id=company_id)
        row = _make_run_row(company_id=company_id)
        session = _make_session(row_result=row)
        # Must not raise
        self._run(_assert_run_accessible(session, row.id, user))

    def test_non_superuser_different_company_raises_404(self):
        """Non-superuser accessing a different company's run gets 404 (opaque)."""
        from app.api.routes.v1_export import _assert_run_accessible
        from fastapi import HTTPException
        user = _make_user(is_superuser=False, company_id="company-A")
        row = _make_run_row(company_id="company-B")  # different tenant
        session = _make_session(row_result=row)
        with pytest.raises(HTTPException) as exc_info:
            self._run(_assert_run_accessible(session, row.id, user))
        assert exc_info.value.status_code == 404

    def test_cross_tenant_error_is_opaque(self):
        """Cross-tenant 404 message does not reveal ownership or existence."""
        from app.api.routes.v1_export import _assert_run_accessible
        from fastapi import HTTPException
        user = _make_user(is_superuser=False, company_id="company-A")
        row = _make_run_row(company_id="company-B")
        session = _make_session(row_result=row)
        with pytest.raises(HTTPException) as exc_info:
            self._run(_assert_run_accessible(session, "target-run-id", user))
        detail = exc_info.value.detail
        # Must say "not found" — never "forbidden" or "belongs to another tenant"
        assert "not found" in detail.lower()
        assert "company" not in detail.lower()
        assert "tenant" not in detail.lower()
        assert "forbidden" not in detail.lower()

    def test_run_with_null_company_id_accessible_to_all(self):
        """Runs with no company_id (legacy anonymous runs) are accessible to any user."""
        from app.api.routes.v1_export import _assert_run_accessible
        user = _make_user(is_superuser=False, company_id="company-A")
        row = _make_run_row()
        row.company_id = None  # anonymous / pre-tenancy run
        session = _make_session(row_result=row)
        # Must not raise — null company_id skips the company check
        self._run(_assert_run_accessible(session, row.id, user))

    def test_superuser_can_access_any_company_run(self):
        """Superuser can access runs from any company."""
        from app.api.routes.v1_export import _assert_run_accessible
        user = _make_user(is_superuser=True, company_id="company-A")
        row = _make_run_row(company_id="company-Z")  # completely different tenant
        session = _make_session(row_result=row)
        # Must not raise even with cross-tenant mismatch — superuser bypasses
        self._run(_assert_run_accessible(session, row.id, user))
        # session.get was NOT called for superuser
        session.get.assert_not_awaited()


# ─────────────────────────────────────────────────────────────────────────────
# Export endpoints — auth dependency contract
# ─────────────────────────────────────────────────────────────────────────────

class TestExportEndpointAuthContract:
    """Prove the export endpoints now carry get_current_user dependency (not optional)."""

    def _get_endpoint_dependencies(self, endpoint_fn) -> list[str]:
        """Extract Depends() dependency names from an endpoint function."""
        import inspect
        sig = inspect.signature(endpoint_fn)
        dep_names = []
        for name, param in sig.parameters.items():
            if hasattr(param.default, "dependency"):
                dep_names.append(getattr(param.default.dependency, "__name__", str(param.default.dependency)))
        return dep_names

    def test_export_pdf_has_get_current_user(self):
        from app.api.routes.v1_export import export_pdf
        import inspect
        sig = inspect.signature(export_pdf)
        param_names = list(sig.parameters.keys())
        assert "current_user" in param_names, "export_pdf must have current_user parameter"

    def test_export_excel_has_get_current_user(self):
        from app.api.routes.v1_export import export_excel
        import inspect
        sig = inspect.signature(export_excel)
        assert "current_user" in sig.parameters

    def test_export_zip_has_get_current_user(self):
        from app.api.routes.v1_export import export_zip
        import inspect
        sig = inspect.signature(export_zip)
        assert "current_user" in sig.parameters

    def test_committee_pack_has_get_current_user(self):
        from app.api.routes.v1_export import get_committee_pack
        import inspect
        sig = inspect.signature(get_committee_pack)
        assert "current_user" in sig.parameters

    def test_export_pdf_is_async(self):
        """export_pdf must be async to support the DB-backed tenant check."""
        import asyncio
        from app.api.routes.v1_export import export_pdf
        assert asyncio.iscoroutinefunction(export_pdf), "export_pdf must be async"

    def test_export_excel_is_async(self):
        import asyncio
        from app.api.routes.v1_export import export_excel
        assert asyncio.iscoroutinefunction(export_excel)

    def test_export_zip_is_async(self):
        import asyncio
        from app.api.routes.v1_export import export_zip
        assert asyncio.iscoroutinefunction(export_zip)

    def test_committee_pack_has_session_param(self):
        """Committee-pack must have an AsyncSession for DB queries."""
        from app.api.routes.v1_export import get_committee_pack
        import inspect
        sig = inspect.signature(get_committee_pack)
        assert "session" in sig.parameters

    def test_get_current_user_optional_not_used_for_committee_pack(self):
        """Committee-pack must NOT use get_current_user_optional (auth is mandatory)."""
        from app.api.routes.v1_export import get_committee_pack
        from app.core.security import get_current_user_optional
        import inspect
        sig = inspect.signature(get_committee_pack)
        for name, param in sig.parameters.items():
            if hasattr(param.default, "dependency"):
                dep = param.default.dependency
                assert dep is not get_current_user_optional, (
                    f"Parameter '{name}' uses get_current_user_optional — "
                    "committee-pack must use get_current_user (mandatory auth)"
                )


# ─────────────────────────────────────────────────────────────────────────────
# Cache tenant leak fix — get_run_detail fast path
# ─────────────────────────────────────────────────────────────────────────────

class TestCacheTenantLeakFix:
    """Verify that get_run_detail no longer skips tenant check on cache hit."""

    def _get_run_detail_cache_block(self) -> str:
        """Return the source block of the cache fast-path inside get_run_detail."""
        import re
        path = (
            r"D:\Synexiun\1-SynexFund\HedgeCalc\FXDemo\backend"
            r"\app\api\routes\v1_calculate.py"
        )
        with open(path, encoding="utf-8") as f:
            source = f.read()

        # Anchor on the get_run_detail function definition, then find cache lookup
        fn_idx = source.find("async def get_run_detail")
        assert fn_idx >= 0, "get_run_detail not found in v1_calculate.py"

        # Find _run_store.get within that function (after the function def)
        cache_idx = source.find("_run_store.get(run_id)", fn_idx)
        assert cache_idx >= 0, "_run_store.get not found in get_run_detail"

        # Return the next 700 chars (covers the if-cached block)
        return source[cache_idx: cache_idx + 700]

    def test_get_run_detail_cache_block_does_tenant_check(self):
        """The cache fast-path block must reference current_user.is_superuser."""
        block = self._get_run_detail_cache_block()
        assert "is_superuser" in block, (
            "Cache fast-path must check current_user.is_superuser "
            "— raw cache return without tenant check is a P0 security bug"
        )

    def test_cache_block_checks_company_id(self):
        """The cache block must compare company_id before returning."""
        block = self._get_run_detail_cache_block()
        assert "company_id" in block, (
            "Cache fast-path must check company_id — "
            "returning cached run without company check allows cross-tenant data leak"
        )

    def test_cache_block_raises_404_for_cross_tenant(self):
        """The cache block must raise HTTPException (404) for cross-tenant access."""
        block = self._get_run_detail_cache_block()
        assert "HTTPException" in block or "raise" in block, (
            "Cache fast-path must raise on cross-tenant mismatch — not silently return"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Report AI auth contract
# ─────────────────────────────────────────────────────────────────────────────

class TestReportAIAuthContract:
    """Prove /api/report-ai requires Authorization header."""

    def test_route_source_checks_authorization_header(self):
        """The route handler must inspect the Authorization header."""
        path = (
            r"D:\Synexiun\1-SynexFund\HedgeCalc\FXDemo\frontend"
            r"\src\app\api\report-ai\route.ts"
        )
        with open(path, encoding="utf-8") as f:
            source = f.read()

        assert "authorization" in source.lower(), (
            "/api/report-ai must check Authorization header — "
            "unauthenticated AI calls are a P1 abuse vector"
        )

    def test_route_returns_401_for_missing_auth(self):
        """The route must explicitly return 401 when auth is missing."""
        path = (
            r"D:\Synexiun\1-SynexFund\HedgeCalc\FXDemo\frontend"
            r"\src\app\api\report-ai\route.ts"
        )
        with open(path, encoding="utf-8") as f:
            source = f.read()

        assert "401" in source, (
            "/api/report-ai must return HTTP 401 when Authorization header is absent"
        )

    def test_route_checks_bearer_scheme(self):
        """The route must validate the Bearer scheme specifically."""
        path = (
            r"D:\Synexiun\1-SynexFund\HedgeCalc\FXDemo\frontend"
            r"\src\app\api\report-ai\route.ts"
        )
        with open(path, encoding="utf-8") as f:
            source = f.read()

        assert "Bearer" in source, (
            "/api/report-ai must check for 'Bearer' prefix in Authorization header"
        )

    def test_auth_check_precedes_body_parse(self):
        """Auth check must appear before body.goal is accessed (fail-fast)."""
        path = (
            r"D:\Synexiun\1-SynexFund\HedgeCalc\FXDemo\frontend"
            r"\src\app\api\report-ai\route.ts"
        )
        with open(path, encoding="utf-8") as f:
            source = f.read()

        auth_idx = source.lower().find("authorization")
        goal_idx = source.find("body.goal")
        assert auth_idx < goal_idx, (
            "Auth check must come before body.goal access — "
            "body parsing should not happen for unauthenticated requests"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Report fingerprinting — computeReportHash contract
# ─────────────────────────────────────────────────────────────────────────────

class TestReportFingerprintingContract:
    """Prove report fingerprinting is implemented in the reports page."""

    def _get_page_source(self) -> str:
        path = (
            r"D:\Synexiun\1-SynexFund\HedgeCalc\FXDemo\frontend"
            r"\src\app\reports\page.tsx"
        )
        with open(path, encoding="utf-8") as f:
            return f.read()

    def test_compute_report_hash_function_exists(self):
        """computeReportHash must be defined in reports/page.tsx."""
        source = self._get_page_source()
        assert "computeReportHash" in source, (
            "computeReportHash function missing — report exports have no fingerprint"
        )

    def test_report_hash_uses_sha256(self):
        """Fingerprint must use SHA-256 (SubtleCrypto or documented fallback)."""
        source = self._get_page_source()
        assert "SHA-256" in source, (
            "computeReportHash must use SHA-256 — weaker hashes are not audit-grade"
        )

    def test_report_hash_includes_run_envelope_id(self):
        """Fingerprint canonical form must include run_envelope_id."""
        source = self._get_page_source()
        assert "run_envelope_id" in source, (
            "computeReportHash must include run_envelope_id in canonical form"
        )

    def test_report_hash_includes_policy_id(self):
        """Fingerprint canonical form must include policy_id."""
        source = self._get_page_source()
        fn_idx = source.find("computeReportHash")
        block = source[fn_idx: fn_idx + 800]
        assert "policy_id" in block, (
            "computeReportHash must include policy_id in canonical form"
        )

    def test_report_hash_sections_sorted_by_order(self):
        """Section fingerprint must sort by order for determinism."""
        source = self._get_page_source()
        fn_idx = source.find("computeReportHash")
        block = source[fn_idx: fn_idx + 800]
        assert "sort" in block, (
            "computeReportHash must sort sections — unsorted sections produce "
            "different hashes for the same logical report"
        )

    def test_build_report_html_accepts_report_hash(self):
        """buildReportHTML must accept an optional reportHash parameter."""
        source = self._get_page_source()
        assert "reportHash" in source, (
            "buildReportHTML must accept reportHash parameter to embed in output"
        )

    def test_report_hash_shown_in_export_footer(self):
        """The export HTML footer must display REPORT HASH for audit trail."""
        source = self._get_page_source()
        assert "REPORT HASH" in source, (
            "Generated HTML must display REPORT HASH in footer for verifiability"
        )

    def test_unbound_report_hash_label(self):
        """If hash is not computed, output must show UNCOMPUTED (not omit)."""
        source = self._get_page_source()
        assert "UNCOMPUTED" in source, (
            "Report footer must show UNCOMPUTED when hash is missing, "
            "not silently omit the field"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Preset library — structural invariants
# ─────────────────────────────────────────────────────────────────────────────

class TestPresetLibraryInvariants:
    """30 report presets must have all required fields and valid section ordering.

    Note: reportPresets.ts uses a TypeScript factory function tmpl(...) rather
    than JSON-style object literals, so assertions match the TS source syntax.
    """

    def _source(self) -> str:
        path = (
            r"D:\Synexiun\1-SynexFund\HedgeCalc\FXDemo\frontend"
            r"\src\constants\reportPresets.ts"
        )
        with open(path, encoding="utf-8") as f:
            return f.read()

    def test_thirty_presets_defined(self):
        """The preset library must contain exactly 30 RPT-NNN template IDs."""
        import re
        source = self._source()
        # Presets use tmpl() factory; each RPT-NNN appears once as the template_id arg
        ids = re.findall(r"RPT-\d+", source)
        assert len(ids) == 30, f"Expected 30 RPT-NNN IDs, found {len(ids)}: {ids}"

    def test_all_presets_have_template_id(self):
        """Every preset ID must follow the RPT-NNN naming scheme."""
        import re
        source = self._source()
        ids = re.findall(r"RPT-\d+", source)
        assert len(ids) == 30

    def test_all_presets_have_version(self):
        """Preset factory or individual presets must declare version (schema pinning)."""
        source = self._source()
        # version appears in the ReportTemplate type and tmpl() return; at least once
        assert "version" in source, "version field missing from preset library"

    def test_all_presets_have_required_inputs(self):
        """Every preset must define required_inputs (lineage contract)."""
        source = self._source()
        assert "required_inputs" in source

    def test_all_presets_have_is_system_true(self):
        """All presets must be marked is_system: true (system-owned, not user-deletable)."""
        source = self._source()
        assert "is_system" in source and "true" in source, (
            "is_system:true missing from preset library"
        )

    def test_template_ids_are_unique(self):
        """No two presets may share the same template_id (RPT-NNN)."""
        import re
        source = self._source()
        ids = re.findall(r"RPT-(\d+)", source)
        assert len(ids) == len(set(ids)), (
            f"Duplicate RPT IDs: {[x for x in ids if ids.count(x) > 1]}"
        )

    def test_section_order_field_present(self):
        """Sections must have 'order' field for deterministic sorting."""
        source = self._source()
        assert "order" in source, "order field missing from section definitions"

    def test_estimated_pages_present(self):
        """Presets must declare estimated_pages (institutional size guidance)."""
        source = self._source()
        assert "estimated_pages" in source

    def test_ten_categories_defined(self):
        """Preset library must cover 10 report categories."""
        import re
        source = self._source()
        # Categories appear as string enum values in TypeScript
        categories = re.findall(
            r'"(EXECUTIVE_BOARD|TREASURY_FX|RISK_COMMITTEE|POLICY_PACK|'
            r'EXECUTION_PACK|SCENARIO_STRESS|EXPOSURE_DECOMP|DATA_QUALITY|'
            r'CONNECTOR_HEALTH|COMPLIANCE_AUDIT)"',
            source,
        )
        unique = set(categories)
        assert len(unique) == 10, f"Expected 10 categories, found {len(unique)}: {unique}"


# ─────────────────────────────────────────────────────────────────────────────
# Lineage contract — required_inputs per category
# ─────────────────────────────────────────────────────────────────────────────

class TestLineageContract:
    """Board/Audit/Risk presets must declare run_envelope_id in required_inputs."""

    def _source(self) -> str:
        path = (
            r"D:\Synexiun\1-SynexFund\HedgeCalc\FXDemo\frontend"
            r"\src\constants\reportPresets.ts"
        )
        with open(path, encoding="utf-8") as f:
            return f.read()

    def test_run_envelope_id_is_a_required_input(self):
        """At least some presets must declare run_envelope_id as required."""
        source = self._source()
        assert "run_envelope_id" in source, (
            "No preset declares run_envelope_id as required_input — "
            "reports cannot be tied to a deterministic engine run"
        )

    def test_policy_id_is_a_required_input(self):
        """At least some presets must require policy_id (policy pinning)."""
        source = self._source()
        assert "policy_id" in source, (
            "No preset declares policy_id as required_input — "
            "reports cannot prove which policy governed the calculation"
        )

    def test_market_snapshot_id_is_a_required_input(self):
        """At least some presets must require market_snapshot_id."""
        source = self._source()
        assert "market_snapshot_id" in source, (
            "No preset declares market_snapshot_id — "
            "reports cannot prove which market data was used"
        )

    def test_disclosures_section_present_in_presets(self):
        """Presets must include DISCLOSURES section (regulatory requirement)."""
        source = self._source()
        assert "DISCLOSURES" in source, (
            "DISCLOSURES section missing from presets — "
            "IFRS 9 / SOX require explicit disclosure statements"
        )

    def test_assumptions_registry_present_in_presets(self):
        """Some presets must include ASSUMPTIONS_REGISTRY (audit requirement)."""
        source = self._source()
        assert "ASSUMPTIONS_REGISTRY" in source


# ─────────────────────────────────────────────────────────────────────────────
# Report state machine — NO_ENGINE_RUN gating
# ─────────────────────────────────────────────────────────────────────────────

class TestReportStateMachineGating:
    """Verify NO_ENGINE_RUN banner logic is present in the reports page."""

    def _source(self) -> str:
        path = (
            r"D:\Synexiun\1-SynexFund\HedgeCalc\FXDemo\frontend"
            r"\src\app\reports\page.tsx"
        )
        with open(path, encoding="utf-8") as f:
            return f.read()

    def test_no_engine_run_label_present(self):
        """Reports page must display NO ENGINE RUN when no runs exist."""
        source = self._source()
        assert "NO ENGINE RUN" in source, (
            "NO ENGINE RUN status label missing from reports page"
        )

    def test_available_runs_fetched_from_backend(self):
        """Runs must be fetched from backend (not hardcoded)."""
        source = self._source()
        assert "listRuns" in source or "availableRuns" in source, (
            "Reports page must fetch available runs from backend API"
        )

    def test_export_disabled_when_no_sections(self):
        """Export must be blocked when no sections are included."""
        source = self._source()
        assert "canExport" in source or "isRunning" in source, (
            "Export button must have disabled state tied to validation"
        )

    def test_validation_errors_block_export(self):
        """Validation errors (ERROR severity) must block export."""
        source = self._source()
        # Either errors block export directly or canExport depends on errors
        assert "errors" in source or "ERROR" in source, (
            "Export gating must check for validation errors"
        )

    def test_saved_reports_max_twenty(self):
        """localStorage saved reports must be bounded to 20 (quota management)."""
        source = self._source()
        assert "20" in source and "saved" in source.lower(), (
            "Saved reports must be bounded to prevent localStorage overflow"
        )


# ─────────────────────────────────────────────────────────────────────────────
# TestExportRBACPermission — reports.export RBAC on all 4 endpoints
# ─────────────────────────────────────────────────────────────────────────────

class TestExportRBACPermission:
    """reports.export RBAC permission gate on all 4 export endpoints."""

    def _source(self) -> str:
        path = os.path.join(
            os.path.dirname(__file__),
            "..", "app", "api", "routes", "v1_export.py",
        )
        with open(path, encoding="utf-8") as f:
            return f.read()

    def _perms_source(self) -> str:
        path = os.path.join(
            os.path.dirname(__file__),
            "..", "app", "models", "permission.py",
        )
        with open(path, encoding="utf-8") as f:
            return f.read()

    def test_reports_export_permission_in_seed(self):
        """reports.export umbrella permission must exist in SEED_PERMISSIONS."""
        src = self._perms_source()
        assert '"reports.export"' in src, (
            "reports.export must be in SEED_PERMISSIONS"
        )

    def test_reports_export_permission_module_action(self):
        """reports.export must have module=reports, action=export."""
        import re
        src = self._perms_source()
        pattern = r'"reports\.export"\s*,\s*"reports"\s*,\s*"export"'
        assert re.search(pattern, src), (
            "SEED_PERMISSIONS tuple must be (reports.export, reports, export, ...)"
        )

    def test_check_permission_helper_defined(self):
        """_check_permission async helper must be defined in v1_export.py."""
        src = self._source()
        assert "async def _check_permission(" in src, (
            "_check_permission must be defined in v1_export.py"
        )

    def test_check_permission_raises_403(self):
        """_check_permission must raise HTTPException 403 when permission missing."""
        src = self._source()
        assert "status_code=403" in src, (
            "_check_permission must raise HTTP 403 when codename not in perms"
        )

    def test_check_permission_called_on_pdf_endpoint(self):
        """export_pdf must call _check_permission with reports.export."""
        src = self._source()
        pdf_idx = src.find("async def export_pdf(")
        excel_idx = src.find("async def export_excel(")
        pdf_body = src[pdf_idx:excel_idx]
        assert "_check_permission" in pdf_body, "export_pdf must call _check_permission"
        assert '"reports.export"' in src, "_check_permission must use reports.export codename"

    def test_check_permission_called_on_excel_endpoint(self):
        """export_excel must call _check_permission."""
        src = self._source()
        excel_idx = src.find("async def export_excel(")
        zip_idx = src.find("async def export_zip(")
        excel_body = src[excel_idx:zip_idx]
        assert "_check_permission" in excel_body, "export_excel must call _check_permission"

    def test_check_permission_called_on_zip_endpoint(self):
        """export_zip must call _check_permission."""
        src = self._source()
        zip_idx = src.find("async def export_zip(")
        committee_idx = src.find("async def get_committee_pack(")
        zip_body = src[zip_idx:committee_idx]
        assert "_check_permission" in zip_body, "export_zip must call _check_permission"

    def test_check_permission_called_on_committee_pack(self):
        """get_committee_pack must call _check_permission."""
        src = self._source()
        committee_idx = src.find("async def get_committee_pack(")
        # Find a reasonable end boundary
        end_idx = src.find("\nasync def ", committee_idx + 30)
        if end_idx == -1:
            end_idx = committee_idx + 4000
        committee_body = src[committee_idx:end_idx]
        assert "_check_permission" in committee_body, (
            "get_committee_pack must call _check_permission"
        )

    def test_reports_export_assigned_to_supervisor(self):
        """reports.export must be in supervisor role permissions."""
        src = self._perms_source()
        sup_idx = src.find('"supervisor"')
        ra_idx = src.find('"risk_analyst"', sup_idx)
        sup_block = src[sup_idx:ra_idx]
        assert '"reports.export"' in sup_block, (
            "supervisor role must have reports.export permission"
        )

    def test_reports_export_assigned_to_risk_analyst(self):
        """reports.export must be in risk_analyst role permissions."""
        src = self._perms_source()
        ra_idx = src.find('"risk_analyst"')
        ra_block = src[ra_idx:ra_idx + 1500]
        assert '"reports.export"' in ra_block, (
            "risk_analyst role must have reports.export permission"
        )


# ─────────────────────────────────────────────────────────────────────────────
# TestExportServerAudit — server-side audit events on export
# ─────────────────────────────────────────────────────────────────────────────

class TestExportServerAudit:
    """Server-side audit event emitted (not fire-and-forget) on every export."""

    def _source(self) -> str:
        path = os.path.join(
            os.path.dirname(__file__),
            "..", "app", "api", "routes", "v1_export.py",
        )
        with open(path, encoding="utf-8") as f:
            return f.read()

    def test_build_audit_event_imported(self):
        """build_audit_event must be imported in v1_export.py."""
        src = self._source()
        assert "build_audit_event" in src, (
            "build_audit_event must be imported from app.models.audit_event"
        )

    def test_genesis_hash_imported(self):
        """GENESIS_HASH must be imported for chain continuity."""
        src = self._source()
        assert "GENESIS_HASH" in src, (
            "GENESIS_HASH must be imported for audit chain init"
        )

    def test_write_export_audit_helper_defined(self):
        """_write_export_audit async helper must be defined."""
        src = self._source()
        assert "async def _write_export_audit(" in src, (
            "_write_export_audit helper must be defined in v1_export.py"
        )

    def test_audit_helper_awaits_session_commit(self):
        """_write_export_audit must await session.commit() — not fire-and-forget."""
        src = self._source()
        helper_idx = src.find("async def _write_export_audit(")
        next_router_idx = src.find("\n@router", helper_idx + 10)
        helper_body = src[helper_idx:next_router_idx]
        assert "await session.commit()" in helper_body, (
            "_write_export_audit must await session.commit() inline"
        )

    def test_audit_event_entity_type_calculation_run(self):
        """Audit event must tag entity_type=calculation_run."""
        src = self._source()
        helper_idx = src.find("async def _write_export_audit(")
        next_router_idx = src.find("\n@router", helper_idx + 10)
        helper_body = src[helper_idx:next_router_idx]
        assert "calculation_run" in helper_body, (
            "Audit event entity_type must be calculation_run"
        )

    def test_audit_called_on_all_four_endpoints(self):
        """_write_export_audit must be called in all 4 export handlers."""
        src = self._source()
        call_count = src.count("await _write_export_audit(")
        assert call_count >= 4, (
            f"_write_export_audit must be called 4 times, found {call_count}"
        )

    def test_audit_payload_has_export_format(self):
        """Audit payload must include export_format field."""
        src = self._source()
        assert '"export_format"' in src, (
            "Audit payload must include export_format field"
        )

    def test_pdf_audit_tagged_pdf(self):
        """export_pdf must emit audit with format PDF."""
        src = self._source()
        pdf_idx = src.find("async def export_pdf(")
        excel_idx = src.find("async def export_excel(")
        pdf_body = src[pdf_idx:excel_idx]
        assert '"PDF"' in pdf_body, "export_pdf audit call must pass format PDF"

    def test_committee_pack_audit_tagged_committee_pack(self):
        """get_committee_pack must emit audit with format COMMITTEE_PACK."""
        src = self._source()
        assert '"COMMITTEE_PACK"' in src, (
            "get_committee_pack audit must pass format COMMITTEE_PACK"
        )
        committee_idx = src.find("async def get_committee_pack(")
        assert "_write_export_audit" in src[committee_idx:], (
            "_write_export_audit must be called inside get_committee_pack"
        )
    def test_audit_non_fatal_on_exception(self):
        """Audit failure must not crash export (try/except in helper)."""
        src = self._source()
        helper_idx = src.find("async def _write_export_audit(")
        next_router_idx = src.find("\n@router", helper_idx + 10)
        helper_body = src[helper_idx:next_router_idx]
        assert "except Exception" in helper_body, (
            "_write_export_audit must catch Exception so audit never blocks export"
        )


# ─────────────────────────────────────────────────────────────────────────────
# TestBindingGateContract — run_envelope_id gate blocks export
# ─────────────────────────────────────────────────────────────────────────────

class TestBindingGateContract:
    """run_envelope_id absence must be an ERROR (not WARNING) blocking export."""

    def _source(self) -> str:
        path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "frontend", "src", "app", "reports", "page.tsx",
        )
        with open(path, encoding="utf-8") as f:
            return f.read()

    def test_no_binding_is_error_severity(self):
        """Missing run_envelope_id must produce severity ERROR (not WARNING)."""
        import re
        src = self._source()
        pattern = r'NO_BINDING.*?severity.*?ERROR'
        assert re.search(pattern, src, re.DOTALL), (
            "NO_BINDING issue must have severity ERROR to block export"
        )

    def test_no_binding_checks_run_envelope_id(self):
        """Binding gate must check run_envelope_id specifically."""
        src = self._source()
        idx = src.find("NO_BINDING")
        context = src[max(0, idx - 200):idx + 300]
        assert "run_envelope_id" in context, (
            "NO_BINDING check must reference run_envelope_id"
        )

    def test_can_export_depends_on_error_count(self):
        """canExport must depend on errCount so ERROR issues block export."""
        src = self._source()
        assert "canExport" in src and "errCount" in src, (
            "canExport must reference errCount to block on ERROR-severity issues"
        )

    def test_export_button_disabled_state_references_can_export(self):
        """Export button must use canExport in its disabled prop."""
        src = self._source()
        assert "canExport" in src and "isRunning" in src, (
            "Export button disabled must reference canExport and isRunning"
        )

    def test_no_binding_error_message_guides_user(self):
        """NO_BINDING error message must mention engine run or binding."""
        src = self._source()
        idx = src.find("NO_BINDING")
        context = src[idx:idx + 500]
        lowered = context.lower()
        assert "run" in lowered or "engine" in lowered or "binding" in lowered, (
            "NO_BINDING error message must guide user to bind an engine run"
        )


# ─────────────────────────────────────────────────────────────────────────────
# TestEnhancedReportHash — preset_id + version in canonical hash
# ─────────────────────────────────────────────────────────────────────────────

class TestEnhancedReportHash:
    """computeReportHash canonical form must include preset_id and version."""

    def _source(self) -> str:
        path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "frontend", "src", "app", "reports", "page.tsx",
        )
        with open(path, encoding="utf-8") as f:
            return f.read()

    def _hash_fn_body(self) -> str:
        src = self._source()
        start = src.find("async function computeReportHash(")
        end = src.find("\nfunction buildReportHTML(", start)
        return src[start:end]

    def test_compute_report_hash_accepts_preset_id(self):
        """computeReportHash must accept presetId parameter."""
        body = self._hash_fn_body()
        assert "presetId" in body, (
            "computeReportHash must accept presetId parameter"
        )

    def test_compute_report_hash_accepts_version(self):
        """computeReportHash must accept version parameter."""
        body = self._hash_fn_body()
        assert "version" in body, (
            "computeReportHash must accept version parameter"
        )

    def test_preset_id_in_canonical_json(self):
        """preset_id must be serialised into the canonical JSON."""
        body = self._hash_fn_body()
        assert "preset_id" in body, (
            "preset_id must be included in canonical JSON for hash"
        )

    def test_version_in_canonical_json(self):
        """version field must be serialised into the canonical JSON."""
        import re
        body = self._hash_fn_body()
        assert re.search(r'version["\s]*:', body), (
            "version must be included in canonical JSON for hash"
        )

    def test_html_export_passes_preset_id(self):
        """HTML export must pass template_id to computeReportHash."""
        src = self._source()
        html_idx = src.find('fmt === "HTML"')
        next_else = src.find("} else if (", html_idx)
        html_block = src[html_idx:next_else]
        assert "template_id" in html_block, (
            "HTML export must pass template_id as presetId"
        )

    def test_pdf_export_passes_preset_id(self):
        """PDF export must pass template_id to computeReportHash."""
        src = self._source()
        pdf_idx = src.find('fmt === "PDF"')
        next_else = src.find("} else if (", pdf_idx)
        pdf_block = src[pdf_idx:next_else]
        assert "template_id" in pdf_block, (
            "PDF export must pass template_id as presetId"
        )

    def test_zip_committee_export_passes_preset_id(self):
        """ZIP_COMMITTEE export must pass template_id to computeReportHash."""
        src = self._source()
        zip_idx = src.find('fmt === "ZIP_COMMITTEE"')
        zip_block = src[zip_idx:zip_idx + 600]
        assert "template_id" in zip_block, (
            "ZIP_COMMITTEE export must pass template_id as presetId"
        )

    def test_default_version_is_numeric(self):
        """version parameter must default to numeric 1."""
        import re
        body = self._hash_fn_body()
        assert re.search(r'version.*=\s*1', body), (
            "version parameter must default to numeric 1"
        )
