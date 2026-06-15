# FastAPI / Starlette upgrade — BLOCKED (2026-06-14)

**Goal:** clear the `starlette` moderate Dependabot alert (wants ≥ 1.0.1; we pin 0.49.1).
`starlette` 1.x cannot coexist with FastAPI 0.121 (which constrains `starlette < 0.50`),
so this requires a coordinated FastAPI + Starlette + Pydantic upgrade.

**Status:** feasibility confirmed, **but blocked** by a route-introspection regression that
silently disables the RLS security guards. **Do not merge until CI billing is restored**
(the change must be validated against PostgreSQL + the full CI matrix before it
auto-deploys to the no-rollback Render production backend — RISK-OPS-MON-01).

Work-in-progress on branch `chore/fastapi-starlette-upgrade`.

---

## What was attempted

`requirements.txt` bumps (resolver-confirmed compatible, installed clean):

| Package | From | To |
|---------|------|-----|
| `fastapi` | 0.121.0 | 0.137.0 |
| `starlette` | 0.49.1 | 1.3.1 |
| `pydantic` | 2.12.0 | 2.13.4 |
| `pydantic_core` | 2.41.1 | 2.46.4 |
| `anyio` | 4.11.0 | 4.13.0 |
| `annotated-doc` | — | 0.0.4 (new FastAPI dep) |

Install exit 0; app imports; **full SQLite suite: 2 failed, 5387 passed, 161 skipped**.

## The blocker — `_IncludedRouter` breaks route introspection

`app/main.py:2331` registers the entire API with a single
`app.include_router(api_router, prefix="/api")`. Under FastAPI 0.137 this no longer flattens
the child routes into `app.routes`; instead it inserts one opaque **`_IncludedRouter`**
object. Measured on the upgraded stack:

```
TOP_LEVEL app.routes          = 7
TOP_LEVEL APIRoutes (guard sees) = 5     # /, /api/health, /api/kernel/health, /api/docs, /api/redoc
TOTAL APIRoutes if we recurse  = 5       # the _IncludedRouter does NOT expose children via .routes
```

The hundreds of business routes still **route correctly** (request handling passed 5387 tests),
but they are no longer enumerable from `app.routes`.

### Impact (why this is disqualifying, not cosmetic)

1. **RLS startup guards pass vacuously.** `core/dependencies.py::assert_routes_have_canonical_auth`
   and `deps/api_key_auth.py::assert_api_key_routes_safe` iterate `app.routes`, `continue` on
   anything that isn't a top-level `APIRoute`, and never recurse. Post-upgrade they would inspect
   only the 5 health/docs routes, find zero violations, and **pass** — silently disabling the
   RLS-01 / RLS-02 structural defenses that exist specifically to prevent the RLS-bypass class of
   bug behind the 2026-05-13 → 2026-05-16 silent outage. The guard *test* still passes (no
   exception), giving false confidence.
2. **OpenAPI / Swagger drops the business API.** `app/main.py::custom_openapi` calls
   `get_openapi(routes=app.routes)` — it would document only the 5 visible routes.
3. **Caught by 2 structural tests** (the canaries): `test_routes_smoke.py::test_router_registration_smoke`
   ("Only 5 routes registered") and `test_dashboard_rls_injection.py::test_dashboard_routes_depend_on_get_current_user`.

## Required work before this can merge

1. Adapt both startup guards **and** `custom_openapi` to FastAPI 0.137's route model — either
   enumerate through `_IncludedRouter` (note: leading underscore = private API; fragile) or switch
   `main.py` to a route registration pattern that keeps routes enumerable (e.g. per-router
   `include_router` without the umbrella wrapper, or walking `api_router.routes` directly).
   Also evaluate a **more conservative intermediate FastAPI** (the first version that supports
   `starlette` 1.0 may predate the `_IncludedRouter` change and avoid this entirely).
2. Add a **non-vacuous guard test** — assert the guard *raises* on a deliberately unprotected
   route — so a future framework bump cannot silently hollow the guard out again.
3. Clear surfaced deprecations: `Query(..., regex=)` → `pattern` (`v1_audit_lab.py:1468`);
   Starlette `TestClient` + `httpx` deprecation.
4. **Validate on PostgreSQL + the full CI matrix.** The RLS guards and tenant-context paths are
   PG-sensitive; SQLite-only validation is exactly what missed the 2026-05-16 incident.

## Recommendation

**Defer.** Restore GitHub Actions billing first, then land this as a dedicated, CI-validated PR.
It is a framework *major* that touches the RLS security guards and auto-deploys to a backend with
no auto-rollback — it must not ship on SQLite-only validation. The remaining alert is **moderate**,
so the deferral cost is low.
