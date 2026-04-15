"""Tests for cash pool ORM models and audit enum addition."""
from __future__ import annotations

import pytest

from app.models.cash import CashAuditEventType
from app.models.cash_pool import TreasuryEntity, CashPool, CashPoolMember, CashPoolSweep


class TestTreasuryEntity:
    def test_tablename(self):
        assert TreasuryEntity.__tablename__ == "treasury_entities"

    def test_columns_present(self):
        cols = {c.key for c in TreasuryEntity.__table__.columns}
        expected = {
            "id", "company_id", "name", "entity_type", "base_currency",
            "country_code", "erp_ref", "parent_entity_id", "is_active", "created_at",
        }
        assert expected.issubset(cols)

    def test_default_entity_type(self):
        col = TreasuryEntity.__table__.c.entity_type
        assert col.default.arg == "SUBSIDIARY"

    def test_company_id_indexed(self):
        col = TreasuryEntity.__table__.c.company_id
        assert col.index is True

    def test_erp_ref_nullable(self):
        col = TreasuryEntity.__table__.c.erp_ref
        assert col.nullable is True

    def test_parent_entity_id_nullable(self):
        col = TreasuryEntity.__table__.c.parent_entity_id
        assert col.nullable is True


class TestCashPool:
    def test_tablename(self):
        assert CashPool.__tablename__ == "cash_pools"

    def test_columns_present(self):
        cols = {c.key for c in CashPool.__table__.columns}
        expected = {
            "id", "company_id", "name", "pool_type", "header_account_id",
            "currency", "base_currency", "is_active", "created_by", "created_at",
        }
        assert expected.issubset(cols)

    def test_default_is_active(self):
        col = CashPool.__table__.c.is_active
        assert col.default.arg is True

    def test_currency_max_length(self):
        col = CashPool.__table__.c.currency
        assert col.type.length == 3


class TestCashPoolMember:
    def test_tablename(self):
        assert CashPoolMember.__tablename__ == "cash_pool_members"

    def test_columns_present(self):
        cols = {c.key for c in CashPoolMember.__table__.columns}
        expected = {
            "id", "pool_id", "account_id", "entity_id",
            "participation_type", "target_balance", "created_at",
        }
        assert expected.issubset(cols)

    def test_default_participation_type(self):
        col = CashPoolMember.__table__.c.participation_type
        assert col.default.arg == "FULL"

    def test_target_balance_nullable(self):
        col = CashPoolMember.__table__.c.target_balance
        assert col.nullable is True

    def test_pool_id_indexed(self):
        col = CashPoolMember.__table__.c.pool_id
        assert col.index is True

    def test_unique_constraint_exists(self):
        constraints = [c for c in CashPoolMember.__table__.constraints
                       if hasattr(c, 'columns') and 'pool_id' in {col.key for col in c.columns}
                       and 'account_id' in {col.key for col in c.columns}]
        assert len(constraints) > 0


class TestCashPoolSweep:
    def test_tablename(self):
        assert CashPoolSweep.__tablename__ == "cash_pool_sweeps"

    def test_columns_present(self):
        cols = {c.key for c in CashPoolSweep.__table__.columns}
        expected = {
            "id", "pool_id", "source_account_id", "destination_account_id",
            "amount", "currency", "direction", "status", "triggered_by",
            "executed_at", "created_at",
        }
        assert expected.issubset(cols)

    def test_default_status(self):
        col = CashPoolSweep.__table__.c.status
        assert col.default.arg == "PENDING"

    def test_executed_at_nullable(self):
        col = CashPoolSweep.__table__.c.executed_at
        assert col.nullable is True

    def test_amount_precision(self):
        col = CashPoolSweep.__table__.c.amount
        assert col.type.precision == 20
        assert col.type.scale == 6


class TestCashPoolAuditEnum:
    def test_cash_pool_sweep_exists(self):
        assert CashAuditEventType.CASH_POOL_SWEEP.value == "CASH_POOL_SWEEP"
