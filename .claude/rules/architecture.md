# Architecture Rules

## Freeze Enforcement
- v1 architecture is FROZEN. No ML, auto-learning, broker execution, or stateful decision logic.
- R1-R8 risk taxonomy: NEVER modify.
- Strategy-to-Instrument mapping: NEVER modify.
- Middleware order: Audit -> Rate Limit -> Auth. NEVER reorder.
- Any architecture change requires an ADR in `docs/architecture/adr/`.

## Frozen Files (require ADR to modify)
- `backend/app/engine_v1/kernel.py` — deterministic hedge kernel
- `backend/app/engine_v1/validator.py` — fail-closed input validation
- `backend/app/engine_v1/audit.py` — RunEnvelope hash chain
- `backend/app/models/audit_event.py` — WORM audit model
- `backend/app/models/calculation_run.py` — WORM calculation model
- `backend/app/models/policy_revision.py` — WORM policy revision model
- `backend/app/core/security.py` — JWT + bcrypt + API key auth

## WORM Semantics
- Tables `audit_events`, `calculation_runs`, `policy_revisions` are append-only.
- NO UPDATE, NO DELETE triggers must exist on these tables.
- Hash chain: SHA-256, per-tenant, GENESIS_HASH = 64 zeros.

## ADR Discipline
- ADR files live in `docs/architecture/adr/` with format `NNNN-title.md`.
- Status values: proposed | accepted | deprecated | superseded.
- Every ADR must have: Context, Decision, Consequences, References.
- Next ADR number: check existing files and increment.

## Engine Boundaries
- `engine/` = orchestrator layer (14 modules). Coordinates engine_v1.
- `engine_v1/` = production kernel (46 modules). Pure deterministic functions.
- Never add non-deterministic logic to engine_v1/.
- Never bypass validator.py input checks.
