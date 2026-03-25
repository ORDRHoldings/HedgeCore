# Alembic Migration Runbook

## Making a schema change (new column / new table)

1. Edit or create a SQLAlchemy model in `backend/app/models/`
2. Generate a migration:
   ```bash
   cd backend
   alembic revision --autogenerate -m "add <description>"
   ```
3. Review the generated file in `backend/migrations/versions/`
4. Apply locally:
   ```bash
   alembic upgrade head
   ```
5. Commit both the model change and the migration file.
6. On next deploy, Render auto-runs `alembic upgrade head` via the FastAPI lifespan startup.

## Stamping an existing production DB (one-time sync)

The production DB was built by `_ensure_tables()` before Alembic full coverage was established.
Run this once on production to sync Alembic state without running DDL:

```bash
cd backend
DATABASE_URL="<production_sync_url>" alembic stamp 2026_03_24_baseline
```

Use the sync (psycopg2) URL, not the asyncpg URL.

## Checking migration state

```bash
alembic current      # What revision is applied to DB
alembic heads        # What the latest revision is
alembic history      # Full revision chain
```

## Rolling back (development only)

```bash
alembic downgrade -1  # One step back
```

**WORM table caution:** Tables `audit_events`, `calculation_runs`, `policy_revisions`,
`market_snapshots`, and all `audit_*` tables are append-only with DB-level WORM triggers.
Rolling back migrations that created these tables is blocked.
Downgrade from `2026_03_24_baseline` raises NotImplementedError by design.

## Adding a new table checklist

- [ ] Create model in `backend/app/models/<name>.py` extending `Base`
- [ ] Import it in `backend/migrations/env.py` via `_safe_import("app.models.<name>")`
- [ ] Run `alembic revision --autogenerate -m "add <name> table"`
- [ ] Review generated migration (check for missing indexes, constraints)
- [ ] Run `alembic upgrade head` locally
- [ ] Run tests
- [ ] Commit model + migration together

## Do NOT

- Add new tables to `_ensure_tables()` in `main.py` (it is deprecated)
- Modify frozen WORM table schemas without an ADR
- Run `alembic stamp head` to skip migrations you haven't reviewed
