# P0 Market Data Governance Uplift — Institutional Review Pack

**Version:** 1.0
**Date:** 2026-02-28
**Classification:** Internal — Risk & Technology
**Status:** IMPLEMENTED & TESTED

---

## Executive Summary

This document records the design decisions, implementation contracts, and test proofs for the **P0 Market Data Governance Uplift**: migration from client-side Finnhub market data (ephemeral, unaudited) to a **backend-authoritative WORM snapshot store** with deterministic hashing, idempotent persistence, replay provenance, and a production execution gate.

---

## Motivation & Risk Justification

| Risk | Prior State | Post-Implementation |
|------|------------|---------------------|
| Market data replay | No audit trail; re-running a calculation could use different market data | `market_snapshot_id` in `RunEnvelope` — immutable reference to the exact data used |
| Synthetic forward abuse | INDICATIVE_FALLBACK data could silently pass through production | V-024 CRITICAL blocks production execution unless `allow_indicative_proxy=True` |
| Hash collisions / data mutation | No content-addressable store | SHA-256 over canonical JSON; WORM DB triggers block UPDATE/DELETE |
| Concurrent duplicate persistence | Race condition could insert duplicate rows | Idempotency guard: UNIQUE(company_id, hash); rollback-and-requery on conflict |
| Tenant data leakage | No explicit tenant-scoping on market data | All snapshots FK-constrained to `company_id`; `get_by_id` enforces tenant isolation |

---

## Institutional Contracts

### 1. Hash Contract

```
canonical_json = json.dumps(
    payload,
    sort_keys=True,
    separators=(',', ':'),
    default=str,
    ensure_ascii=True
)
market_snapshot_hash = sha256(canonical_json.encode('utf-8')).hexdigest()
```

**Properties guaranteed:**
- Deterministic: same payload bytes → same hash, regardless of insertion order
- ASCII-safe: no Unicode normalization differences across platforms
- Compact: no whitespace variation
- Type-stable: `default=str` serializes datetime/UUID consistently

### 2. WORM Contract

```sql
CREATE OR REPLACE FUNCTION market_snapshots_worm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'market_snapshots is a WORM table — UPDATE/DELETE not permitted (row %)' , OLD.id;
END;
$$;

CREATE TRIGGER trg_market_snapshots_no_update
    BEFORE UPDATE ON market_snapshots FOR EACH ROW EXECUTE FUNCTION market_snapshots_worm();

CREATE TRIGGER trg_market_snapshots_no_delete
    BEFORE DELETE ON market_snapshots FOR EACH ROW EXECUTE FUNCTION market_snapshots_worm();
```

### 3. Idempotency Contract

`POST /v1/market-snapshots` is **idempotent by content**:
- Same payload from same tenant → returns existing row (HTTP 200 or 201, same `snapshot_id`)
- Different payload → new row inserted (HTTP 201, new `snapshot_id`)
- Race-safe: `try commit / except UniqueConstraint → rollback + re-query`

### 4. Tenant Isolation Contract

- `market_snapshots.company_id` FK → `companies(id) ON DELETE CASCADE`
- `get_by_id(session, snapshot_id, company_id)` returns `None` if `row.company_id != company_id`
- RBAC: `market.snapshot.create` + `market.snapshot.read` permissions required

### 5. V-024 Production Execution Gate

```
IF market.provider_metadata.data_class == "INDICATIVE_FALLBACK"
   AND policy.allow_indicative_proxy == False (default):
    → ValidationErrorDetail(code="V-024", severity=CRITICAL)
    → ValidationReport.status = "FAIL"
    → Engine halts; no hedge plan produced
```

- `allow_indicative_proxy` defaults to `False` (fail-closed)
- Sandbox / demo workflows must explicitly set `allow_indicative_proxy=True`
- V-022 WARNING still fires regardless of gate state (always warn on indicative data)

### 6. RunEnvelope Replay Provenance

Seven new fields added to `RunEnvelope`:

| Field | Source | Purpose |
|-------|--------|---------|
| `market_snapshot_id` | WORM row UUID | Link to immutable snapshot |
| `market_snapshot_hash` | SHA-256 of canonical JSON | Content-addressable fingerprint |
| `market_provider` | `provider_metadata.source` | Data vendor attribution |
| `market_fetched_at` | WORM row `fetched_at` | When the data was captured |
| `market_as_of` | WORM row `as_of` | Market data timestamp |
| `market_data_class` | `provider_metadata.data_class` | LIVE / INDICATIVE_FALLBACK |
| `market_is_synthetic_forward` | `is_synthetic_forward` | True when forward curve is constructed |

---

## Implementation Inventory

### New Files

| File | Description |
|------|-------------|
| `backend/app/models/market_snapshot.py` | SQLAlchemy ORM: WORM table, UNIQUE constraint, indexes |
| `backend/app/services/market_snapshot_service.py` | Hash functions, create_or_get, get_by_id |
| `backend/app/api/routes/v1_market_snapshots.py` | POST + GET endpoints (RBAC-gated) |
| `backend/tests/test_market_snapshot_governance.py` | 34-test governance proof suite |

### Modified Files

| File | Change |
|------|--------|
| `backend/app/schemas_v1/policy.py` | `allow_indicative_proxy: bool = False` added |
| `backend/app/schemas_v1/results.py` | RunEnvelope +7 provenance fields; CalculateRequest `market_snapshot_id` |
| `backend/app/engine_v1/audit.py` | `build_run_envelope(snapshot_meta=...)` |
| `backend/app/engine_v1/validator.py` | V-024 CRITICAL gate in `_cross_validate` |
| `backend/app/models/permission.py` | `market.snapshot.create` + `market.snapshot.read` |
| `backend/app/main.py` | DDL + WORM triggers for `market_snapshots` |
| `backend/app/api/router.py` | Register `v1_market_snapshots_router` |
| `backend/app/api/routes/v1_calculate.py` | Snapshot ID branch + auto-persist + snapshot_meta |
| `frontend/src/api/types.ts` | CalculateRequest + RunEnvelope TypeScript types |
| `frontend/src/api/client.ts` | `persistMarketSnapshot()` function |
| `frontend/src/components/execution/StepCalculate.tsx` | Persist snapshot pre-calculate, pass ID |

---

## Validator Codes (Complete Registry)

| Code | Severity | Condition |
|------|----------|-----------|
| V-001 – V-010 | CRITICAL | Trade validation (type, amount, date, currency checks) |
| V-011 | CRITICAL | Spot rate outside plausible MXN range |
| V-012 | CRITICAL | Empty forward points map |
| V-013 | CRITICAL | Confirmed ratio out of [0,1] |
| V-014 | CRITICAL | Trade bucket has no forward rate |
| V-015 | WARNING | Hedge bucket has no matching trade |
| V-021 | CRITICAL | Absurd forward points (> 500 bps) |
| **V-022** | **WARNING** | Market data is INDICATIVE_FALLBACK (always warn) |
| **V-023** | **WARNING** | Market data `as_of` > 24h stale |
| **V-024** | **CRITICAL** | INDICATIVE_FALLBACK + `allow_indicative_proxy=False` |

---

## Test Proof

### Test Suite: `test_market_snapshot_governance.py` (34 tests)

| Class | Tests | Coverage |
|-------|-------|----------|
| `TestHashContract` | 8 | Determinism, key ordering, sensitivity, SHA-256 spec |
| `TestPolicyGatingV024` | 6 | Gate open/closed, V-022 coexistence, message content |
| `TestPolicyConfigSchema` | 3 | Default=False, explicit True, round-trip serialization |
| `TestRunEnvelopeProvenance` | 5 | Null meta, propagation, synthetic flag, hash stability, serialization |
| `TestHashServicePure` | 5 | Nested dicts, None values, ASCII safety, empty dict, class diff |
| `TestDataClassExtraction` | 3 | LIVE→not-synthetic, INDICATIVE→synthetic, missing defaults |
| `TestRegressionGuards` | 4 | V-022/V-023 always WARNING never CRITICAL, independent of V-024 |

**Result: 34/34 PASS**

### Regression Suite

| Suite | Tests | Result |
|-------|-------|--------|
| `test_calc_assurance.py` | 62 | 62/62 PASS |
| `test_market_snapshot_governance.py` | 34 | 34/34 PASS |
| `test_contract_cost_and_scenario_case01.py` | 5 | 4/5 PASS (1 pre-existing failure, unrelated) |

**Total: 95/96 pass; 0 regressions introduced**

### V-024 Gate Proof

```python
# Gate CLOSED (default): INDICATIVE_FALLBACK → FAIL
policy = PolicyConfig(..., allow_indicative_proxy=False)
market = MarketSnapshot(provider_metadata={"data_class": "INDICATIVE_FALLBACK"})
report = validate_all(trades, hedges, market, policy)
assert report.status == "FAIL"
assert any(e.code == "V-024" for e in report.errors)

# Gate OPEN (sandbox): INDICATIVE_FALLBACK → PASS + WARNING
policy = PolicyConfig(..., allow_indicative_proxy=True)
report = validate_all(trades, hedges, market, policy)
assert report.status == "PASS"
assert not any(e.code == "V-024" for e in report.errors)
assert any("V-022" in w for w in report.warnings)
```

---

## API Reference

### `POST /v1/market-snapshots`

**Auth:** Bearer JWT + `market.snapshot.create` permission
**Body:**
```json
{
  "as_of": "2026-02-28T16:00:00Z",
  "spot_usdmxn": 20.15,
  "forward_points_by_month": {"2026-03": 0.12, "2026-06": 0.28},
  "provider_metadata": {
    "source": "finnhub",
    "data_class": "LIVE",
    "primary_currency": "MXN"
  }
}
```

**Response (201 Created / 200 OK if idempotent):**
```json
{
  "snapshot_id": "3f8a1c2d-...",
  "market_snapshot_hash": "a3f2...",
  "provider": "finnhub",
  "data_class": "LIVE",
  "as_of": "2026-02-28T16:00:00+00:00",
  "is_synthetic_forward": false
}
```

### `GET /v1/market-snapshots/{snapshot_id}`

**Auth:** Bearer JWT + `market.snapshot.read` permission
**Response:** Same schema as POST response, with full `payload` field.

### `POST /v1/calculate` — market snapshot integration

Pass `market_snapshot_id` to reference a pre-persisted WORM snapshot:
```json
{
  "trades": [...],
  "hedges": [...],
  "market": {...},
  "policy": {"allow_indicative_proxy": false, ...},
  "market_snapshot_id": "3f8a1c2d-..."
}
```

When `market_snapshot_id` is provided, the `market` field is ignored; the WORM snapshot is loaded and validated for tenant ownership.

When omitted, the embedded `market` dict is auto-persisted (non-fatal on DB failure), and the generated `snapshot_id` is reflected in `run_envelope`.

---

## Security Considerations

1. **Tenant isolation**: All snapshot reads/writes require `company_id` match. Cross-tenant access returns 404 (not 403) to prevent enumeration.
2. **RBAC gating**: Two fine-grained permissions ensure separation of duties between data writers (`market.snapshot.create`) and readers (`market.snapshot.read`).
3. **WORM enforcement**: DB-layer triggers provide last-line-of-defense immutability that application-layer bugs cannot bypass.
4. **Hash pre-image resistance**: SHA-256 is collision-resistant for practical purposes; the canonical serialization removes all ambiguity about what was hashed.

---

## Backward Compatibility

- `market_snapshot_id` in `CalculateRequest` is **optional** — existing clients send no ID and continue to work (auto-persist path)
- `allow_indicative_proxy` in `PolicyConfig` defaults to `False` — existing serialized policy dicts that omit this field default to the safe value
- `RunEnvelope` snapshot provenance fields are all **Optional / nullable** — existing consumers see `null` for these fields

---

*Generated: 2026-02-28 | Platform: ORDR Terminal v1 | Engine: HedgeCalc Phase VI*
