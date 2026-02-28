# Runtime Repro — Policy Engine ERR-1, Favorites Rollback, Hash Chain Verify

## Architecture

Real repro via **dev fault injection** (DEV-FAULT-1).

Real HTTP requests → real HTTP status codes → real axios errors → real UI state.
No fake `window.fetch` overrides. No axios-shaped error objects. No mocks.

### Three-layer safety belt

Fault injection is **only active when ALL THREE conditions hold simultaneously**:

| Layer | Condition | Default |
|-------|-----------|---------|
| 1 — Env var | `ALLOW_DEV_FAULT_INJECTION=true` | unset on Render → **denied** |
| 2 — App env | `ENV` in `{dev, development, test, testing, ci, local}` | `production` on Render → **denied** |
| 3 — Locality | `request.client.host` or URL hostname is loopback (`127.0.0.1`, `::1`, `localhost`) | non-local in prod → **denied** |

On Render (production): layer 1 fails (env var unset) **and** layer 2 fails (ENV=production).
Double-guarded. A misconfiguration of one layer is always caught by the other.

**X-Forwarded-For:** Only used when `TRUST_PROXY_HEADERS=true`. Default is `false` — XFF cannot fake locality.

---

## Prerequisites

### Backend
```bash
cd backend
export ALLOW_DEV_FAULT_INJECTION=true
export ENV=dev
# For SQLite demo (no Postgres needed):
export ALLOW_SQLITE_DEMO=true
python -m uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
NEXT_PUBLIC_API_URL=http://localhost:8000/api npm run dev
```

Open `http://localhost:3000` and log in as `demo` / `demo`.

---

## A) ERR-1 banner + retry (template load failure)

**Goal**: `/policies` page → real HTTP 500 from backend → red ERR-1 banner → RETRY.

```javascript
// Open browser DevTools > Console at http://localhost:3000/policies
localStorage.setItem("hc_dev_fault", "1")
location.reload()

// ── What you should see ────────────────────────────────────────────────────
// Network tab: GET /api/v1/policies/templates?__dev_fault=500 → 500
// UI: amber/red ERR-1 banner:
//     "Failed to load policy templates from server" (or backend detail)
//     [RETRY] button visible

// ── To test RETRY ─────────────────────────────────────────────────────────
localStorage.removeItem("hc_dev_fault")  // clear flag first
// Click RETRY button → GET .../templates → 200 → templates load → banner dismissed
```

**Full call chain:**
1. `listPolicyTemplates(token)` → `GET /api/v1/policies/templates?__dev_fault=500`
2. Backend: `raise_if_dev_fault(request, 500)` → guard passes (loopback + env var + dev env) → `HTTPException(500)`
3. Real HTTP `500 Internal Server Error`
4. Axios throws `AxiosError { response: { status: 500 } }`
5. `policies/page.tsx` `.catch(e => setTemplatesError(...))` fires
6. `templatesError` non-null → ERR-1 banner renders with RETRY button

---

## B) Favorites load failure

**Goal**: favorites panel shows error state when backend returns 500.

```javascript
localStorage.setItem("hc_dev_fault", "1")
location.reload()

// Network tab: GET /api/v1/policies/favorites?__dev_fault=500 → 500
// UI: favorites panel shows error or empty (catch block fires)

localStorage.removeItem("hc_dev_fault")  // restore
```

---

## C) Hash chain verify — PASS state

**Goal**: PolicyRevisionDrawer VERIFY button → green ✓ CHAIN INTACT.

```javascript
// Make sure hc_dev_chain_fail is NOT set
localStorage.removeItem("hc_dev_chain_fail")

// Open any policy template's revision drawer
// Click "VERIFY HASH CHAIN"

// Network tab: GET /api/v1/audit/chain/verify → 200
// UI: green "✓ CHAIN INTACT — N EVENTS VERIFIED" badge
```

---

## D) Hash chain verify — FAIL state

**Goal**: PolicyRevisionDrawer VERIFY button → red ✗ CHAIN BROKEN (synthesised).

```javascript
localStorage.setItem("hc_dev_chain_fail", "1")

// Open any policy template's revision drawer
// Click "VERIFY HASH CHAIN"

// Network tab: GET /api/v1/audit/chain/verify?__dev_chain_fail=1 → 200
//   Response body: { "is_intact": false, "broken_at": "00000000-dev0-fail-...", "events_checked": 0 }
// UI: red "✗ CHAIN BROKEN AT 00000000" badge

localStorage.removeItem("hc_dev_chain_fail")  // restore
```

**Full call chain:**
1. `fetchChainVerify(token)` → `GET /api/v1/audit/chain/verify?__dev_chain_fail=1`
2. Backend: `is_dev_fault_allowed(request)` passes → returns synthesised `{is_intact: false, broken_at: "00000000-dev0-fail-..."}`
3. Real HTTP 200 with real JSON
4. `handleVerify()` sees `!report.is_intact` → `setVerifyState("fail")`
5. Red ✗ CHAIN BROKEN badge renders

---

## E) Verify 401/403 → amber error banner in drawer

```javascript
// No localStorage flag needed. Just use an expired or invalid token.
// The VERIFY call returns 401/403 → amber error banner renders in drawer.
// This tests the error path in handleVerify() without any dev flags.
```

---

## Production safety proof

| Scenario | Layer 1 | Layer 2 | Layer 3 | Result |
|----------|---------|---------|---------|--------|
| Render production | `ALLOW_DEV_FAULT_INJECTION` unset → **FAIL** | `ENV=production` → **FAIL** | non-local client → **FAIL** | Denied (all layers) |
| Misconfigured Render (env var accidentally set) | PASS | `ENV=production` → **FAIL** | non-local → **FAIL** | Denied (layers 2+3) |
| Non-localhost dev server (e.g. 0.0.0.0:8000 behind ngrok) | PASS | PASS | ngrok IP → **FAIL** | Denied (layer 3) |
| Localhost dev | PASS | PASS | `127.0.0.1` → PASS | **Allowed** |

---

## Relevant source files

| File | Purpose |
|------|---------|
| `backend/app/core/dev_fault.py` | `is_dev_fault_allowed(request)` — three-layer guard |
| `backend/app/api/routes/v1_policies.py` | `raise_if_dev_fault(request, __dev_fault)` in `list_templates`, `list_favorites` |
| `backend/app/api/routes/v1_audit.py` | `is_dev_fault_allowed` + `__dev_chain_fail` in `verify_audit_chain` |
| `frontend/src/api/policyClient.ts` | `devFaultParam()`, `devChainFailParam()` — appended only in `NODE_ENV=development` |
| `frontend/src/components/policy/PolicyRevisionDrawer.tsx` | `devChainFailParam()` wired into `fetchChainVerify()` |
| `backend/tests/test_dev_fault_guard.py` | 27 tests covering all guard paths |
