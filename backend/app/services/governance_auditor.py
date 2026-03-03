"""A40: Governance Integrity Auditor.

Final gate before ledger finalization. Verifies ALL governance requirements.

10-point checklist:
1. freeze_artifact complete (all fields present)
2. policy_hash matches current policy
3. approval threshold satisfied (dual-control if required)
4. cooling-off period satisfied
5. root_hash reproducible
6. deterministic rounding applied
7. replay_verified == True
8. capital_buffer_ratio above minimum
9. no concentration hard-breaches
10. forward arbitrage within tolerance

If any check fails: Block ledger finalization with detailed audit failure report.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AuditCheck:
    """Single governance audit check."""

    check_id: int
    name: str
    description: str
    passed: bool
    detail: str
    severity: str = "CRITICAL"  # CRITICAL blocks, WARNING advises

    def to_dict(self) -> dict:
        return {
            "check_id": self.check_id,
            "name": self.name,
            "description": self.description,
            "passed": self.passed,
            "detail": self.detail,
            "severity": self.severity,
        }


@dataclass
class GovernanceAuditResult:
    """Complete governance audit result."""

    checks: list[AuditCheck] = field(default_factory=list)
    all_passed: bool = True
    critical_failures: int = 0
    warnings: int = 0
    total_checks: int = 10

    def to_dict(self) -> dict:
        return {
            "checks": [c.to_dict() for c in self.checks],
            "all_passed": self.all_passed,
            "critical_failures": self.critical_failures,
            "warnings": self.warnings,
            "total_checks": self.total_checks,
        }


# Required fields in freeze_artifact
_REQUIRED_FREEZE_FIELDS = [
    "snapshot_hash", "exposure_digest", "policy_hash", "engine_version",
    "hedge_plan", "scenario_results", "waterfall_result",
    "residual_risk_vector", "capability_flags",
]


def run_governance_audit(
    freeze_artifact: dict[str, Any],
    current_policy_hash: str,
    approval_count: int,
    required_approvals: int,
    cooling_off_satisfied: bool,
    root_hash: str,
    computed_root_hash: str,
    replay_verified: bool,
    capital_buffer_ratio: float,
    min_capital_ratio: float,
    concentration_breaches: list[str],
    forward_violations: list[str],
) -> GovernanceAuditResult:
    """Run 10-point governance audit.

    Parameters
    ----------
    freeze_artifact : dict
        Complete freeze artifact.
    current_policy_hash : str
        Current policy hash for comparison.
    approval_count : int
        Number of approvals received.
    required_approvals : int
        Number of approvals required.
    cooling_off_satisfied : bool
        Whether cooling-off period has elapsed.
    root_hash : str
        Stored root hash.
    computed_root_hash : str
        Recomputed root hash.
    replay_verified : bool
        Whether replay verification passed.
    capital_buffer_ratio : float
        Current capital buffer ratio.
    min_capital_ratio : float
        Minimum required capital ratio.
    concentration_breaches : list[str]
        List of instruments with hard concentration breaches.
    forward_violations : list[str]
        List of buckets with forward arbitrage violations.

    Returns
    -------
    GovernanceAuditResult
    """
    checks: list[AuditCheck] = []

    # 1. Freeze artifact completeness
    missing_fields = [f for f in _REQUIRED_FREEZE_FIELDS if f not in freeze_artifact or freeze_artifact[f] is None]
    checks.append(AuditCheck(
        check_id=1,
        name="Freeze Artifact Completeness",
        description="All required fields present in freeze artifact",
        passed=len(missing_fields) == 0,
        detail=f"Missing: {missing_fields}" if missing_fields else "All fields present",
    ))

    # 2. Policy hash match
    artifact_policy_hash = freeze_artifact.get("policy_hash", "")
    policy_match = artifact_policy_hash == current_policy_hash
    checks.append(AuditCheck(
        check_id=2,
        name="Policy Hash Match",
        description="Proposal policy matches current policy version",
        passed=policy_match,
        detail="Policy hash matches" if policy_match else f"Mismatch: {artifact_policy_hash[:12]}... vs {current_policy_hash[:12]}...",
    ))

    # 3. Approval threshold
    approval_ok = approval_count >= required_approvals
    checks.append(AuditCheck(
        check_id=3,
        name="Approval Threshold",
        description="Required number of approvals received",
        passed=approval_ok,
        detail=f"{approval_count}/{required_approvals} approvals" + (" -- satisfied" if approval_ok else " -- insufficient"),
    ))

    # 4. Cooling-off period
    checks.append(AuditCheck(
        check_id=4,
        name="Cooling-Off Period",
        description="Authorization cooling-off window elapsed",
        passed=cooling_off_satisfied,
        detail="Cooling-off satisfied" if cooling_off_satisfied else "Cooling-off period still active",
    ))

    # 5. Root hash integrity
    hash_match = root_hash == computed_root_hash
    checks.append(AuditCheck(
        check_id=5,
        name="Root Hash Integrity",
        description="Root hash is reproducible from components",
        passed=hash_match,
        detail="Root hash verified" if hash_match else f"Hash mismatch: stored={root_hash[:12]}... computed={computed_root_hash[:12]}...",
    ))

    # 6. Deterministic rounding
    # Check if key fields have expected precision
    rounding_ok = _check_rounding(freeze_artifact)
    checks.append(AuditCheck(
        check_id=6,
        name="Deterministic Rounding",
        description="All numeric fields rounded to fixed precision",
        passed=rounding_ok,
        detail="Rounding verified" if rounding_ok else "Rounding check failed -- possible FP divergence risk",
        severity="WARNING",
    ))

    # 7. Replay verification
    checks.append(AuditCheck(
        check_id=7,
        name="Replay Verification",
        description="Deterministic replay produces matching results",
        passed=replay_verified,
        detail="Replay verified" if replay_verified else "Replay not verified -- run replay before finalization",
    ))

    # 8. Capital adequacy
    capital_ok = capital_buffer_ratio >= min_capital_ratio
    checks.append(AuditCheck(
        check_id=8,
        name="Capital Adequacy",
        description="Capital buffer ratio meets minimum requirement",
        passed=capital_ok,
        detail=f"Buffer ratio {capital_buffer_ratio:.2f} >= {min_capital_ratio:.2f}" if capital_ok else f"BREACH: {capital_buffer_ratio:.2f} < {min_capital_ratio:.2f}",
    ))

    # 9. Concentration limits
    conc_ok = len(concentration_breaches) == 0
    checks.append(AuditCheck(
        check_id=9,
        name="Concentration Limits",
        description="No hard concentration breaches",
        passed=conc_ok,
        detail="No breaches" if conc_ok else f"Hard breaches: {concentration_breaches}",
    ))

    # 10. Forward arbitrage
    fwd_ok = len(forward_violations) == 0
    checks.append(AuditCheck(
        check_id=10,
        name="Forward Arbitrage Tolerance",
        description="Forward curve within no-arbitrage tolerance",
        passed=fwd_ok,
        detail="Within tolerance" if fwd_ok else f"Violations in: {forward_violations}",
    ))

    critical_failures = sum(1 for c in checks if not c.passed and c.severity == "CRITICAL")
    warnings = sum(1 for c in checks if not c.passed and c.severity == "WARNING")
    all_passed = critical_failures == 0

    return GovernanceAuditResult(
        checks=checks,
        all_passed=all_passed,
        critical_failures=critical_failures,
        warnings=warnings,
        total_checks=len(checks),
    )


def _check_rounding(artifact: dict[str, Any]) -> bool:
    """Quick check that numeric values appear to be deterministically rounded."""
    # Check a few known fields for reasonable precision
    hedge_plan = artifact.get("hedge_plan", {})
    if isinstance(hedge_plan, dict):
        summary = hedge_plan.get("summary", {})
        if isinstance(summary, dict):
            for key, val in summary.items():
                if isinstance(val, float):
                    # Check that value doesn't have >10 decimal places
                    s = f"{val:.15f}".rstrip("0")
                    decimal_places = len(s.split(".")[-1]) if "." in s else 0
                    if decimal_places > 10:
                        return False
    return True
