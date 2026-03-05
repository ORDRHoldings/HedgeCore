# PHASE 0 — RECONNAISSANCE NOTES

**Date**: 2026-03-05
**Branch**: feat/audit-lab-decision-desk

---

## 1. Pattern File Locations

| Pattern | File |
|---------|------|
| RunEnvelope + TraceBundle hashing | `backend/app/engine_v1/audit.py` |
| SHA-256 hash functions | `backend/app/engine_v1/hasher.py` |
| Deterministic kernel structure | `backend/app/engine_v1/kernel.py` |
| Waterfall / decision layer | `backend/app/engine_v1/waterfall.py` |
| Validation codes V-001..V-024 | `backend/app/engine_v1/validator.py` |
| CSV import + SHA-256 dedup | `backend/app/services/connector_service.py` |
| Upload route (multipart) | `backend/app/api/routes/v1_connectors.py` |
| Route registration | `backend/app/api/router.py` |
| WORM table DDL + triggers | `backend/app/main.py` (`_ensure_tables`) |
| WORM model example | `backend/app/models/calculation_run.py` |
| Complex model example | `backend/app/models/execution_proposal.py` |
| Permission seed list | `backend/app/models/permission.py` (`SEED_PERMISSIONS`) |
| Frontend API client | `frontend/src/lib/api/dashboardClient.ts` |
| Top-bar navigation | `frontend/src/components/layout/AppTopBar.tsx` |

---

## 2. Canonical JSON Hashing

```python
# backend/app/engine_v1/hasher.py
from app.engine_v1.hasher import sha256_of_dict, sha256_of_list

def sha256_of_dict(d: dict) -> str:
    canonical = json.dumps(d, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

def sha256_of_list(items: list) -> str:
    canonical = json.dumps(items, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
```

**Rule**: always `sort_keys=True, default=str` — this is the determinism guarantee.

---

## 3. WORM Trigger DDL Pattern

```sql
-- 1. Create the guard function
CREATE OR REPLACE FUNCTION {table_name}_worm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '{table_name} is WORM (append-only): % on row % is forbidden', TG_OP, OLD.id;
END;
$$

-- 2. Create NO_UPDATE trigger (idempotent with DO block)
DO $$ BEGIN
  CREATE TRIGGER trg_{table_name}_no_update
    BEFORE UPDATE ON {table_name}
    FOR EACH ROW EXECUTE FUNCTION {table_name}_worm();
EXCEPTION WHEN duplicate_object THEN NULL; END $$

-- 3. Create NO_DELETE trigger (idempotent with DO block)
DO $$ BEGIN
  CREATE TRIGGER trg_{table_name}_no_delete
    BEFORE DELETE ON {table_name}
    FOR EACH ROW EXECUTE FUNCTION {table_name}_worm();
EXCEPTION WHEN duplicate_object THEN NULL; END $$
```

All DDL lives in `backend/app/main.py` → `_ensure_tables()` as a list of raw SQL strings.
DDL order matters: tables with FK deps must come after their referenced tables.

---

## 4. RunEnvelope / TraceLite Schema

```python
# backend/app/schemas_v1/results.py
class RunEnvelope(BaseModel):
    run_id: str
    timestamp: datetime
    engine_version: str
    inputs_hash: str
    outputs_hash: str
    run_hash: str          # sha256({inputs_hash, outputs_hash})
    trades_hash: str
    hedges_hash: str
    market_hash: str
    policy_hash: str
    # + optional market snapshot provenance fields

class TraceEvent(BaseModel):
    step: str
    timestamp: datetime
    detail: str
    data: dict | None

class TraceLite(BaseModel):
    run_id: str
    events: list[TraceEvent]
```

The `run_hash` is always: `sha256_of_dict({"inputs_hash": ..., "outputs_hash": ...})`

---

## 5. Route Registration Pattern

```python
# backend/app/api/router.py
from app.api.routes.v1_new_feature import router as v1_new_router
router.include_router(v1_new_router)
```

Each feature router owns its own prefix (e.g. `prefix="/v1/audit-lab"`).
Router is imported at module level or inline (both patterns used).

---

## 6. Frontend API Client Pattern

```typescript
// Uses dashboardFetch from @/lib/api/dashboardClient
import { dashboardFetch } from "@/lib/api/dashboardClient";

// GET
const res = await dashboardFetch("/v1/audit-lab/datasets", token);
const data = await res.json();

// POST with body
const res = await dashboardFetch("/v1/audit-lab/runs", token, {
  method: "POST",
  body: JSON.stringify({ dataset_id, benchmark_config }),
});

// Multipart upload (override Content-Type)
const fd = new FormData();
fd.append("file", file);
const res = await fetch(`${API_BASE}/v1/audit-lab/datasets/upload`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "X-CSRF-Token": getCsrfToken() },
  body: fd,
});
```

Note: for multipart, do NOT set `Content-Type` — browser sets it with boundary.
CSRF token from `Cookies.get("csrf_token")`.

---

## 7. Upload Pattern (multipart)

```python
# From v1_connectors.py
@router.post("/import/csv")
async def import_csv(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    raw_bytes = await file.read()
    file_hash = hashlib.sha256(raw_bytes).hexdigest()
    # dedup check via connector_service._check_duplicate_hash
```

---

## 8. Permission Pattern

```python
# From v1_connectors.py
async def _check_permission(session, user, codename):
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if codename not in perms:
        raise HTTPException(status_code=403, detail=f"Missing permission: {codename}")
```

New permissions needed:
- `audit.upload` — upload FX transaction dataset
- `audit.run` — execute audit analysis run
- `decisions.run` — create decision desk run
- `decisions.view` — view decision runs

---

## 9. Existing Engine Structure

```
backend/app/engine/        # Original engine (v0)
  orchestrator.py, expose.py, hedge_sizer.py, ...

backend/app/engine_v1/     # Production engine (v1) — 35 modules
  kernel.py                # 13-step deterministic kernel
  audit.py                 # RunEnvelope + TraceLite builders
  hasher.py                # SHA-256 utilities
  validator.py             # V-001..V-024 fail-closed validator
  waterfall.py             # R1-R8 rule cascade
  scenarios.py             # Linear proxy scenario engine
```

New engines go in `backend/app/engine/` as standalone modules
(separate from both engine trees, consistent with completion gate path).

---

## 10. Key Implementation Decisions

1. **Benchmark rates**: pulled from `market_snapshots` table by `as_of` date closest to `trade_date`
2. **No live API calls** during calculation — all data must be persisted snapshots
3. **Fail-closed**: if no benchmark snapshot for a trade date → `BENCHMARK_UNAVAILABLE` error, skip that transaction
4. **Decision engine**: reads existing `positions` + reads policy config from JSONB — no PolicyConfig model mutation
5. **DecisionConfig**: separate Pydantic schema (not modifying frozen PolicyConfig)
6. **Audit events**: emit to existing `audit_events` table using existing `record_audit_event` pattern
7. **Evidence binder**: JSON endpoint returning manifest + hashes — no new table needed
