# ADR-0004: Policy Engine v1 Extensions -- Overlay Architecture

## Status
ACCEPTED

## Date
2026-03-07

## Context

The forensic audit of the Policy domain (2026-03-07) identified 16 actionable gaps in the v1 policy engine. The v1 kernel (`kernel.py`, `validator.py`, `audit.py`) is architecturally frozen and must not be modified. However, the policy *configuration*, *contracts*, and *auxiliary engine modules* can be extended to add:

1. Volatility-aware policy behavior (neutral by default, activation-ready)
2. Geopolitical risk overlay from Polisophic (neutralized, fully wired)
3. Configurable scenario/stress analysis (replacing hardcoded sigmas)
4. Prospective hedge effectiveness testing (IFRS 9 compliance)
5. Policy-configurable decision gate thresholds
6. Market data snapshot models for forward curves and volatility
7. Full wizard-to-policy wiring (closing 89% data waste)

## Decision

Adopt an **overlay architecture** where new capabilities are added as composable layers around the frozen v1 kernel:

- **Layer 1 (FROZEN)**: Base Policy Kernel -- `kernel.py`, `validator.py`, `audit.py`
- **Layer 2 (NEW)**: Volatility Overlay -- `VolatilityPolicy` in `PolicyBundle`, ready for live data
- **Layer 3 (NEW)**: Geopolitical Overlay -- `GeopoliticalPolicy`, neutralized until activation
- **Layer 4 (NEW)**: Enhanced Scenarios -- configurable shock packs, historical VaR/ES
- **Layer 5 (NEW)**: Governance Extensions -- prospective effectiveness, decision gate policy
- **Layer 6 (EXTENDED)**: Template Intelligence -- maturity profile, governance tier, evidence grade
- **Layer 7 (PRESERVED)**: Audit/Evidence/Replay -- all existing WORM + hash semantics unchanged

### Key Design Principles

1. **Default neutrality**: All new overlay fields default to disabled/neutral values. Existing calculations produce identical results when overlays are inactive.
2. **Deterministic replay**: New modules are pure functions with no I/O or randomness. Historical VaR uses empirical quantiles (no simulation). All inputs are snapshot-bound.
3. **Schema backward compatibility**: All new fields in `ExtendedPolicyConfig` and `PolicyBundle` have defaults. Existing serialized policies deserialize without error.
4. **Hash continuity**: PolicyBundle.to_canonical_dict() includes new sections, but since they default to stable values, existing policy hashes remain valid for policies created before the extension.

### PolicyTemplate Governance

The audit identified that `PolicyTemplate.config` is mutable without DB-level guards. Rather than adding a DB trigger (which would break the legitimate `update_template()` flow), we enforce:
- Service-layer version increment on every update (already implemented)
- Audit event emission on every template modification (already implemented)
- PolicyRevision WORM snapshots capture the canonical policy at activation time (already implemented)

The template itself is a *living document*; the revision snapshot is the *policy of record*. This is the correct institutional pattern -- templates evolve, but activated policies are immutable.

## Consequences

- Existing engine tests continue to pass with zero modification
- New overlay tests verify neutral behavior (overlays off = v1 parity)
- PolicyBundle schema version remains "v1" (additive extension, not breaking change)
- Market data models created but no migration required until live feeds connect
- Forward curve snapshots ready for CME/Bloomberg integration
- Geopolitical overlay ready for Polisophic activation

## References

- Forensic Audit (2026-03-07): 16 gaps, F1-F16 formula review
- ADR-0002: Deterministic Engine (ACCEPTED)
- ADR-0003: Tri-State Governance Pipeline (ACCEPTED)
- Architecture Freeze: `docs/architecture/architecture-freeze.md`
