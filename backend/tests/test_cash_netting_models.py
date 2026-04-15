"""Tests for intercompany netting ORM models and audit enum additions."""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest

from app.models.cash import CashAuditEventType
from app.models.cash_netting import IntercompanyObligation, NettingProposal


# ── IntercompanyObligation ────────────────────────────────────────────


class TestIntercompanyObligation:
    def test_tablename(self):
        assert IntercompanyObligation.__tablename__ == "intercompany_obligations"

    def test_columns_present(self):
        cols = {c.key for c in IntercompanyObligation.__table__.columns}
        expected = {
            "id", "company_id", "debtor_entity_id", "creditor_entity_id",
            "amount", "currency", "due_date", "reference", "status",
            "created_by", "created_at", "updated_at",
        }
        assert expected.issubset(cols)

    def test_default_status(self):
        col = IntercompanyObligation.__table__.c.status
        assert col.default.arg == "PENDING"

    def test_company_id_indexed(self):
        col = IntercompanyObligation.__table__.c.company_id
        assert col.index is True

    def test_currency_max_length(self):
        col = IntercompanyObligation.__table__.c.currency
        assert col.type.length == 3

    def test_amount_precision(self):
        col = IntercompanyObligation.__table__.c.amount
        assert col.type.precision == 20
        assert col.type.scale == 6


# ── NettingProposal ──────────────────────────────────────────────────


class TestNettingProposal:
    def test_tablename(self):
        assert NettingProposal.__tablename__ == "netting_proposals"

    def test_columns_present(self):
        cols = {c.key for c in NettingProposal.__table__.columns}
        expected = {
            "id", "company_id", "status", "entity_a_id", "entity_b_id",
            "currency", "gross_payable", "gross_receivable", "net_amount",
            "net_direction", "savings", "obligation_ids", "proposed_by",
            "approved_by", "proposed_at", "approved_at", "executed_at",
        }
        assert expected.issubset(cols)

    def test_default_status(self):
        col = NettingProposal.__table__.c.status
        assert col.default.arg == "DRAFT"

    def test_approved_by_nullable(self):
        col = NettingProposal.__table__.c.approved_by
        assert col.nullable is True

    def test_executed_at_nullable(self):
        col = NettingProposal.__table__.c.executed_at
        assert col.nullable is True

    def test_net_direction_max_length(self):
        col = NettingProposal.__table__.c.net_direction
        assert col.type.length == 4


# ── Audit enum additions ─────────────────────────────────────────────


class TestNettingAuditEnums:
    def test_netting_proposed_exists(self):
        assert CashAuditEventType.NETTING_PROPOSED.value == "NETTING_PROPOSED"

    def test_netting_approved_exists(self):
        assert CashAuditEventType.NETTING_APPROVED.value == "NETTING_APPROVED"

    def test_netting_executed_exists(self):
        assert CashAuditEventType.NETTING_EXECUTED.value == "NETTING_EXECUTED"

    def test_enum_count_includes_netting(self):
        # Original 16 + 3 netting = 19
        assert len(CashAuditEventType) == 19


# ── CashForecastItem counterparty column ─────────────────────────────


class TestForecastCounterparty:
    def test_counterparty_entity_id_exists(self):
        from app.models.cash_forecast import CashForecastItem
        cols = {c.key for c in CashForecastItem.__table__.columns}
        assert "counterparty_entity_id" in cols

    def test_counterparty_entity_id_nullable(self):
        from app.models.cash_forecast import CashForecastItem
        col = CashForecastItem.__table__.c.counterparty_entity_id
        assert col.nullable is True
