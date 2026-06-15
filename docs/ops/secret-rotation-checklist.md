# Secret Rotation Checklist

Status: PENDING — requires external human action
Created: 2026-03-07
Updated: 2026-03-07

## Context

Secrets were exposed in git history via committed `.env` files and `docs/audits/codebase-audit.md`.
Current tracked files have been sanitized. History still contains old values.
All exposed secrets should be considered compromised and must be rotated.

After rotation, secrets in git history become dead credentials with no practical risk.
Git history scrub is optional maintenance, not a security requirement, after rotation.

## Risk Relationship

- **R-001** (Secrets in git history): Currently HIGH/REDUCED — becomes RESOLVED after rotation
- **R-004** (Secret rotation not done): Currently HIGH/OPEN — becomes RESOLVED after rotation

## Rotation Items

### 1. OpenAI API Key — REQUIRED

- **What was exposed**: `sk-proj-...` key in `docs/audits/codebase-audit.md` (commit 11a1e3c)
- **Where to rotate**: https://platform.openai.com/api-keys
- **Steps**:
  1. Log in to OpenAI platform
  2. Navigate to API Keys
  3. Revoke the exposed key (find by prefix if visible)
  4. Generate a new key
  5. Update Render env group `hedgecore-secrets` → `OPENAI_API_KEY` (if used in production)
- **Verification**: `curl -H "Authorization: Bearer OLD_KEY_VALUE" https://api.openai.com/v1/models` returns 401
- **Impact if skipped**: Unauthorized API usage billed to your account
- **Status**: [ ] PENDING

### 2. JWT_SECRET — REQUIRED

- **What was exposed**: Weak dev secret value in `.env` history (commits af29cdd, b571a1b)
- **Where to rotate**: Render dashboard → Environment → `hedgecore-secrets` env group
- **Production safeguard**: `config.py` validator rejects dev defaults (`dev_*`, `*hedgecalc*`) and requires ≥32 chars in production. Production may already use a different strong value.
- **Steps**:
  1. Check current value on Render dashboard
  2. If it matches the exposed dev value: generate new secret with `python -c "import secrets; print(secrets.token_hex(32))"`
  3. Update `JWT_SECRET` in Render env group `hedgecore-secrets`
  4. Redeploy backend (Render auto-deploys on env change)
  5. Existing user sessions will be invalidated (expected — users re-login)
- **Verification**: Login at ordr-treasury.vercel.app works; old JWT tokens return 401
- **Impact if skipped**: If production uses the exposed dev value, attacker can forge JWTs. If production already uses a different value, impact is zero.
- **Status**: [ ] PENDING — check Render first, may already be different

### 3. Database Password (local dev) — LOW PRIORITY

- **What was exposed**: `hedgecalc` password in `.env` history (localhost-only PostgreSQL)
- **Risk**: LOW — localhost-only, not reachable externally unless firewall misconfigured
- **Steps**:
  1. Connect to local PostgreSQL: `"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres`
  2. Run: `ALTER USER hedgecalc WITH PASSWORD 'NEW_SECURE_PASSWORD';`
  3. Update local `.env` file with new password
- **Verification**: `psql -U hedgecalc -h localhost hedgecalc` connects with new password
- **Status**: [ ] PENDING (low priority — defer if not using local dev DB)

### 4. Render Database Password (production) — VERIFY ONLY

- **What was exposed**: NOT exposed in git history — Render manages credentials internally
- **Steps**:
  1. Open Render dashboard → hedgecore-db → Connection info
  2. Confirm `DATABASE_URL` in env group uses Render's internal connection string
  3. Confirm no manually-set DB password in env vars
- **Verification**: Render dashboard shows managed credentials (not user-set)
- **Status**: [ ] VERIFY — no rotation needed if Render-managed

## Completion Protocol

After completing rotation items above:

### Step 1: Verify all rotations

Run these verification checks (replace placeholders with actual values):

```bash
# 1. OpenAI — old key should return 401
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer OLD_OPENAI_KEY" \
  https://api.openai.com/v1/models
# Expected: 401

# 2. JWT — old tokens should fail on the live API
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer OLD_JWT_TOKEN" \
  https://hedgecore.onrender.com/api/v1/dashboard/summary
# Expected: 401 or 403

# 3. Production app — login still works
# Navigate to https://ordr-treasury.vercel.app and login with demo/demo
```

### Step 2: Update repo state

```bash
cd path/to/FXDemo

# Update memory.db
python -c "
import sqlite3
c = sqlite3.connect('.claude/state/memory.db')
c.execute(\"UPDATE open_risks SET status='mitigated', mitigated_at=datetime('now'), mitigation='All exposed credentials rotated. Old values in git history are dead.' WHERE id=4\")
c.execute(\"UPDATE open_risks SET status='mitigated', mitigated_at=datetime('now'), mitigation='All exposed credentials rotated and verified dead. History contains only dead credentials. Git scrub optional.' WHERE id=1\")
c.commit()
print('Done — R-001 and R-004 marked mitigated')
"

# Update OPEN_RISKS.md — change R-001 and R-004 status to RESOLVED
# Update CURRENT_STATE.md — remove R-001 and R-004 from active risks
```

### Step 3: Run governance gate

```bash
python scripts/pre_merge_gate.py
# Expected: SAFE_TO_MERGE with fewer HIGH warnings
```

## Git History Scrub (optional — NOT a security requirement after rotation)

After rotation, secrets in git history are dead credentials. Scrubbing provides:
- Compliance cleanliness (some auditors prefer clean history)
- Reduced noise in `git log -S` searches

It does NOT provide additional security (dead credentials cannot be exploited).

The `scripts/scrub-git-secrets.sh` script exists but requires:
1. Actual secret values filled into the PATTERNS section
2. `pip install git-filter-repo`
3. Team notification (all clones break after force push)
4. Force push to all branches

Schedule as planned maintenance only if compliance requires it. Not urgent.
