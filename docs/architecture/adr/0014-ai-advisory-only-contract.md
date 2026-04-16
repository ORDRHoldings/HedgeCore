# ADR-0014: AI Add-on Tier — Advisory-Only Contract

**Status:** accepted  
**Date:** 2026-04-16  
**Author:** ORDR Edge

## Context

Phase 3 introduces AI capabilities (natural-language treasury query, report commentary)
powered by the Anthropic API. These features process tenant financial data and return
natural-language outputs. Without explicit constraints, AI outputs could be mistaken for
authoritative decisions or inadvertently modify production records.

## Decision

All AI outputs in ORDR Terminal are ADVISORY.

1. `intelligence_service.py` performs only SELECT queries on business data.
2. The only INSERT it performs is into `intelligence_query_log` (non-WORM append log).
3. The service never calls `session.add()` on any business model.
4. The service never triggers state machine transitions.
5. Every AI-generated output is clearly labelled "AI-assisted, human review required"
   in the UI before any export or action.
6. Prompt hashes (not raw prompts) are stored — financial context injected into prompts
   must not be persisted.

## Consequences

- **Positive:** No AI-driven mutations to treasury records; audit trail clean.
- **Positive:** Prompt privacy preserved — raw prompts with financial data not stored.
- **Positive:** Bedrock-compatible — `_get_client()` is the only change needed for AWS.
- **Constraint:** AI cannot take autonomous actions; all suggestions require human approval.
- **Constraint:** ML cash flow forecasting (Phase 3b) must follow the same contract.

## References

- Treasury Suite Phase 3 design spec: `docs/superpowers/specs/2026-04-16-phase3-intelligence-design.md`
- Prior art: ADR-0005 (paper execution mode — same advisory pattern applied to broker execution)
