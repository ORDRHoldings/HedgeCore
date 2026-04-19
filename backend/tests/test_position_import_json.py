"""
Tests for JSON batch position import (P2-A).

Validates the pure-function transformation: JSON position dicts → stringified rows
→ validate_rows (with identity mapping) → valid_rows / errors. The service function
batch_import_json() relies on this transformation being equivalent to the CSV path.
"""
from __future__ import annotations

import pytest

from app.services.position_import_service import (
    _COLUMN_ALIASES,
    validate_rows,
)


def _identity_mapping() -> dict[str, str | None]:
    return {f: f for f in _COLUMN_ALIASES}


def _json_to_rows(positions: list[dict]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for p in positions:
        row: dict[str, str] = {}
        for field in _COLUMN_ALIASES:
            v = p.get(field)
            row[field] = "" if v is None else str(v)
        rows.append(row)
    return rows


def test_json_valid_single_position_produces_valid_row():
    positions = [{
        "record_id": "JSON-001",
        "entity": "Acme Corp",
        "flow_type": "AR",
        "currency": "EUR",
        "amount": 100000,
        "value_date": "2026-06-30",
        "status": "CONFIRMED",
        "description": "Q2 receivable",
    }]
    rows = _json_to_rows(positions)
    valid, errors = validate_rows(rows, _identity_mapping(), set())

    assert errors == []
    assert len(valid) == 1
    assert valid[0]["record_id"] == "JSON-001"
    assert valid[0]["currency"] == "EUR"
    assert valid[0]["amount"] == 100000.0


def test_json_float_amount_preserved_through_stringify():
    """Floats must survive str() → float round-trip without precision loss."""
    positions = [{
        "record_id": "JSON-002",
        "entity": "Beta Inc",
        "flow_type": "AP",
        "currency": "GBP",
        "amount": 12345.67,
        "value_date": "2026-07-15",
    }]
    rows = _json_to_rows(positions)
    valid, errors = validate_rows(rows, _identity_mapping(), set())

    assert errors == []
    assert valid[0]["amount"] == 12345.67


def test_json_missing_required_field_produces_error():
    positions = [{
        "record_id": "JSON-003",
        "entity": "",  # missing
        "flow_type": "AR",
        "currency": "EUR",
        "amount": 50000,
        "value_date": "2026-06-30",
    }]
    rows = _json_to_rows(positions)
    valid, errors = validate_rows(rows, _identity_mapping(), set())

    assert valid == []
    assert any(e["code"] == "I-001" and e["field"] == "entity" for e in errors)


def test_json_invalid_currency_produces_i002():
    positions = [{
        "record_id": "JSON-004",
        "entity": "Gamma Ltd",
        "flow_type": "AR",
        "currency": "XYZ",
        "amount": 100000,
        "value_date": "2026-06-30",
    }]
    rows = _json_to_rows(positions)
    valid, errors = validate_rows(rows, _identity_mapping(), set())

    assert valid == []
    assert any(e["code"] == "I-002" for e in errors)


def test_json_invalid_flow_type_produces_i003():
    positions = [{
        "record_id": "JSON-005",
        "entity": "Delta Co",
        "flow_type": "FOO",
        "currency": "EUR",
        "amount": 100000,
        "value_date": "2026-06-30",
    }]
    rows = _json_to_rows(positions)
    valid, errors = validate_rows(rows, _identity_mapping(), set())

    assert valid == []
    assert any(e["code"] == "I-003" for e in errors)


def test_json_duplicate_record_id_in_batch_produces_i007():
    positions = [
        {
            "record_id": "DUP-001",
            "entity": "E1", "flow_type": "AR", "currency": "EUR",
            "amount": 1000, "value_date": "2026-06-30",
        },
        {
            "record_id": "DUP-001",
            "entity": "E2", "flow_type": "AR", "currency": "EUR",
            "amount": 2000, "value_date": "2026-07-30",
        },
    ]
    rows = _json_to_rows(positions)
    valid, errors = validate_rows(rows, _identity_mapping(), set())

    assert len(valid) == 1
    assert any(e["code"] == "I-007" for e in errors)


def test_json_existing_record_id_produces_i008():
    positions = [{
        "record_id": "EXISTING-001",
        "entity": "E1", "flow_type": "AR", "currency": "EUR",
        "amount": 1000, "value_date": "2026-06-30",
    }]
    rows = _json_to_rows(positions)
    existing = {"EXISTING-001"}
    valid, errors = validate_rows(rows, _identity_mapping(), existing)

    assert valid == []
    assert any(e["code"] == "I-008" for e in errors)


def test_json_negative_amount_produces_i005():
    positions = [{
        "record_id": "NEG-001",
        "entity": "E1", "flow_type": "AR", "currency": "EUR",
        "amount": -500, "value_date": "2026-06-30",
    }]
    rows = _json_to_rows(positions)
    valid, errors = validate_rows(rows, _identity_mapping(), set())

    assert valid == []
    assert any(e["code"] == "I-005" for e in errors)


def test_json_invalid_date_produces_i006():
    positions = [{
        "record_id": "DATE-001",
        "entity": "E1", "flow_type": "AR", "currency": "EUR",
        "amount": 1000, "value_date": "not-a-date",
    }]
    rows = _json_to_rows(positions)
    valid, errors = validate_rows(rows, _identity_mapping(), set())

    assert valid == []
    assert any(e["code"] == "I-006" for e in errors)


def test_json_status_defaults_to_confirmed_when_omitted():
    positions = [{
        "record_id": "DEF-001",
        "entity": "E1", "flow_type": "AR", "currency": "EUR",
        "amount": 1000, "value_date": "2026-06-30",
        # status omitted
    }]
    rows = _json_to_rows(positions)
    valid, errors = validate_rows(rows, _identity_mapping(), set())

    assert errors == []
    assert valid[0]["status"] == "CONFIRMED"


def test_json_mixed_valid_and_invalid_partitions_correctly():
    positions = [
        {"record_id": "OK-1", "entity": "E1", "flow_type": "AR",
         "currency": "EUR", "amount": 1000, "value_date": "2026-06-30"},
        {"record_id": "BAD-1", "entity": "E2", "flow_type": "AR",
         "currency": "BAD", "amount": 2000, "value_date": "2026-07-30"},
        {"record_id": "OK-2", "entity": "E3", "flow_type": "AP",
         "currency": "JPY", "amount": 3000, "value_date": "2026-08-30"},
    ]
    rows = _json_to_rows(positions)
    valid, errors = validate_rows(rows, _identity_mapping(), set())

    assert len(valid) == 2
    assert {v["record_id"] for v in valid} == {"OK-1", "OK-2"}
    assert len(errors) == 1
    assert errors[0]["code"] == "I-002"


def test_batch_import_json_guards_empty_list_synchronously():
    """
    The service function must raise ValueError on empty input before any DB work.
    Verified by inspecting source — the guard is the first statement, so we can
    assert it runs by invoking a thin sync wrapper around the coroutine body.
    """
    import asyncio

    from app.services.position_import_service import batch_import_json

    class _StubUser:
        id = "user-1"
        company_id = "co-1"
        branch_id = None

    async def _run():
        await batch_import_json(
            session=None,  # type: ignore[arg-type]
            user=_StubUser(),  # type: ignore[arg-type]
            positions=[],
            dry_run=False,
        )

    with pytest.raises(ValueError, match="empty"):
        asyncio.get_event_loop().run_until_complete(_run()) if False else asyncio.run(_run())
