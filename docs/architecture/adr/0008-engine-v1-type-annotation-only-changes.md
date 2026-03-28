# ADR-0008: Type-Annotation-Only Modifications to engine_v1/ Frozen Files

## Status
ACCEPTED

## Date
2026-03-28

## Context
The v1 architecture freeze classifies all files under `backend/app/engine_v1/` as
frozen. Any modification requires an ADR. Sprint 1 introduces a mypy `--strict` hard
gate on engine_v1/. Passing mypy strict requires adding explicit type annotations —
no logic changes are needed or permitted.

## Decision
Type-annotation-only changes to files under `backend/app/engine_v1/` are permitted
without a new ADR per file, provided:
1. Changes are limited to: function parameter type annotations, return type
   annotations, variable type annotations, `from __future__ import annotations`,
   and `# type: ignore[...]` comments for untyped third-party imports.
2. No logic, algorithm, constant value, control flow, or data structure is modified.
3. The full engine_v1 test suite passes before and after the annotation pass.
4. A single commit message clearly states "annotation-only: add mypy strict types to engine_v1/"

## Consequences
- The kernel remains fully deterministic; frozen semantics are preserved.
- mypy `--strict` becomes a permanent hard gate in CI.
- Reviewers must verify no logic changes are smuggled in under annotation cover.

## References
- Architecture freeze: `docs/architecture/architecture-freeze.md`
- Sprint 1 spec: `docs/superpowers/specs/2026-03-28-enterprise-readiness-design.md` §1.3
