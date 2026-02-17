"""A31: Dual-Control Approval Engine.

Policy:
    if gross_notional > threshold: required_approvals = 2
    else: required_approvals = 1

Integration: authorize_staged() blocks ledger entry creation until
approval count meets threshold.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class ApprovalRequirement:
    """Approval requirement for a staged artifact."""

    gross_notional_usd: float
    threshold_usd: float | None
    required_approvals: int
    current_approvals: int
    is_satisfied: bool
    remaining: int

    def to_dict(self) -> dict:
        return {
            "gross_notional_usd": self.gross_notional_usd,
            "threshold_usd": self.threshold_usd,
            "required_approvals": self.required_approvals,
            "current_approvals": self.current_approvals,
            "is_satisfied": self.is_satisfied,
            "remaining": self.remaining,
        }


def determine_approval_requirement(
    gross_notional_usd: float,
    policy: dict[str, Any],
    current_approvals: int = 0,
) -> ApprovalRequirement:
    """Determine how many approvals are required.

    Parameters
    ----------
    gross_notional_usd : float
        Total gross notional of the proposal.
    policy : dict
        ExtendedPolicyConfig as dict.
    current_approvals : int
        Number of approvals already received.

    Returns
    -------
    ApprovalRequirement
    """
    threshold = policy.get("dual_approval_threshold_usd")

    if threshold is not None and gross_notional_usd > threshold:
        required = 2
    else:
        required = 1

    remaining = max(0, required - current_approvals)
    satisfied = current_approvals >= required

    return ApprovalRequirement(
        gross_notional_usd=gross_notional_usd,
        threshold_usd=threshold,
        required_approvals=required,
        current_approvals=current_approvals,
        is_satisfied=satisfied,
        remaining=remaining,
    )


def check_cooling_off(
    submission_timestamp_utc: float,
    current_timestamp_utc: float,
    policy: dict[str, Any],
) -> tuple[bool, float]:
    """Check if cooling-off period has elapsed.

    Parameters
    ----------
    submission_timestamp_utc : float
        Unix timestamp of staging submission.
    current_timestamp_utc : float
        Current time as Unix timestamp.
    policy : dict
        ExtendedPolicyConfig as dict.

    Returns
    -------
    tuple[bool, float]
        (is_allowed, remaining_seconds)
        is_allowed=True if cooling-off has elapsed or is disabled.
    """
    cooling_off_minutes = policy.get("cooling_off_minutes", 0)

    if cooling_off_minutes <= 0:
        return True, 0.0

    cooling_off_seconds = cooling_off_minutes * 60.0
    elapsed = current_timestamp_utc - submission_timestamp_utc
    remaining = max(0.0, cooling_off_seconds - elapsed)

    return remaining <= 0, remaining
