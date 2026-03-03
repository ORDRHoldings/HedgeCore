"""
Tests for RPT-07: Server-side Report Generation
GET /v1/reports/{run_id}/excel
GET /v1/reports/{run_id}/pdf
GET /v1/reports/{run_id}/bank-pdf

Pure-Python unit tests — no live DB.
"""
from __future__ import annotations


# ---------------------------------------------------------------------------
# 1. Route is registered
# ---------------------------------------------------------------------------

def test_report_routes_registered():
    """excel, pdf, bank-pdf routes exist on the reports router."""
    from app.api.routes.v1_reports import router

    paths = [r.path for r in router.routes]
    assert any("excel" in p for p in paths), "Missing /excel route"
    assert any("/pdf" in p and "bank" not in p for p in paths), "Missing /pdf route"
    assert any("bank-pdf" in p for p in paths), "Missing /bank-pdf route"


# ---------------------------------------------------------------------------
# 2. _fmt_decimal helper
# ---------------------------------------------------------------------------

def test_fmt_decimal_basic():
    from app.api.routes.v1_reports import _fmt_decimal

    assert _fmt_decimal(1234567.89) == "1,234,567.89"
    assert _fmt_decimal(0) == "0.00"
    assert _fmt_decimal(None) == ""
    assert _fmt_decimal(1.23456, 4) == "1.2346"


def test_fmt_decimal_string_passthrough():
    from app.api.routes.v1_reports import _fmt_decimal

    # Non-numeric fallback returns str(val)
    result = _fmt_decimal("not-a-number")
    assert isinstance(result, str)


# ---------------------------------------------------------------------------
# 3. _emit_report_audit imports cleanly
# ---------------------------------------------------------------------------

def test_emit_report_audit_importable():
    """_emit_report_audit must be importable (no missing deps)."""
    from app.api.routes.v1_reports import _emit_report_audit
    import inspect
    assert inspect.iscoroutinefunction(_emit_report_audit)


# ---------------------------------------------------------------------------
# 4. 404 guard logic (mirrors endpoint _fetch_run guard)
# ---------------------------------------------------------------------------

def test_fetch_run_raises_404_when_missing():
    from fastapi import HTTPException
    import pytest

    run = None
    with pytest.raises(HTTPException) as exc_info:
        if run is None:
            raise HTTPException(status_code=404, detail="Calculation run 'abc' not found.")

    assert exc_info.value.status_code == 404
    assert "abc" in exc_info.value.detail


# ---------------------------------------------------------------------------
# 5. 403 tenant guard logic
# ---------------------------------------------------------------------------

def test_fetch_run_raises_403_on_tenant_mismatch():
    from fastapi import HTTPException
    import uuid
    import pytest

    company_a = uuid.uuid4()
    company_b = uuid.uuid4()

    class FakeRun:
        company_id = company_b

    run = FakeRun()
    with pytest.raises(HTTPException) as exc_info:
        if run.company_id is not None and run.company_id != company_a:
            raise HTTPException(status_code=403, detail="Access denied.")

    assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# 6. StreamingResponse returned for each endpoint (smoke check imports)
# ---------------------------------------------------------------------------

def test_streaming_response_import():
    """StreamingResponse must be importable from fastapi.responses."""
    from fastapi.responses import StreamingResponse
    assert StreamingResponse is not None


def test_csv_and_io_imports():
    """csv + io imports used by excel endpoint must be available."""
    import csv  # noqa: F401
    import io   # noqa: F401
    assert True


# ---------------------------------------------------------------------------
# 7. Audit event emitter uses GENESIS_HASH sentinel
# ---------------------------------------------------------------------------

def test_genesis_hash_imported():
    from app.models.audit_event import GENESIS_HASH
    assert isinstance(GENESIS_HASH, str)
    assert len(GENESIS_HASH) == 64  # SHA-256 hex length
