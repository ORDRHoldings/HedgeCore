"""
app/core/exceptions.py — Typed domain exceptions for the HedgeCalc backend.

Using typed exceptions (rather than ValueError + string matching) ensures:
  - Routes can catch specific types without substring inspection
  - Exception metadata (scope, code) is preserved as typed attributes
  - API response codes are stable regardless of message phrasing
  - Test assertions are unambiguous

Stable error codes (never change — clients may key on them):
  DB_ACTIVE_SCOPE_CONFLICT — concurrent policy activation race condition
"""
from __future__ import annotations

import uuid as _uuid
from typing import Optional


class HedgeCalcError(Exception):
    """Base class for all typed domain exceptions in this codebase."""
    code: str = "HEDGECALC_ERROR"


class ActivationConflictError(HedgeCalcError):
    """
    Raised when two concurrent activate_policy() calls violate the
    uix_policy_instances_one_active_per_scope uniqueness constraint.

    The database IntegrityError is caught in the service layer and
    re-raised as this typed exception so the route handler can map it
    to HTTP 409 with a stable { "code": "DB_ACTIVE_SCOPE_CONFLICT", ... }
    body — without substring matching.

    Attributes:
        company_id: The company scope of the failed activation.
        branch_id:  The branch scope (None = company-wide policy).
        code:       Stable string code for client error handling.
    """
    code = "DB_ACTIVE_SCOPE_CONFLICT"

    def __init__(
        self,
        company_id: _uuid.UUID,
        branch_id: Optional[_uuid.UUID] = None,
    ) -> None:
        self.company_id = company_id
        self.branch_id = branch_id
        scope = f"{company_id}/{branch_id}" if branch_id else f"{company_id}/company-wide"
        super().__init__(
            f"Concurrent activation conflict for scope {scope}. "
            "Another activation for this scope succeeded simultaneously. "
            "Please retry the activation."
        )
