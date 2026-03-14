"""
Tests for database model fixes D-C1, D-C2, D-C3, D-C4.

D-C1: __import__ hack removed from ExecutionProposal fill columns
D-C2: int FK -> UUID type alignment on AuditLog, AuthAuditLog, ApiKeyAuditLog
D-C3: Float -> Numeric(20,6) for monetary amounts on ExecutionProposal
D-C4: Misleading WORM docstring corrected on ExecutionProposal
"""

import inspect
import uuid
from decimal import Decimal

import pytest
from sqlalchemy import Float, Numeric, String, inspect as sa_inspect

from app.models.execution_proposal import ExecutionProposal
from app.models.audit_log import AuditLog
from app.models.auth_audit_log import AuthAuditLog
from app.models.api_key_audit import ApiKeyAuditLog


# -----------------------------------------------------------------------
# D-C1: No __import__ hack in ExecutionProposal
# -----------------------------------------------------------------------

class TestDC1NoImportHack:
    """Verify ExecutionProposal source has no __import__ calls."""

    def test_no_dunder_import_in_source(self):
        """The execution_proposal module must not use __import__ for column types."""
        from app.models import execution_proposal
        source = inspect.getsource(execution_proposal)
        assert "__import__" not in source, (
            "Found __import__ hack in execution_proposal.py -- "
            "all column types must use proper top-level imports"
        )

    def test_fill_columns_use_proper_imports(self):
        """Fill columns must use properly-imported SQLAlchemy types."""
        from app.models import execution_proposal
        source = inspect.getsource(execution_proposal)
        # Verify Float and Numeric are in the import block
        assert "Float," in source or "Float\n" in source
        assert "Numeric," in source or "Numeric\n" in source


# -----------------------------------------------------------------------
# D-C2: UUID type alignment on audit models
# -----------------------------------------------------------------------

class TestDC2UUIDAlignment:
    """Verify user_id and api_key_id columns use UUID type, not Integer."""

    def test_audit_log_user_id_is_uuid(self):
        """AuditLog.user_id must be UUID to match User.id."""
        from app.models.audit_log import AuditLog
        col = AuditLog.__table__.columns["user_id"]
        col_type_name = type(col.type).__name__
        assert col_type_name == "UUID", (
            f"AuditLog.user_id column type is {col_type_name}, expected UUID"
        )

    def test_audit_log_user_id_mapped_type(self):
        """AuditLog.user_id Python type annotation must be uuid.UUID | None."""
        import uuid as _uuid
        from app.models.audit_log import AuditLog
        source = inspect.getsource(AuditLog)
        assert "Mapped[uuid.UUID | None]" in source or "Mapped[_uuid.UUID | None]" in source

    def test_auth_audit_log_user_id_is_uuid(self):
        """AuthAuditLog.user_id must be UUID to match User.id."""
        col = AuthAuditLog.__table__.columns["user_id"]
        col_type_name = type(col.type).__name__
        assert col_type_name == "UUID", (
            f"AuthAuditLog.user_id column type is {col_type_name}, expected UUID"
        )

    def test_api_key_audit_api_key_id_is_uuid(self):
        """ApiKeyAuditLog.api_key_id must be UUID to match ApiKey.id."""
        col = ApiKeyAuditLog.__table__.columns["api_key_id"]
        col_type_name = type(col.type).__name__
        assert col_type_name == "UUID", (
            f"ApiKeyAuditLog.api_key_id column type is {col_type_name}, expected UUID"
        )

    def test_api_key_audit_user_id_is_uuid(self):
        """ApiKeyAuditLog.user_id must be UUID to match User.id."""
        col = ApiKeyAuditLog.__table__.columns["user_id"]
        col_type_name = type(col.type).__name__
        assert col_type_name == "UUID", (
            f"ApiKeyAuditLog.user_id column type is {col_type_name}, expected UUID"
        )

    def test_all_audit_user_ids_share_type_with_user_pk(self):
        """All audit model user_id columns must match User.id column type."""
        from app.models.user import User
        user_pk_type = type(User.__table__.columns["id"].type).__name__
        for model_cls, col_name in [
            (AuditLog, "user_id"),
            (AuthAuditLog, "user_id"),
            (ApiKeyAuditLog, "user_id"),
        ]:
            col_type = type(model_cls.__table__.columns[col_name].type).__name__
            assert col_type == user_pk_type, (
                f"{model_cls.__name__}.{col_name} type is {col_type}, "
                f"but User.id type is {user_pk_type}"
            )


# -----------------------------------------------------------------------
# D-C3: Numeric for monetary amounts
# -----------------------------------------------------------------------

class TestDC3NumericMonetary:
    """Verify monetary columns use Numeric, not Float."""

    def test_actual_fill_rate_is_numeric(self):
        """actual_fill_rate must use Numeric for precision."""
        col = ExecutionProposal.__table__.columns["actual_fill_rate"]
        assert isinstance(col.type, Numeric), (
            f"actual_fill_rate type is {type(col.type).__name__}, expected Numeric"
        )
        assert col.type.precision == 20
        assert col.type.scale == 6

    def test_actual_fill_notional_is_numeric(self):
        """actual_fill_notional must use Numeric for precision."""
        col = ExecutionProposal.__table__.columns["actual_fill_notional"]
        assert isinstance(col.type, Numeric), (
            f"actual_fill_notional type is {type(col.type).__name__}, expected Numeric"
        )
        assert col.type.precision == 20
        assert col.type.scale == 6

    def test_slippage_bps_is_float(self):
        """slippage_bps is a ratio, Float is acceptable."""
        col = ExecutionProposal.__table__.columns["slippage_bps"]
        assert isinstance(col.type, Float), (
            f"slippage_bps type is {type(col.type).__name__}, expected Float"
        )

    def test_fill_timestamp_is_string(self):
        """fill_timestamp must be String(64)."""
        col = ExecutionProposal.__table__.columns["fill_timestamp"]
        assert isinstance(col.type, String)
        assert col.type.length == 64

    def test_fill_hash_is_string(self):
        """fill_hash must be String(64)."""
        col = ExecutionProposal.__table__.columns["fill_hash"]
        assert isinstance(col.type, String)
        assert col.type.length == 64


# -----------------------------------------------------------------------
# D-C4: Corrected docstring
# -----------------------------------------------------------------------

class TestDC4Docstring:
    """Verify ExecutionProposal docstring does not claim full WORM semantics."""

    def test_no_worm_contract_heading(self):
        """Module docstring must not have 'WORM CONTRACT' heading."""
        from app.models import execution_proposal
        source = inspect.getsource(execution_proposal)
        assert "WORM CONTRACT" not in source, (
            "execution_proposal.py still claims 'WORM CONTRACT' -- "
            "it should say 'MUTABILITY CONTRACT' instead"
        )

    def test_has_mutability_contract_heading(self):
        """Module docstring must have 'MUTABILITY CONTRACT' heading."""
        from app.models import execution_proposal
        source = inspect.getsource(execution_proposal)
        assert "MUTABILITY CONTRACT" in source

    def test_acknowledges_update_allowed(self):
        """Docstring must mention that UPDATE is allowed."""
        from app.models import execution_proposal
        source = inspect.getsource(execution_proposal)
        assert "UPDATE allowed" in source

    def test_clarifies_not_full_worm(self):
        """Docstring must clarify this is not a full WORM table."""
        from app.models import execution_proposal
        source = inspect.getsource(execution_proposal)
        assert "Not a full WORM table" in source

    def test_references_true_worm_tables(self):
        """Docstring must reference the actual WORM tables for clarity."""
        from app.models import execution_proposal
        source = inspect.getsource(execution_proposal)
        assert "audit_events" in source
        assert "calculation_runs" in source
        assert "policy_revisions" in source


# -----------------------------------------------------------------------
# D-C2 supplement: record_auth_event signature accepts UUID
# -----------------------------------------------------------------------

class TestRecordAuthEventSignature:
    """Verify the record_auth_event helper accepts UUID user_id."""

    def test_record_auth_event_user_id_type_hint(self):
        """record_auth_event user_id parameter must accept uuid.UUID."""
        from app.models.auth_audit_log import record_auth_event
        import typing
        hints = typing.get_type_hints(record_auth_event)
        # With from __future__ import annotations, the hint is a string
        # that resolves. Check the source instead.
        source = inspect.getsource(record_auth_event)
        assert "user_id: uuid.UUID | None" in source, (
            "record_auth_event user_id param should be typed as uuid.UUID | None"
        )
