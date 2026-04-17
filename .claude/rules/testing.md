# Testing Rules

## Backend Tests
- Location: `backend/tests/`
- Runner: `python -m pytest tests/ -x -q --tb=short`
- Required env: `JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://"`
- CI coverage gate: 40% minimum (target: 75%+)
- Current state: ~4801 passing, 0 failed, 158 skipped (PG-only), ~75% coverage

## Markers
- `@pytest.mark.requires_postgres` — auto-skips on SQLite (defined in conftest.py)
- Always add this marker to tests that use PG-specific features (JSON operators, triggers, etc.)

## Test Patterns
- Engine tests: pure function, no DB needed, fast
- Service tests: AsyncMock-based, mock DB session
- Route tests: httpx AsyncClient + dependency overrides
- Integration tests: require PostgreSQL (mark with requires_postgres)

## Known Gotchas
- `risk_allocator`: `margin_budget=0` is falsy -> treated as unconstrained (inf)
- `factor_covariance`: single-factor normalized variance stays same regardless of hedge
- `CalculationRun.position_ids`: populated via `_resolve_position_ids()` matching record_id
- `GET /v1/runs` returns `run_id`; `GET /v1/dashboard/recent-runs` returns `id` — same UUID

## Frontend Tests
- TypeScript check: `npx tsc --noEmit`
- Build check: `npx next build`
- E2E: Playwright (chromium), runs on master/dev only in CI

## Validation Evidence
- Every validation run should be recorded (pass/fail/partial).
- Never claim "tests pass" without running them.
- Include command output as evidence.
