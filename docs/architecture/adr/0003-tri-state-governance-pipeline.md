# ADR 0003: Tri-state governance pipeline

Status: accepted
Date: 2026-03-04

## Context
FX policy changes and execution proposals require governance controls
that separate sandbox experimentation from approved, immutable records.

## Decision
Adopt a tri-state pipeline for governance artifacts:
SANDBOX -> STAGING -> LEDGER, surfaced in API routes and services.

## Consequences
- Sandbox runs are isolated from production ledger records.
- Staging enables approvals and reviews before ledger commitment.
- Ledger records provide immutable audit evidence.

## References
- `backend/app/api/router.py`
- `backend/app/services/pipeline_service.py`
- `backend/app/models/ledger.py`
