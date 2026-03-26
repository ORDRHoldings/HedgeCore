"""TreasuryFX policy rules — match_sig constants and bootstrap enforcer.

Convention: 0x0FE4_XXXX_0000_0000
  - 0x0FE4 prefix identifies the TreasuryFX limb
  - XXXX is the route category
"""

# ── Match Signatures ─────────────────────────────────────────────────

SIG_AUTH          = 0x0FE4_0001_0000_0000
SIG_CALCULATE     = 0x0FE4_0010_0000_0000
SIG_HEDGE         = 0x0FE4_0020_0000_0000
SIG_POSITIONS     = 0x0FE4_0030_0000_0000
SIG_RISK          = 0x0FE4_0040_0000_0000
SIG_PORTFOLIOS    = 0x0FE4_0050_0000_0000
SIG_TRADES        = 0x0FE4_0060_0000_0000
SIG_MARKET_DATA   = 0x0FE4_0070_0000_0000
SIG_INSTRUMENTS   = 0x0FE4_0080_0000_0000
SIG_CURVES        = 0x0FE4_0090_0000_0000
SIG_SCENARIOS     = 0x0FE4_00A0_0000_0000
SIG_REPORTS       = 0x0FE4_00B0_0000_0000
SIG_AUDIT         = 0x0FE4_00C0_0000_0000
SIG_ADMIN         = 0x0FE4_00D0_0000_0000
SIG_ORGANIZATIONS = 0x0FE4_00E0_0000_0000
SIG_USERS         = 0x0FE4_00F0_0000_0000
SIG_POLICIES      = 0x0FE4_0100_0000_0000
SIG_COUNTERPARTY  = 0x0FE4_0110_0000_0000
SIG_SETTLEMENTS   = 0x0FE4_0120_0000_0000
SIG_CASHFLOWS     = 0x0FE4_0130_0000_0000
SIG_FX            = 0x0FE4_0140_0000_0000
SIG_PUBLIC        = 0x0FE4_0200_0000_0000
SIG_DEFAULT       = 0x0FE4_FFFF_0000_0000

# ── Route-to-Signature Mapping ───────────────────────────────────────

ROUTE_SIGNATURES: dict[str, int] = {
    "/api/v1/auth": SIG_AUTH,
    "/api/v1/calculate": SIG_CALCULATE,
    "/api/v1/hedge": SIG_HEDGE,
    "/api/v1/positions": SIG_POSITIONS,
    "/api/v1/risk": SIG_RISK,
    "/api/v1/portfolios": SIG_PORTFOLIOS,
    "/api/v1/trades": SIG_TRADES,
    "/api/v1/market-data": SIG_MARKET_DATA,
    "/api/v1/instruments": SIG_INSTRUMENTS,
    "/api/v1/curves": SIG_CURVES,
    "/api/v1/scenarios": SIG_SCENARIOS,
    "/api/v1/reports": SIG_REPORTS,
    "/api/v1/audit": SIG_AUDIT,
    "/api/v1/admin": SIG_ADMIN,
    "/api/v1/organizations": SIG_ORGANIZATIONS,
    "/api/v1/users": SIG_USERS,
    "/api/v1/policies": SIG_POLICIES,
    "/api/v1/counterparties": SIG_COUNTERPARTY,
    "/api/v1/settlements": SIG_SETTLEMENTS,
    "/api/v1/cashflows": SIG_CASHFLOWS,
    "/api/v1/fx": SIG_FX,
    "/api/v1/public": SIG_PUBLIC,
}


def get_match_sig(path: str) -> int:
    """Resolve a request path to its policy match signature."""
    for prefix, sig in ROUTE_SIGNATURES.items():
        if path.startswith(prefix):
            return sig
    return SIG_DEFAULT


# ── Bootstrap PolicyEnforcer ─────────────────────────────────────────

def build_bootstrap_enforcer():
    """Build a PolicyEnforcer with default rules for all TreasuryFX routes."""
    from synex_kernel.policy.loader import build_rule_row, build_artifact, verify_artifact
    from synex_kernel.policy.enforcer import PolicyEnforcer
    from synex_kernel.constants import FLAG_ENABLED

    rule_defs = [
        # (rule_id, match_sig, budget_cost, priority)
        (1,  SIG_AUTH,          0,  0),
        (2,  SIG_CALCULATE,     20, 10),  # compute-heavy
        (3,  SIG_HEDGE,         15, 10),  # compute-heavy
        (4,  SIG_POSITIONS,     8,  10),
        (5,  SIG_RISK,          10, 10),
        (6,  SIG_PORTFOLIOS,    5,  10),
        (7,  SIG_TRADES,        10, 10),
        (8,  SIG_MARKET_DATA,   3,  10),
        (9,  SIG_INSTRUMENTS,   2,  10),
        (10, SIG_CURVES,        5,  10),
        (11, SIG_SCENARIOS,     12, 10),  # compute-heavy
        (12, SIG_REPORTS,       8,  10),
        (13, SIG_AUDIT,         1,  10),
        (14, SIG_ADMIN,         2,  10),
        (15, SIG_ORGANIZATIONS, 2,  10),
        (16, SIG_USERS,         2,  10),
        (17, SIG_POLICIES,      3,  10),
        (18, SIG_COUNTERPARTY,  3,  10),
        (19, SIG_SETTLEMENTS,   8,  10),
        (20, SIG_CASHFLOWS,     5,  10),
        (21, SIG_FX,            5,  10),
        (22, SIG_PUBLIC,        0,  10),
        (99, SIG_DEFAULT,       1,  100),
    ]

    rules_payload = b""
    for rule_id, match_sig, budget_cost, priority in rule_defs:
        rules_payload += build_rule_row(
            rule_id=rule_id,
            match_sig=match_sig,
            action_sig=0x0001,
            priority=priority,
            budget_cost=budget_cost,
            flags=FLAG_ENABLED,
        )

    artifact = build_artifact(epoch=0, rules_payload=rules_payload, rule_count=len(rule_defs))
    _, rules = verify_artifact(artifact)

    return PolicyEnforcer(rules)
