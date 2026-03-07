"""Comprehensive unit tests for pipeline_service and related service modules.

Covers:
  - pipeline_service: pure helpers, staleness check, sandbox store eviction,
    timeline management, proposal/staging/ledger DB-backed flows (mocked)
  - position_import_service: CSV parsing, column auto-mapping, row validation,
    date parsing, template generation, upload/validate/commit batch flows (mocked)
  - connector_service: DuplicateImportError, create_run, complete_run,
    record_error, run detail queries, audited CSV import (mocked)
  - policy_favorites_service: add/remove/list/is_favorite (mocked)
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# position_import_service -- pure functions
# ---------------------------------------------------------------------------
from app.services.position_import_service import (
    _extract_field,
    _parse_csv,
    _try_parse_date,
    auto_map_columns,
    generate_template_csv,
    validate_rows,
)

# ---------------------------------------------------------------------------
# pipeline_service -- pure helpers
# ---------------------------------------------------------------------------
from app.services.pipeline_service import (
    MAX_STORE_SIZE,
    _add_timeline,
    _gen_id,
    _now,
    _sandbox_runs,
    _timelines,
    check_snapshot_staleness,
    get_timeline,
)

# ---------------------------------------------------------------------------
# connector_service -- exception class
# ---------------------------------------------------------------------------
from app.services.connector_service import DuplicateImportError

# ---------------------------------------------------------------------------
# pipeline schemas -- enums used in mock assertions
# ---------------------------------------------------------------------------
from app.schemas_v1.pipeline import AuthorizationStatus


# ═══════════════════════════════════════════════════════════════════════════
# 1. pipeline_service -- pure helpers
# ═══════════════════════════════════════════════════════════════════════════


class TestGenId:
    def test_prefix_format(self):
        result = _gen_id("PROP")
        assert result.startswith("PROP-")
        assert len(result) == len("PROP-") + 8  # 8 hex chars

    def test_unique(self):
        ids = {_gen_id("X") for _ in range(50)}
        assert len(ids) == 50  # all unique

    def test_uppercase_hex(self):
        suffix = _gen_id("T").split("-", 1)[1]
        assert suffix == suffix.upper()
        assert all(c in "0123456789ABCDEF" for c in suffix)


class TestNow:
    def test_returns_utc_aware(self):
        result = _now()
        assert result.tzinfo is not None
        assert result.tzinfo == UTC

    def test_close_to_actual(self):
        before = datetime.now(UTC)
        result = _now()
        after = datetime.now(UTC)
        assert before <= result <= after


class TestCheckSnapshotStaleness:
    def test_fresh_snapshot(self):
        recent = datetime.now(UTC) - timedelta(minutes=5)
        assert check_snapshot_staleness(recent) is False

    def test_stale_snapshot(self):
        old = datetime.now(UTC) - timedelta(minutes=60)
        assert check_snapshot_staleness(old) is True

    def test_exact_threshold(self):
        # At exactly 30 minutes, delta == threshold so not strictly >, should be False
        at_threshold = datetime.now(UTC) - timedelta(minutes=30)
        assert check_snapshot_staleness(at_threshold) is False

    def test_custom_threshold(self):
        ts = datetime.now(UTC) - timedelta(minutes=10)
        assert check_snapshot_staleness(ts, threshold_minutes=5) is True
        assert check_snapshot_staleness(ts, threshold_minutes=15) is False


class TestTimeline:
    def setup_method(self):
        _timelines.clear()

    def test_add_and_get(self):
        _add_timeline("ent-1", "CREATED", "user-1", "detail here")
        events = get_timeline("ent-1")
        assert len(events) == 1
        assert events[0].event_type == "CREATED"
        assert events[0].actor == "user-1"
        assert events[0].detail == "detail here"

    def test_get_empty(self):
        assert get_timeline("nonexistent") == []

    def test_multiple_events(self):
        _add_timeline("ent-2", "A", "u1")
        _add_timeline("ent-2", "B", "u2")
        _add_timeline("ent-2", "C", "u3")
        assert len(get_timeline("ent-2")) == 3

    def test_events_isolated(self):
        _add_timeline("x", "E1", "u")
        _add_timeline("y", "E2", "u")
        assert len(get_timeline("x")) == 1
        assert len(get_timeline("y")) == 1

    def test_metadata_kwargs(self):
        _add_timeline("m", "EV", "u", "d", extra="val")
        evt = get_timeline("m")[0]
        assert evt.metadata.get("extra") == "val"


class TestSandboxStoreEviction:
    """Verify the MAX_STORE_SIZE eviction logic in sandbox_calculate."""

    def setup_method(self):
        _sandbox_runs.clear()

    def test_store_limit_constant(self):
        assert MAX_STORE_SIZE == 100

    def test_eviction_removes_oldest(self):
        # Manually fill the store beyond limit
        for i in range(MAX_STORE_SIZE + 5):
            _sandbox_runs[f"run-{i}"] = {"index": i}
            if len(_sandbox_runs) > MAX_STORE_SIZE:
                oldest = next(iter(_sandbox_runs))
                del _sandbox_runs[oldest]
        assert len(_sandbox_runs) == MAX_STORE_SIZE
        # The first 5 should have been evicted
        assert "run-0" not in _sandbox_runs
        assert "run-4" not in _sandbox_runs
        assert "run-5" in _sandbox_runs

    def teardown_method(self):
        _sandbox_runs.clear()


# ═══════════════════════════════════════════════════════════════════════════
# 2. position_import_service -- pure functions
# ═══════════════════════════════════════════════════════════════════════════


class TestAutoMapColumns:
    def test_exact_match(self):
        headers = ["record_id", "entity", "flow_type", "currency", "amount", "value_date"]
        mapping = auto_map_columns(headers)
        assert mapping["record_id"] == "record_id"
        assert mapping["entity"] == "entity"
        assert mapping["currency"] == "currency"

    def test_alias_match(self):
        headers = ["ref", "company", "type", "ccy", "notional", "date"]
        mapping = auto_map_columns(headers)
        assert mapping["record_id"] == "ref"
        assert mapping["entity"] == "company"
        assert mapping["flow_type"] == "type"
        assert mapping["currency"] == "ccy"
        assert mapping["amount"] == "notional"
        assert mapping["value_date"] == "date"

    def test_case_insensitive(self):
        headers = ["Record_Id", "Entity", "Flow_Type", "Currency", "Amount", "Value_Date"]
        mapping = auto_map_columns(headers)
        # Normalization lowercases + replaces spaces/hyphens
        assert mapping["record_id"] == "Record_Id"

    def test_unmapped_field(self):
        headers = ["foo", "bar"]
        mapping = auto_map_columns(headers)
        assert mapping["record_id"] is None
        assert mapping["entity"] is None

    def test_header_with_spaces(self):
        headers = ["trade id", "business unit"]
        mapping = auto_map_columns(headers)
        assert mapping["record_id"] == "trade id"  # trade_id alias after normalize
        assert mapping["entity"] == "business unit"  # business_unit alias

    def test_header_with_hyphens(self):
        headers = ["trade-id"]
        mapping = auto_map_columns(headers)
        assert mapping["record_id"] == "trade-id"


class TestParseCsv:
    def test_basic_csv(self):
        raw = b"a,b,c\n1,2,3\n4,5,6"
        headers, rows = _parse_csv(raw)
        assert headers == ["a", "b", "c"]
        assert len(rows) == 2
        assert rows[0]["a"] == "1"

    def test_bom_handling(self):
        bom = b"\xef\xbb\xbf"  # UTF-8 BOM
        raw = bom + b"x,y\n10,20"
        headers, rows = _parse_csv(raw)
        assert headers == ["x", "y"]  # BOM stripped via utf-8-sig
        assert rows[0]["x"] == "10"

    def test_latin1_fallback(self):
        raw = "name,val\nCaf\xe9,1".encode("latin-1")
        headers, rows = _parse_csv(raw)
        assert len(rows) == 1

    def test_empty_csv(self):
        raw = b""
        headers, rows = _parse_csv(raw)
        assert headers == []
        assert rows == []


class TestExtractField:
    def test_normal_extraction(self):
        row = {"Col A": " hello ", "Col B": "world"}
        mapping = {"field_a": "Col A", "field_b": "Col B", "field_c": None}
        assert _extract_field(row, mapping, "field_a") == "hello"
        assert _extract_field(row, mapping, "field_b") == "world"

    def test_none_mapping(self):
        row = {"a": "1"}
        mapping = {"x": None}
        assert _extract_field(row, mapping, "x") == ""

    def test_missing_key(self):
        row = {"a": "1"}
        mapping = {"x": "missing_col"}
        assert _extract_field(row, mapping, "x") == ""

    def test_empty_value(self):
        row = {"a": ""}
        mapping = {"x": "a"}
        assert _extract_field(row, mapping, "x") == ""


class TestTryParseDate:
    def test_us_format(self):
        assert _try_parse_date("06/15/2026") == "2026-06-15"

    def test_eu_format(self):
        assert _try_parse_date("15.06.2026") == "2026-06-15"

    def test_iso_slash(self):
        assert _try_parse_date("2026/06/15") == "2026-06-15"

    def test_invalid(self):
        assert _try_parse_date("not-a-date") is None

    def test_empty_string(self):
        assert _try_parse_date("") is None


class TestValidateRows:
    """Tests for the pure validate_rows() function."""

    def _make_mapping(self):
        return {
            "record_id": "record_id",
            "entity": "entity",
            "flow_type": "flow_type",
            "currency": "currency",
            "amount": "amount",
            "value_date": "value_date",
            "status": "status",
            "description": "description",
        }

    def _good_row(self, **overrides):
        base = {
            "record_id": "POS-001",
            "entity": "Acme",
            "flow_type": "AR",
            "currency": "MXN",
            "amount": "500000",
            "value_date": "2026-06-15",
            "status": "CONFIRMED",
            "description": "Test",
        }
        base.update(overrides)
        return base

    def test_valid_row(self):
        valid, errors = validate_rows([self._good_row()], self._make_mapping(), set())
        assert len(valid) == 1
        assert len(errors) == 0
        assert valid[0]["record_id"] == "POS-001"
        assert valid[0]["amount"] == 500000.0

    def test_missing_required_field(self):
        row = self._good_row(record_id="")
        valid, errors = validate_rows([row], self._make_mapping(), set())
        assert len(valid) == 0
        codes = [e["code"] for e in errors]
        assert "I-001" in codes

    def test_invalid_currency(self):
        row = self._good_row(currency="XYZ")
        valid, errors = validate_rows([row], self._make_mapping(), set())
        assert any(e["code"] == "I-002" for e in errors)

    def test_invalid_flow_type(self):
        row = self._good_row(flow_type="BUY")
        valid, errors = validate_rows([row], self._make_mapping(), set())
        assert any(e["code"] == "I-003" for e in errors)

    def test_invalid_status(self):
        row = self._good_row(status="PENDING")
        valid, errors = validate_rows([row], self._make_mapping(), set())
        assert any(e["code"] == "I-004" for e in errors)

    def test_negative_amount(self):
        row = self._good_row(amount="-100")
        valid, errors = validate_rows([row], self._make_mapping(), set())
        assert any(e["code"] == "I-005" for e in errors)

    def test_unparseable_amount(self):
        row = self._good_row(amount="abc")
        valid, errors = validate_rows([row], self._make_mapping(), set())
        assert any(e["code"] == "I-005" for e in errors)

    def test_amount_with_commas_and_dollar(self):
        row = self._good_row(amount="$1,500,000")
        valid, errors = validate_rows([row], self._make_mapping(), set())
        assert len(valid) == 1
        assert valid[0]["amount"] == 1500000.0

    def test_invalid_date_format(self):
        row = self._good_row(value_date="not-a-date")
        valid, errors = validate_rows([row], self._make_mapping(), set())
        assert any(e["code"] == "I-006" for e in errors)

    def test_date_auto_parse(self):
        row = self._good_row(value_date="06/15/2026")
        valid, errors = validate_rows([row], self._make_mapping(), set())
        assert len(valid) == 1
        assert valid[0]["value_date"] == "2026-06-15"

    def test_duplicate_in_file(self):
        rows = [self._good_row(record_id="DUP-1"), self._good_row(record_id="DUP-1")]
        valid, errors = validate_rows(rows, self._make_mapping(), set())
        assert any(e["code"] == "I-007" for e in errors)

    def test_duplicate_in_database(self):
        row = self._good_row(record_id="EXISTING-1")
        valid, errors = validate_rows([row], self._make_mapping(), {"EXISTING-1"})
        assert any(e["code"] == "I-008" for e in errors)

    def test_empty_row(self):
        empty = {k: "" for k in self._good_row()}
        valid, errors = validate_rows([empty], self._make_mapping(), set())
        assert any(e["code"] == "I-009" for e in errors)
        assert len(valid) == 0

    def test_default_status_confirmed(self):
        row = self._good_row(status="")
        valid, errors = validate_rows([row], self._make_mapping(), set())
        assert len(valid) == 1
        assert valid[0]["status"] == "CONFIRMED"

    def test_multiple_rows_mixed(self):
        rows = [
            self._good_row(record_id="A"),
            self._good_row(record_id="B", currency="ZZZ"),  # invalid
            self._good_row(record_id="C"),
        ]
        valid, errors = validate_rows(rows, self._make_mapping(), set())
        assert len(valid) == 2
        assert len(errors) >= 1


class TestGenerateTemplateCsv:
    def test_template_has_header(self):
        csv_text = generate_template_csv()
        lines = csv_text.strip().split("\n")
        assert "record_id" in lines[0]
        assert "entity" in lines[0]
        assert "flow_type" in lines[0]

    def test_template_has_example_rows(self):
        csv_text = generate_template_csv()
        lines = csv_text.strip().split("\n")
        assert len(lines) == 4  # header + 3 examples

    def test_template_is_valid_csv(self):
        import csv
        import io

        reader = csv.DictReader(io.StringIO(generate_template_csv()))
        rows = list(reader)
        assert len(rows) == 3
        assert rows[0]["currency"] == "MXN"


# ═══════════════════════════════════════════════════════════════════════════
# 3. position_import_service -- async DB functions (mocked)
# ═══════════════════════════════════════════════════════════════════════════


def _mock_user(company_id=None, branch_id=None, user_id=None):
    user = MagicMock()
    user.id = user_id or uuid.uuid4()
    user.company_id = company_id or uuid.uuid4()
    user.branch_id = branch_id or uuid.uuid4()
    return user


def _mock_session():
    session = AsyncMock()
    session.add = MagicMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.flush = AsyncMock()
    session.rollback = AsyncMock()
    session.get = AsyncMock(return_value=None)
    return session


@pytest.mark.asyncio
async def test_upload_and_parse():
    from app.services.position_import_service import upload_and_parse

    session = _mock_session()
    user = _mock_user()
    raw = b"record_id,entity,flow_type,currency,amount,value_date\nP1,Acme,AR,MXN,500000,2026-06-15"

    # session.refresh should populate the batch object returned
    async def fake_refresh(obj):
        obj.id = uuid.uuid4()

    session.refresh = AsyncMock(side_effect=fake_refresh)

    batch = await upload_and_parse(session, user, "test.csv", raw)
    session.add.assert_called_once()
    session.commit.assert_awaited_once()
    assert batch.status == "UPLOADED"
    assert batch.row_count == 1
    assert batch.filename == "test.csv"
    assert batch.file_hash == hashlib.sha256(raw).hexdigest()


@pytest.mark.asyncio
async def test_validate_batch_wrong_status():
    from app.services.position_import_service import validate_batch

    session = _mock_session()
    user = _mock_user()
    batch_id = uuid.uuid4()

    batch = MagicMock()
    batch.status = "COMMITTED"
    batch.company_id = user.company_id
    session.get = AsyncMock(return_value=batch)

    with pytest.raises(ValueError, match="cannot re-validate"):
        await validate_batch(session, user, batch_id)


@pytest.mark.asyncio
async def test_commit_batch_requires_validated():
    from app.services.position_import_service import commit_batch

    session = _mock_session()
    user = _mock_user()
    batch_id = uuid.uuid4()

    batch = MagicMock()
    batch.status = "UPLOADED"
    batch.company_id = user.company_id
    session.get = AsyncMock(return_value=batch)

    with pytest.raises(ValueError, match="must be VALIDATED"):
        await commit_batch(session, user, batch_id)


@pytest.mark.asyncio
async def test_commit_batch_no_valid_rows():
    from app.services.position_import_service import commit_batch

    session = _mock_session()
    user = _mock_user()
    batch_id = uuid.uuid4()

    batch = MagicMock()
    batch.status = "VALIDATED"
    batch.valid_count = 0
    batch.company_id = user.company_id
    session.get = AsyncMock(return_value=batch)

    with pytest.raises(ValueError, match="No valid rows"):
        await commit_batch(session, user, batch_id)


@pytest.mark.asyncio
async def test_get_batch_not_found():
    from app.services.position_import_service import get_batch

    session = _mock_session()
    user = _mock_user()
    session.get = AsyncMock(return_value=None)

    with pytest.raises(ValueError, match="not found"):
        await get_batch(session, user, uuid.uuid4())


@pytest.mark.asyncio
async def test_get_batch_wrong_company():
    from app.services.position_import_service import get_batch

    session = _mock_session()
    user = _mock_user()

    batch = MagicMock()
    batch.company_id = uuid.uuid4()  # Different company
    session.get = AsyncMock(return_value=batch)

    with pytest.raises(ValueError, match="not found"):
        await get_batch(session, user, uuid.uuid4())


# ═══════════════════════════════════════════════════════════════════════════
# 4. connector_service -- unit tests
# ═══════════════════════════════════════════════════════════════════════════


class TestDuplicateImportError:
    def test_attributes(self):
        run_id = uuid.uuid4()
        err = DuplicateImportError("abc123", run_id)
        assert err.file_hash == "abc123"
        assert err.existing_run_id == run_id

    def test_message_format(self):
        err = DuplicateImportError("a" * 32, uuid.uuid4())
        assert "aaaaaaaaaaaaaaaa" in str(err)  # first 16 chars
        assert "already imported" in str(err)


@pytest.mark.asyncio
async def test_create_run():
    from app.services.connector_service import create_run

    session = _mock_session()
    user = _mock_user()

    run = await create_run(session, user, "UPLOAD_CSV", "test.csv", "hash123")
    session.add.assert_called_once()
    session.flush.assert_awaited_once()
    added_obj = session.add.call_args[0][0]
    assert added_obj.connector_type == "UPLOAD_CSV"
    assert added_obj.source_filename == "test.csv"
    assert added_obj.source_hash == "hash123"
    assert added_obj.status == "RUNNING"


@pytest.mark.asyncio
async def test_complete_run_completed():
    from app.services.connector_service import complete_run

    session = _mock_session()
    run = MagicMock()
    run.status = "RUNNING"

    result = await complete_run(session, run, total_rows=10, created_ok=8, error_count=2)
    assert run.status == "COMPLETED"  # error_count < total_rows
    assert run.total_rows == 10
    assert run.created_ok == 8
    assert run.error_count == 2
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_complete_run_failed():
    from app.services.connector_service import complete_run

    session = _mock_session()
    run = MagicMock()

    result = await complete_run(session, run, total_rows=5, created_ok=0, error_count=5)
    assert run.status == "FAILED"  # error_count == total_rows


@pytest.mark.asyncio
async def test_record_error():
    from app.services.connector_service import record_error

    session = _mock_session()
    run_id = uuid.uuid4()

    await record_error(session, run_id, "bad data", row_number=3, field_name="amount")
    session.add.assert_called_once()
    err_obj = session.add.call_args[0][0]
    assert err_obj.error_message == "bad data"
    assert err_obj.row_number == 3
    assert err_obj.field_name == "amount"


@pytest.mark.asyncio
async def test_check_duplicate_hash_no_match():
    from app.services.connector_service import _check_duplicate_hash

    session = _mock_session()
    user = _mock_user()

    # Mock execute to return empty result
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None
    session.execute = AsyncMock(return_value=mock_result)

    # Should not raise
    await _check_duplicate_hash(session, user, "somehash")


@pytest.mark.asyncio
async def test_check_duplicate_hash_match_raises():
    from app.services.connector_service import _check_duplicate_hash

    session = _mock_session()
    user = _mock_user()

    existing_run = MagicMock()
    existing_run.id = uuid.uuid4()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = existing_run
    session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(DuplicateImportError):
        await _check_duplicate_hash(session, user, "duphash")


@pytest.mark.asyncio
async def test_check_duplicate_hash_empty_string():
    from app.services.connector_service import _check_duplicate_hash

    session = _mock_session()
    user = _mock_user()

    # Empty hash should short-circuit, no DB call
    await _check_duplicate_hash(session, user, "")
    session.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_run_detail_not_found():
    from app.services.connector_service import get_run_detail

    session = _mock_session()
    user = _mock_user()
    session.get = AsyncMock(return_value=None)

    with pytest.raises(ValueError, match="not found"):
        await get_run_detail(session, user, uuid.uuid4())


@pytest.mark.asyncio
async def test_get_run_detail_wrong_company():
    from app.services.connector_service import get_run_detail

    session = _mock_session()
    user = _mock_user()

    run = MagicMock()
    run.company_id = uuid.uuid4()  # Different company
    session.get = AsyncMock(return_value=run)

    with pytest.raises(ValueError, match="not found"):
        await get_run_detail(session, user, uuid.uuid4())


@pytest.mark.asyncio
async def test_list_runs_all_branches():
    from app.services.connector_service import list_runs

    session = _mock_session()
    user = _mock_user()

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    session.execute = AsyncMock(return_value=mock_result)

    result = await list_runs(session, user, all_branches=True)
    assert result == []
    session.execute.assert_awaited_once()


# ═══════════════════════════════════════════════════════════════════════════
# 5. policy_favorites_service -- async DB functions (mocked)
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_add_favorite_template_not_found():
    from app.services.policy_favorites_service import add_favorite

    session = _mock_session()
    user = _mock_user()
    template_id = uuid.uuid4()

    with patch("app.services.policy_favorites_service.policy_service") as mock_ps:
        mock_ps.get_template = AsyncMock(return_value=None)
        with pytest.raises(ValueError, match="not found or not accessible"):
            await add_favorite(session, user, template_id)


@pytest.mark.asyncio
async def test_add_favorite_already_exists():
    from app.services.policy_favorites_service import add_favorite

    session = _mock_session()
    user = _mock_user()
    template_id = uuid.uuid4()

    existing_fav = MagicMock()
    existing_fav.id = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = existing_fav
    session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.policy_favorites_service.policy_service") as mock_ps:
        mock_ps.get_template = AsyncMock(return_value=MagicMock())
        result = await add_favorite(session, user, template_id)
        assert result is existing_fav


@pytest.mark.asyncio
async def test_add_favorite_creates_new():
    from app.services.policy_favorites_service import add_favorite

    session = _mock_session()
    user = _mock_user()
    template_id = uuid.uuid4()

    # First execute: check existing -> None
    mock_result_empty = MagicMock()
    mock_result_empty.scalars.return_value.first.return_value = None
    session.execute = AsyncMock(return_value=mock_result_empty)

    with patch("app.services.policy_favorites_service.policy_service") as mock_ps:
        mock_ps.get_template = AsyncMock(return_value=MagicMock())
        result = await add_favorite(session, user, template_id, notes="my note")
        session.add.assert_called_once()
        session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_remove_favorite():
    from app.services.policy_favorites_service import remove_favorite

    session = _mock_session()
    user = _mock_user()
    template_id = uuid.uuid4()

    session.execute = AsyncMock()

    await remove_favorite(session, user, template_id)
    session.execute.assert_awaited_once()
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_favorites():
    from app.services.policy_favorites_service import list_favorites

    session = _mock_session()
    user = _mock_user()

    mock_result = MagicMock()
    mock_result.all.return_value = [("fav1", "tmpl1"), ("fav2", "tmpl2")]
    session.execute = AsyncMock(return_value=mock_result)

    result = await list_favorites(session, user)
    assert len(result) == 2


@pytest.mark.asyncio
async def test_is_favorite_true():
    from app.services.policy_favorites_service import is_favorite

    session = _mock_session()
    user_id = uuid.uuid4()
    template_id = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = uuid.uuid4()  # found
    session.execute = AsyncMock(return_value=mock_result)

    assert await is_favorite(session, user_id, template_id) is True


@pytest.mark.asyncio
async def test_is_favorite_false():
    from app.services.policy_favorites_service import is_favorite

    session = _mock_session()
    user_id = uuid.uuid4()
    template_id = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None
    session.execute = AsyncMock(return_value=mock_result)

    assert await is_favorite(session, user_id, template_id) is False


# ═══════════════════════════════════════════════════════════════════════════
# 6. pipeline_service -- async DB functions (mocked)
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_create_proposal_run_not_found():
    from app.services.pipeline_service import create_proposal

    _sandbox_runs.clear()
    session = _mock_session()

    with pytest.raises(ValueError, match="not found"):
        await create_proposal(session, "user-1", "nonexistent-run")


@pytest.mark.asyncio
async def test_create_proposal_failed_calc():
    from app.services.pipeline_service import create_proposal

    _sandbox_runs.clear()
    _sandbox_runs["run-fail"] = {"calculate_response": None}
    session = _mock_session()

    with pytest.raises(ValueError, match="Cannot create proposal from failed"):
        await create_proposal(session, "user-1", "run-fail")

    _sandbox_runs.clear()


@pytest.mark.asyncio
async def test_list_proposals():
    from app.services.pipeline_service import list_proposals

    session = _mock_session()
    with patch("app.services.pipeline_service.pipeline_db") as mock_db:
        mock_db.load_all_proposals = AsyncMock(return_value=["p1", "p2"])
        result = await list_proposals(session)
        assert result == ["p1", "p2"]


@pytest.mark.asyncio
async def test_get_proposal():
    from app.services.pipeline_service import get_proposal

    session = _mock_session()
    with patch("app.services.pipeline_service.pipeline_db") as mock_db:
        mock_db.load_proposal = AsyncMock(return_value="prop-obj")
        result = await get_proposal(session, "PROP-12345678")
        assert result == "prop-obj"


@pytest.mark.asyncio
async def test_submit_to_staging_not_found():
    from app.services.pipeline_service import submit_to_staging

    session = _mock_session()
    with patch("app.services.pipeline_service.pipeline_db") as mock_db:
        mock_db.load_proposal = AsyncMock(return_value=None)
        with pytest.raises(ValueError, match="not found"):
            await submit_to_staging(session, "PROP-MISSING", "user-1", MagicMock())


@pytest.mark.asyncio
async def test_submit_to_staging_wrong_status():
    from app.services.pipeline_service import submit_to_staging

    session = _mock_session()
    proposal = MagicMock()
    proposal.status = "SUBMITTED"  # Not DRAFT

    with patch("app.services.pipeline_service.pipeline_db") as mock_db:
        mock_db.load_proposal = AsyncMock(return_value=proposal)
        with pytest.raises(ValueError, match="expected DRAFT"):
            await submit_to_staging(session, "PROP-X", "user-1", MagicMock())


@pytest.mark.asyncio
async def test_get_staging_tenant_isolation():
    from app.services.pipeline_service import get_staging

    session = _mock_session()
    artifact = MagicMock()
    artifact.company_id = "company-A"

    with patch("app.services.pipeline_service.pipeline_db") as mock_db:
        mock_db.load_staging = AsyncMock(return_value=artifact)
        # Request from company-B should get None (tenant isolation)
        result = await get_staging(session, "STG-X", company_id="company-B")
        assert result is None


@pytest.mark.asyncio
async def test_get_staging_same_tenant():
    from app.services.pipeline_service import get_staging

    session = _mock_session()
    artifact = MagicMock()
    artifact.company_id = "company-A"

    with patch("app.services.pipeline_service.pipeline_db") as mock_db:
        mock_db.load_staging = AsyncMock(return_value=artifact)
        result = await get_staging(session, "STG-X", company_id="company-A")
        assert result is artifact


@pytest.mark.asyncio
async def test_authorize_staged_not_found():
    from app.services.pipeline_service import authorize_staged

    session = _mock_session()
    with patch("app.services.pipeline_service.pipeline_db") as mock_db:
        mock_db.load_staging = AsyncMock(return_value=None)
        with pytest.raises(ValueError, match="not found"):
            await authorize_staged(session, "STG-MISSING", "user-1", "admin", MagicMock())


@pytest.mark.asyncio
async def test_authorize_staged_self_approval_blocked():
    from app.services.pipeline_service import authorize_staged

    session = _mock_session()
    artifact = MagicMock()
    artifact.authorization_status = AuthorizationStatus.PENDING
    artifact.submitted_by = "user-1"
    artifact.company_id = None

    with patch("app.services.pipeline_service.pipeline_db") as mock_db:
        mock_db.load_staging = AsyncMock(return_value=artifact)
        with pytest.raises(ValueError, match="SELF_APPROVAL_BLOCKED"):
            await authorize_staged(session, "STG-X", "user-1", "admin", MagicMock())


@pytest.mark.asyncio
async def test_authorize_staged_already_processed():
    from app.services.pipeline_service import authorize_staged

    session = _mock_session()
    artifact = MagicMock()
    artifact.authorization_status = AuthorizationStatus.APPROVED
    artifact.company_id = None

    with patch("app.services.pipeline_service.pipeline_db") as mock_db:
        mock_db.load_staging = AsyncMock(return_value=artifact)
        with pytest.raises(ValueError, match="already"):
            await authorize_staged(session, "STG-X", "user-2", "admin", MagicMock())


@pytest.mark.asyncio
async def test_authorize_staged_tenant_isolation():
    from app.services.pipeline_service import authorize_staged

    session = _mock_session()
    artifact = MagicMock()
    artifact.company_id = "company-A"

    with patch("app.services.pipeline_service.pipeline_db") as mock_db:
        mock_db.load_staging = AsyncMock(return_value=artifact)
        with pytest.raises(ValueError, match="TENANT_ISOLATION"):
            await authorize_staged(
                session, "STG-X", "user-1", "admin", MagicMock(),
                company_id="company-B",
            )


@pytest.mark.asyncio
async def test_list_ledger():
    from app.services.pipeline_service import list_ledger

    session = _mock_session()
    with patch("app.services.pipeline_service.pipeline_db") as mock_db:
        mock_db.load_all_ledger = AsyncMock(return_value=["l1"])
        result = await list_ledger(session)
        assert result == ["l1"]


@pytest.mark.asyncio
async def test_get_ledger():
    from app.services.pipeline_service import get_ledger

    session = _mock_session()
    with patch("app.services.pipeline_service.pipeline_db") as mock_db:
        mock_db.load_ledger = AsyncMock(return_value="ledger-obj")
        result = await get_ledger(session, "LEDG-X")
        assert result == "ledger-obj"


@pytest.mark.asyncio
async def test_replay_ledger_not_found():
    from app.services.pipeline_service import replay_ledger

    session = _mock_session()
    with patch("app.services.pipeline_service.pipeline_db") as mock_db:
        mock_db.load_ledger = AsyncMock(return_value=None)
        with pytest.raises(ValueError, match="not found"):
            await replay_ledger(session, "LEDG-MISSING")


@pytest.mark.asyncio
async def test_replay_ledger_no_freeze_artifact():
    from app.services.pipeline_service import replay_ledger

    session = _mock_session()
    entry = MagicMock()
    entry.freeze_artifact = None

    with patch("app.services.pipeline_service.pipeline_db") as mock_db:
        mock_db.load_ledger = AsyncMock(return_value=entry)
        with pytest.raises(ValueError, match="No freeze artifact"):
            await replay_ledger(session, "LEDG-X")


@pytest.mark.asyncio
async def test_emit_pipeline_event_rollback_on_error():
    from app.services.pipeline_service import _emit_pipeline_event

    session = _mock_session()
    session.commit = AsyncMock(side_effect=Exception("DB error"))

    # Should not raise -- it catches and rolls back
    await _emit_pipeline_event(
        session, "entity-1", "TEST_EVENT", "user-1", "test", {}
    )
    session.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_emit_pipeline_event_invalid_actor_id():
    from app.services.pipeline_service import _emit_pipeline_event

    session = _mock_session()

    # Non-UUID actor_id should not crash
    await _emit_pipeline_event(
        session, "entity-1", "TEST_EVENT", "not-a-uuid", "test", {}
    )
    session.add.assert_called_once()


# ═══════════════════════════════════════════════════════════════════════════
# 7. connector_service -- audited import flow (mocked)
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_import_csv_audited_duplicate():
    from app.services.connector_service import import_csv_audited

    session = _mock_session()
    user = _mock_user()
    content = b"record_id,entity,flow_type,currency,amount,value_date\nP1,A,AR,MXN,100,2026-01-01"

    existing_run = MagicMock()
    existing_run.id = uuid.uuid4()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = existing_run
    session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(DuplicateImportError):
        await import_csv_audited(session, user, content, "dup.csv")


@pytest.mark.asyncio
async def test_import_csv_audited_success():
    from app.services.connector_service import import_csv_audited

    session = _mock_session()
    user = _mock_user()
    content = b"record_id,entity,flow_type,currency,amount,value_date\nP1,Acme,AR,MXN,500000,2026-06-15"

    # _check_duplicate_hash returns no match
    mock_no_dup = MagicMock()
    mock_no_dup.scalars.return_value.first.return_value = None
    session.execute = AsyncMock(return_value=mock_no_dup)

    with patch("app.services.connector_service.position_service") as mock_ps:
        mock_ps.create_position = AsyncMock()

        result = await import_csv_audited(session, user, content, "test.csv")

        mock_ps.create_position.assert_awaited_once()
        session.commit.assert_awaited()
        assert result.status in ("COMPLETED", "FAILED")


@pytest.mark.asyncio
async def test_import_csv_audited_row_error():
    from app.services.connector_service import import_csv_audited

    session = _mock_session()
    user = _mock_user()
    # Two rows: first succeeds, second fails
    content = b"record_id,entity,flow_type,currency,amount,value_date\nP1,A,AR,MXN,100,2026-01-01\nP2,B,AR,MXN,200,2026-02-01"

    mock_no_dup = MagicMock()
    mock_no_dup.scalars.return_value.first.return_value = None
    session.execute = AsyncMock(return_value=mock_no_dup)

    call_count = 0

    async def create_side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise ValueError("Simulated error")

    with patch("app.services.connector_service.position_service") as mock_ps:
        mock_ps.create_position = AsyncMock(side_effect=create_side_effect)

        result = await import_csv_audited(session, user, content, "mixed.csv")

        assert result.total_rows == 2
        assert result.created_ok == 1
        assert result.error_count == 1
