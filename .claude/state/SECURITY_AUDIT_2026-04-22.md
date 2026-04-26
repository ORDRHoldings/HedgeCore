# Security & Secrets Audit — 2026-04-22

## Tool
Gitleaks v8.30.1 with `.gitleaks.toml` config

## Scope
Full git history (1047 commits, ~47.66 MB)

## Summary
- **Total findings**: 37
- **By rule**: 34 `postgres-dsn-with-password`, 3 `generic-api-key-assignment`
- **Severity**: MEDIUM — no live production secrets in current working tree, but historical commits contain `.env` files with real credentials.

---

## Detailed Findings

### 1. Historical `.env` files (HIGH — requires rotation + scrub)
Files found in git history (not in current working tree):
- `.env` (root) — contained `DATABASE_URL` with password
- `backend/.env` — contained `JWT_SECRET` and `TWELVEDATA_API_KEY`

**Current state**: Both paths are now in `.gitignore` and do not exist in the working tree (`backend/.env` exists locally but is untracked).

**Action required**:
- [ ] Rotate `JWT_SECRET` on Render + Vercel
- [ ] Rotate `TWELVEDATA_API_KEY` at TwelveData dashboard
- [ ] Run `git-filter-repo` to scrub history (destructive — notify team first)

### 2. Seed / utility scripts (LOW — already redacted in HEAD)
These files contained development DB passwords in history. In current HEAD they either:
- Use `***REDACTED_DB_PASSWORD***` placeholder, OR
- Have been deleted from working tree (`backend/rebuild_db.py`)

Files:
- `backend/rebuild_db.py` (deleted, but in history)
- `backend/seed_demo.py`
- `backend/seed_company.py`
- `backend/seed_smb.py`
- `backend/seed_smb_mxn001.py`
- `backend/seed_two_companies.py`
- `backend/reset_blank_state.py`
- `backend/seed_presentation.py`

**Action**: Historical scrub will handle these.

### 3. False positives (no action)
- `render.yaml` — `PASSWORD` appears in comments explaining URL format
- `infra/docker/docker-compose.yml` — parameterized `${POSTGRES_PASSWORD:-hedgecalc}`
- `scripts/backup/*.sh` — `pass` in shell commands
- `scripts/render/deploy-all.sh` / `env-check.ps1` — masked placeholders `rnd_xxxxxxxx...`
- `frontend/src/__tests__/policy/policyEngine.hardening.test.ts` — test key `HK_live_test_key_abc`
- `frontend/src/lib/helpContent.ts` — `password` in help text
- `SUPPORT_TICKETS_E2E_EVIDENCE.md` — `pass` in documentation
- `backend/app/db/session.py` / `backend/app/core/db.py` — docstring examples using `user:pass`

---

## Current Working Tree Secrets Check
Ran `grep -r "sk-" frontend/src/` and `grep -r "api_key\|apikey\|secret" frontend/src/` — no live secrets found in source.

`backend/.env` exists locally (untracked) and contains live values for:
- `JWT_SECRET` (64-char alphanumeric, currently in use on Render)
- `TWELVEDATA_API_KEY` (32-char hex, issued via TwelveData dashboard)

**The actual values are intentionally NOT recorded here** — they live only in the
local `backend/.env` and the Render/Vercel dashboards. Both MUST be rotated;
once rotated, refer to those values from their dashboards or from the local
`backend/.env`, never from this document.

---

## Recommendations
1. **Immediate**: Rotate the two active secrets above.
2. **After rotation**: Run `scripts/scrub-git-secrets.sh` with actual values filled in.
3. **Prevent recurrence**: `.gitignore` already covers `.env` and `backend/.env`. Add a pre-commit hook that runs `gitleaks protect` to block new commits containing secrets.
