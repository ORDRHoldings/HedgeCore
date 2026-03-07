# Release Rules

## Deployment Targets
- Backend: Render.com (hedgecore service, auto-deploy on master push)
- Frontend: Vercel (hedgecore.vercel.app / ordr-terminal.vercel.app, auto-deploy on master push)
- Preview: dev branch -> hedgecore-preview + hedgecore-preview-db
- Database: Render PostgreSQL

## Branch Strategy
- `master` — production (auto-deploys)
- `dev` — preview environment
- `feat/*`, `fix/*`, `hardening/*` — feature branches (CI runs, no auto-deploy)

## CI Gates (must pass before merge)
1. Backend: ruff lint + pytest (40% coverage minimum)
2. Frontend: tsc --noEmit + next build
3. E2E: Playwright (master/dev only)
4. Docker: backend image builds

## Pre-Merge Checklist
- [ ] All CI jobs green
- [ ] No new secrets in code
- [ ] Architecture freeze not violated
- [ ] WORM table integrity preserved
- [ ] Hash chain not broken
- [ ] Test evidence recorded
- [ ] CHANGELOG_AI.md updated

## Release Guardian Verdict
Before any merge to master, the release_guardian agent must verify:
1. CI passes
2. No frozen file modifications without ADR
3. Test coverage not decreased
4. No security regressions
5. State files updated

## Rollback
- Backend: Render dashboard -> Deploy -> select previous commit
- Frontend: Vercel dashboard -> Deployments -> redeploy previous
- Database: no auto-rollback. Alembic `downgrade -1` if migration exists.

## Environment Variables
- Backend required: DATABASE_URL, JWT_SECRET (>=32 chars), ENV, CORS_ALLOW_ORIGINS
- Frontend required: NEXT_PUBLIC_API_URL
- Never use dev defaults in production.
