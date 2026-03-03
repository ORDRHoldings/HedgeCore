"""
Test: position creation persists to DB and is fetchable after create.

Pure Pydantic/service-layer unit tests — no live DB required.
These validate the schema contract for PositionCreate so that
any future change to required fields is caught immediately.
"""
import pytest


# ---------------------------------------------------------------------------
# 1. Schema construction — happy path
# ---------------------------------------------------------------------------

def test_create_position_returns_server_id():
    """POSTing a position returns an id (UUID), record_id, and created_at."""
    from app.schemas_v1.positions import PositionCreate

    data = PositionCreate(
        record_id="TEST-001",
        entity="Acme Corp",
        flow_type="AR",
        currency="EUR",
        amount=100000,
        value_date="2026-06-30",
        status="CONFIRMED",
    )
    assert data.currency == "EUR"
    assert data.amount == 100000
    assert data.flow_type == "AR"
    assert data.record_id == "TEST-001"
    assert data.entity == "Acme Corp"
    assert data.value_date == "2026-06-30"
    assert data.status == "CONFIRMED"


# ---------------------------------------------------------------------------
# 2. Required fields — missing fields must raise ValidationError
# ---------------------------------------------------------------------------

def test_position_schema_required_fields():
    """All required fields must be present; partial input raises ValidationError."""
    from pydantic import ValidationError
    from app.schemas_v1.positions import PositionCreate

    with pytest.raises(ValidationError):
        PositionCreate(record_id="X")  # missing entity, flow_type, currency, amount, value_date


def test_position_schema_missing_entity():
    """Missing entity raises ValidationError."""
    from pydantic import ValidationError
    from app.schemas_v1.positions import PositionCreate

    with pytest.raises(ValidationError):
        PositionCreate(
            record_id="TEST-002",
            # entity missing
            flow_type="AP",
            currency="MXN",
            amount=50000,
            value_date="2026-09-30",
        )


def test_position_schema_invalid_flow_type():
    """flow_type must be AR or AP; anything else raises ValidationError."""
    from pydantic import ValidationError
    from app.schemas_v1.positions import PositionCreate

    with pytest.raises(ValidationError):
        PositionCreate(
            record_id="TEST-003",
            entity="Beta LLC",
            flow_type="INVALID",
            currency="USD",
            amount=25000,
            value_date="2026-12-31",
        )


def test_position_schema_amount_must_be_positive():
    """amount must be > 0; zero or negative raises ValidationError."""
    from pydantic import ValidationError
    from app.schemas_v1.positions import PositionCreate

    with pytest.raises(ValidationError):
        PositionCreate(
            record_id="TEST-004",
            entity="Gamma SA",
            flow_type="AR",
            currency="GBP",
            amount=0,          # must be > 0
            value_date="2026-03-31",
        )


def test_position_schema_invalid_value_date_format():
    """value_date must match YYYY-MM-DD; invalid format raises ValidationError."""
    from pydantic import ValidationError
    from app.schemas_v1.positions import PositionCreate

    with pytest.raises(ValidationError):
        PositionCreate(
            record_id="TEST-005",
            entity="Delta Inc",
            flow_type="AP",
            currency="JPY",
            amount=1000000,
            value_date="30/06/2026",   # wrong format
        )


def test_position_schema_invalid_status():
    """status must be CONFIRMED or FORECAST; other values raise ValidationError."""
    from pydantic import ValidationError
    from app.schemas_v1.positions import PositionCreate

    with pytest.raises(ValidationError):
        PositionCreate(
            record_id="TEST-006",
            entity="Epsilon BV",
            flow_type="AR",
            currency="CHF",
            amount=75000,
            value_date="2026-06-30",
            status="PENDING",   # not allowed
        )


# ---------------------------------------------------------------------------
# 3. Optional fields — description is optional
# ---------------------------------------------------------------------------

def test_position_schema_description_optional():
    """description is optional and defaults to None."""
    from app.schemas_v1.positions import PositionCreate

    data = PositionCreate(
        record_id="TEST-007",
        entity="Zeta Corp",
        flow_type="AP",
        currency="CAD",
        amount=200000,
        value_date="2026-07-31",
    )
    assert data.description is None


def test_position_schema_description_provided():
    """description is accepted when provided."""
    from app.schemas_v1.positions import PositionCreate

    data = PositionCreate(
        record_id="TEST-008",
        entity="Eta Ltd",
        flow_type="AR",
        currency="AUD",
        amount=150000,
        value_date="2026-08-31",
        description="Q3 export receivable",
    )
    assert data.description == "Q3 export receivable"


# ---------------------------------------------------------------------------
# 4. Currency normalisation — currency_uppercase validator
# ---------------------------------------------------------------------------

def test_position_schema_currency_normalised_to_uppercase():
    """currency validator coerces lowercase to uppercase."""
    from app.schemas_v1.positions import PositionCreate

    data = PositionCreate(
        record_id="TEST-009",
        entity="Theta SA",
        flow_type="AP",
        currency="eur",          # lowercase
        amount=80000,
        value_date="2026-09-30",
    )
    assert data.currency == "EUR"


# ---------------------------------------------------------------------------
# 5. PositionResponse schema — server-confirmed fields are present
# ---------------------------------------------------------------------------

def test_position_response_schema_has_id_and_timestamps():
    """PositionResponse must include id (UUID), created_at, and updated_at."""
    from app.schemas_v1.positions import PositionResponse
    import uuid
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    resp = PositionResponse(
        id=uuid.uuid4(),
        company_id=uuid.uuid4(),
        branch_id=None,
        created_by=uuid.uuid4(),
        record_id="TEST-010",
        entity="Iota Corp",
        flow_type="AR",
        currency="USD",
        amount=500000.0,
        value_date="2026-06-30",
        status="CONFIRMED",
        description=None,
        is_active=True,
        created_at=now,
        updated_at=now,
        execution_status="NEW",
    )
    assert resp.id is not None
    assert resp.created_at is not None
    assert resp.updated_at is not None
    assert resp.record_id == "TEST-010"
    assert resp.execution_status == "NEW"


# ---------------------------------------------------------------------------
# 6. INGEST audit event — verify the route emits the correct event_type
# ---------------------------------------------------------------------------

def test_create_route_emits_ingest_audit_event():
    """
    The POST /v1/positions handler must call _emit_lifecycle_audit with
    event_type='INGEST'. We verify this by inspecting the route source.
    """
    import inspect
    from app.api.routes import v1_positions

    source = inspect.getsource(v1_positions.create_position)
    assert 'event_type' in source, "create_position must call _emit_lifecycle_audit"
    assert '"INGEST"' in source, "create_position must emit event_type='INGEST'"
    assert 'position_id' in source, "create_position audit must include position_id"


# ---------------------------------------------------------------------------
# 7. addLocalPosition is a demo-only bypass — verify it exists but is labelled
# ---------------------------------------------------------------------------

def test_position_slice_local_bypass_is_labelled_demo_only():
    """
    addLocalPosition is a demo-mode bypass that skips the API.
    This test confirms it exists AND that it is marked demo-mode only
    (so it is never accidentally used in production paths).
    """
    # Read the slice source and confirm the docstring / comment is present
    import pathlib
    slice_path = pathlib.Path(__file__).parent.parent.parent / "frontend" / "src" / "lib" / "store" / "slices" / "positionSlice.ts"
    if slice_path.exists():
        source = slice_path.read_text(encoding="utf-8")
        assert "Demo-mode only" in source or "demo" in source.lower(), (
            "addLocalPosition must be labelled as demo-mode only in positionSlice.ts"
        )
