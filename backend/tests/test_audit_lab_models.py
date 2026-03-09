"""
backend/tests/test_audit_lab_models.py

Unit tests for Audit Lab ORM models (audit_lab.py).
Validates column definitions, table args, defaults, and repr methods.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime

import pytest

from app.models.audit_lab import (
    AuditDataset,
    AuditFinding,
    AuditReport,
    AuditRun,
    AuditTransaction,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _col(model, name):
    """Return the SQLAlchemy Column object for a mapped attribute."""
    return model.__table__.columns[name]


def _index_names(model):
    """Return set of index names defined on the model's table."""
    return {idx.name for idx in model.__table__.indexes}


def _unique_constraint_names(model):
    """Return set of unique constraint names defined via __table_args__."""
    from sqlalchemy import UniqueConstraint
    return {
        c.name
        for c in model.__table__.constraints
        if isinstance(c, UniqueConstraint) and c.name
    }


# ===========================================================================
# AuditDataset
# ===========================================================================

class TestAuditDataset:

    def test_tablename(self):
        assert AuditDataset.__tablename__ == "audit_datasets"

    def test_primary_key(self):
        col = _col(AuditDataset, "id")
        assert col.primary_key

    def test_company_id_not_nullable(self):
        col = _col(AuditDataset, "company_id")
        assert not col.nullable
        fk = list(col.foreign_keys)[0]
        assert fk.target_fullname == "companies.id"

    def test_created_by_fk(self):
        col = _col(AuditDataset, "created_by")
        assert not col.nullable
        fk = list(col.foreign_keys)[0]
        assert fk.target_fullname == "users.id"

    def test_required_columns(self):
        for name in ("period_start", "period_end", "source_filename",
                      "source_hash", "row_count"):
            assert not _col(AuditDataset, name).nullable, f"{name} should be NOT NULL"

    def test_currency_pairs_nullable(self):
        assert _col(AuditDataset, "currency_pairs").nullable

    def test_unique_constraint(self):
        names = _unique_constraint_names(AuditDataset)
        assert "uix_audit_datasets_company_source_hash" in names

    def test_indexes(self):
        names = _index_names(AuditDataset)
        assert "ix_audit_datasets_company" in names

    def test_instance_defaults(self):
        ds = AuditDataset(
            company_id=uuid.uuid4(),
            period_start=date(2025, 1, 1),
            period_end=date(2025, 12, 31),
            source_filename="stmt.csv",
            source_hash="abc123",
            row_count=42,
            created_by=uuid.uuid4(),
        )
        # uuid4 default is a callable — only populated at flush/insert
        assert ds.row_count == 42
        assert ds.source_filename == "stmt.csv"

    def test_repr(self):
        ds = AuditDataset(
            id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            period_start=date(2025, 1, 1),
            period_end=date(2025, 12, 31),
            source_filename="stmt.csv",
            source_hash="abc123",
            row_count=10,
            created_by=uuid.uuid4(),
        )
        r = repr(ds)
        assert "AuditDataset" in r
        assert "stmt.csv" in r


# ===========================================================================
# AuditTransaction
# ===========================================================================

class TestAuditTransaction:

    def test_tablename(self):
        assert AuditTransaction.__tablename__ == "audit_transactions"

    def test_primary_key(self):
        assert _col(AuditTransaction, "id").primary_key

    def test_dataset_id_fk(self):
        col = _col(AuditTransaction, "dataset_id")
        assert not col.nullable
        fk = list(col.foreign_keys)[0]
        assert fk.target_fullname == "audit_datasets.id"

    def test_company_id_fk(self):
        col = _col(AuditTransaction, "company_id")
        assert not col.nullable
        fk = list(col.foreign_keys)[0]
        assert fk.target_fullname == "companies.id"

    def test_row_hash_not_nullable(self):
        assert not _col(AuditTransaction, "row_hash").nullable

    def test_nullable_fields(self):
        for name in ("trade_date", "value_date", "currency_sold",
                      "currency_bought", "amount_sold", "amount_bought",
                      "effective_rate", "counterparty", "fee_amount",
                      "fee_currency", "reference", "parse_warnings"):
            assert _col(AuditTransaction, name).nullable, f"{name} should be nullable"

    def test_indexes(self):
        names = _index_names(AuditTransaction)
        assert "ix_audit_transactions_dataset" in names
        assert "ix_audit_transactions_company" in names
        assert "ix_audit_transactions_dataset_trade_date" in names
        assert "ix_audit_transactions_dataset_ccy_pair" in names

    def test_instance_creation(self):
        txn = AuditTransaction(
            dataset_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            row_index=0,
            row_hash="deadbeef",
        )
        assert txn.row_index == 0
        assert txn.row_hash == "deadbeef"

    def test_repr(self):
        txn = AuditTransaction(
            id=uuid.uuid4(),
            dataset_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            row_index=5,
            currency_sold="USD",
            currency_bought="MXN",
            row_hash="abc",
        )
        r = repr(txn)
        assert "AuditTransaction" in r
        assert "USD/MXN" in r


# ===========================================================================
# AuditRun
# ===========================================================================

class TestAuditRun:

    def test_tablename(self):
        assert AuditRun.__tablename__ == "audit_runs"

    def test_primary_key(self):
        assert _col(AuditRun, "id").primary_key

    def test_foreign_keys(self):
        assert list(_col(AuditRun, "company_id").foreign_keys)
        assert list(_col(AuditRun, "dataset_id").foreign_keys)
        assert list(_col(AuditRun, "created_by").foreign_keys)

    def test_required_columns(self):
        for name in ("methodology_version", "benchmark_config", "run_hash",
                      "inputs_hash", "outputs_hash", "trace_bundle", "status"):
            assert not _col(AuditRun, name).nullable, f"{name} should be NOT NULL"

    def test_status_column_default(self):
        """The column has a default='COMPLETED' that fires at INSERT time."""
        col = _col(AuditRun, "status")
        assert col.default is not None
        assert col.default.arg == "COMPLETED"

    def test_indexes(self):
        names = _index_names(AuditRun)
        assert "ix_audit_runs_company" in names
        assert "ix_audit_runs_dataset" in names

    def test_repr(self):
        run = AuditRun(
            id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            dataset_id=uuid.uuid4(),
            methodology_version="1.0.0",
            benchmark_config={},
            run_hash="a" * 64,
            inputs_hash="b" * 64,
            outputs_hash="c" * 64,
            trace_bundle={},
            status="COMPLETED",
            created_by=uuid.uuid4(),
        )
        r = repr(run)
        assert "AuditRun" in r
        assert "COMPLETED" in r
        assert "1.0.0" in r


# ===========================================================================
# AuditFinding
# ===========================================================================

class TestAuditFinding:

    def test_tablename(self):
        assert AuditFinding.__tablename__ == "audit_findings"

    def test_primary_key(self):
        assert _col(AuditFinding, "id").primary_key

    def test_run_id_fk(self):
        col = _col(AuditFinding, "run_id")
        assert not col.nullable
        fk = list(col.foreign_keys)[0]
        assert fk.target_fullname == "audit_runs.id"

    def test_company_id_fk(self):
        col = _col(AuditFinding, "company_id")
        assert not col.nullable

    def test_required_columns(self):
        for name in ("finding_type", "amount_usd", "severity",
                      "narrative", "finding_hash"):
            assert not _col(AuditFinding, name).nullable, f"{name} should be NOT NULL"

    def test_nullable_fields(self):
        for name in ("currency_pair", "counterparty", "amount_local", "local_currency"):
            assert _col(AuditFinding, name).nullable, f"{name} should be nullable"

    def test_evidence_server_default(self):
        col = _col(AuditFinding, "evidence")
        assert col.server_default is not None

    def test_indexes(self):
        names = _index_names(AuditFinding)
        assert "ix_audit_findings_run" in names
        assert "ix_audit_findings_company" in names
        assert "ix_audit_findings_run_type" in names
        assert "ix_audit_findings_company_severity" in names

    def test_instance_creation(self):
        f = AuditFinding(
            run_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            finding_type="RATE_DEVIATION",
            amount_usd=1234.56,
            severity="HIGH",
            narrative="Rate 2.3% above benchmark",
            finding_hash="deadbeef",
        )
        assert f.finding_type == "RATE_DEVIATION"
        assert f.amount_usd == 1234.56

    def test_repr(self):
        f = AuditFinding(
            id=uuid.uuid4(),
            run_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            finding_type="FEE_OUTLIER",
            amount_usd=500.0,
            severity="MEDIUM",
            narrative="Fee above threshold",
            finding_hash="abc",
        )
        r = repr(f)
        assert "AuditFinding" in r
        assert "FEE_OUTLIER" in r
        assert "MEDIUM" in r


# ===========================================================================
# AuditReport
# ===========================================================================

class TestAuditReport:

    def test_tablename(self):
        assert AuditReport.__tablename__ == "audit_reports"

    def test_primary_key(self):
        assert _col(AuditReport, "id").primary_key

    def test_run_id_fk(self):
        col = _col(AuditReport, "run_id")
        assert not col.nullable
        fk = list(col.foreign_keys)[0]
        assert fk.target_fullname == "audit_runs.id"

    def test_company_id_fk(self):
        col = _col(AuditReport, "company_id")
        assert not col.nullable

    def test_required_columns(self):
        for name in ("report_json", "report_hash"):
            assert not _col(AuditReport, name).nullable, f"{name} should be NOT NULL"

    def test_indexes(self):
        names = _index_names(AuditReport)
        assert "ix_audit_reports_run" in names

    def test_instance_creation(self):
        rpt = AuditReport(
            run_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            report_json={"summary": "ok"},
            report_hash="abcdef12",
        )
        assert rpt.report_hash == "abcdef12"

    def test_repr(self):
        rpt = AuditReport(
            id=uuid.uuid4(),
            run_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            report_json={},
            report_hash="abcdef1234567890",
        )
        r = repr(rpt)
        assert "AuditReport" in r
        assert "abcdef12" in r


# ===========================================================================
# Cross-model checks
# ===========================================================================

class TestCrossModel:

    def test_all_five_tables_distinct(self):
        tables = {
            AuditDataset.__tablename__,
            AuditTransaction.__tablename__,
            AuditRun.__tablename__,
            AuditFinding.__tablename__,
            AuditReport.__tablename__,
        }
        assert len(tables) == 5

    def test_all_have_id_and_created_at(self):
        for model in (AuditDataset, AuditTransaction, AuditRun,
                       AuditFinding, AuditReport):
            assert _col(model, "id").primary_key, f"{model.__tablename__} missing PK"
            assert "created_at" in model.__table__.columns, \
                f"{model.__tablename__} missing created_at"

    def test_all_have_company_id(self):
        for model in (AuditDataset, AuditTransaction, AuditRun,
                       AuditFinding, AuditReport):
            col = _col(model, "company_id")
            assert not col.nullable, f"{model.__tablename__}.company_id should be NOT NULL"
