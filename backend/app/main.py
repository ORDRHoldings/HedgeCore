from __future__ import annotations



"""

app/main.py

HedgeCalc API - Phase VI

CANONICAL, INSTITUTIONAL, NGINX-SAFE

"""



import logging

import traceback

from typing import Any

from contextlib import asynccontextmanager



from fastapi import FastAPI, Request, Response

from fastapi.middleware.cors import CORSMiddleware

from fastapi.responses import JSONResponse, HTMLResponse

from fastapi.openapi.utils import get_openapi

from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html



from starlette.middleware.gzip import GZipMiddleware

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from apscheduler.triggers.cron import CronTrigger



from app.core.config import settings

from app.core.logging_config import configure_logging

from app.core.db import init_engine, shutdown_engine, async_session_maker

from app.core.schema_loader import rebuild_all_schemas



from app.middleware.audit_headers import AuditHeadersMiddleware

from app.middleware.rate_limit import RateLimitMiddleware

from app.middleware.api_key_auth import APIKeyAuthMiddleware



from app.tasks.audit_cleanup import cleanup_audit_tables





# -------------------------------------------------------------------

# Logging

# -------------------------------------------------------------------

configure_logging()

logger = logging.getLogger(__name__)

logger.info("? HedgeCalc API booting")





# -------------------------------------------------------------------

# Lifespan (ALL MUTATION GOES HERE)

# -------------------------------------------------------------------

async def _seed_roles():

    """Seed default roles with hierarchy levels if they don't exist."""

    from sqlalchemy import select

    from app.models.rbac import Role



    default_roles = [

        # (name, description, hierarchy_level)

        ("admin", "Full system access", 0),

        ("supervisor", "Approve/reject staged artifacts", 5),

        ("risk_analyst", "Create proposals and run sandbox calculations", 10),

    ]



    async with async_session_maker() as session:

        for name, description, level in default_roles:

            result = await session.execute(select(Role).where(Role.name == name))

            existing = result.scalars().first()

            if not existing:

                session.add(Role(

                    name=name,

                    description=description,

                    hierarchy_level=level,

                    is_system=True,

                ))

            else:

                # Update existing roles with new fields if missing

                if existing.hierarchy_level != level:

                    existing.hierarchy_level = level

                if not existing.is_system:

                    existing.is_system = True

        await session.commit()



    logger.info("? Default roles seeded")





async def _seed_permissions():

    """Seed all permission codenames and default role->permission mappings."""

    from sqlalchemy import select

    from app.models.rbac import Role

    from app.models.permission import (

        Permission, RolePermission,

        SEED_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS,

    )



    async with async_session_maker() as session:

        # 1. Seed permissions

        for codename, module, action, description in SEED_PERMISSIONS:

            result = await session.execute(

                select(Permission).where(Permission.codename == codename)

            )

            if not result.scalars().first():

                session.add(Permission(

                    codename=codename,

                    module=module,

                    action=action,

                    description=description,

                ))

        await session.flush()



        # 2. Seed role -> permission mappings

        for role_name, perm_codenames in DEFAULT_ROLE_PERMISSIONS.items():

            role_result = await session.execute(

                select(Role).where(Role.name == role_name)

            )

            role = role_result.scalars().first()

            if not role:

                continue



            for codename in perm_codenames:

                perm_result = await session.execute(

                    select(Permission).where(Permission.codename == codename)

                )

                perm = perm_result.scalars().first()

                if not perm:

                    continue



                existing = await session.execute(

                    select(RolePermission).where(

                        RolePermission.role_id == role.id,

                        RolePermission.permission_id == perm.id,

                    )

                )

                if not existing.scalars().first():

                    session.add(RolePermission(

                        role_id=role.id,

                        permission_id=perm.id,

                    ))



        await session.commit()



    logger.info("? Permissions and role-permission mappings seeded")





async def _seed_policy_templates():
    """
    Seed ALL system policy templates on startup (idempotent).
    Uses the authoritative _POLICY_PRESETS_SEED list from seed.py
    which mirrors frontend/src/constants/policyPresets.ts exactly.
    Safe to run on every startup -- idempotent (short_name keyed).
    """
    from sqlalchemy import select
    from app.models.policy import PolicyTemplate
    from app.api.routes.seed import _POLICY_PRESETS_SEED

    async with async_session_maker() as session:
        for tmpl in _POLICY_PRESETS_SEED:
            existing = await session.execute(
                select(PolicyTemplate).where(
                    PolicyTemplate.is_system == True,
                    PolicyTemplate.short_name == tmpl["short_name"],
                )
            )
            if not existing.scalars().first():
                session.add(PolicyTemplate(
                    company_id=None,
                    is_system=True,
                    version=1,
                    name=tmpl["name"],
                    short_name=tmpl["short_name"],
                    description=tmpl["description"],
                    risk_posture=tmpl["risk_posture"],
                    category=tmpl["category"],
                    config=tmpl["config"],
                ))
        await session.commit()

    logger.info("? System policy templates seeded (33 presets)")





async def _sync_seed_users():
    """
    Deduplicate users table and resync demo user passwords on every startup.
    Safe to run repeatedly -- idempotent.
    """
    from sqlalchemy import select, delete, func, text
    from app.models.user import User
    from app.api.routes.seed import EMPLOYEES
    from app.core.security import hash_password
    async with async_session_maker() as session:
        # Step 1a: deduplicate users table (keep row with smallest id for each email)
        try:
            dedup_sql = text(
                "DELETE FROM users WHERE id NOT IN ("
                "    SELECT MIN(id::text)::uuid FROM users GROUP BY email"
                ")"
            )
            await session.execute(dedup_sql)
            await session.flush()
        except Exception as e:
            logger.warning(f"_sync_seed_users dedup users failed (non-fatal): {e}")
        # Step 1b: deduplicate system policy_templates (keep row with smallest id per short_name)
        try:
            dedup_policy_sql = text(
                "DELETE FROM policy_templates WHERE is_system = TRUE AND company_id IS NULL AND id NOT IN ("
                "    SELECT MIN(id::text)::uuid FROM policy_templates WHERE is_system = TRUE AND company_id IS NULL GROUP BY short_name"
                ")"
            )
            await session.execute(dedup_policy_sql)
            await session.flush()
        except Exception as e:
            logger.warning(f"_sync_seed_users dedup policy_templates failed (non-fatal): {e}")
        # Step 2: update passwords for all seed users
        for email, pw, full_name, job_title, role_name, branch_id, dept_id in EMPLOYEES:
            try:
                r = await session.execute(select(User).where(User.email == email))
                user = r.scalars().first()
                if user:
                    user.hashed_password = hash_password(pw)
                    user.is_active = True
            except Exception as e:
                logger.warning(f"_sync_seed_users update {email} failed: {e}")
                continue
        try:
            await session.commit()
            logger.info("_sync_seed_users: passwords resynced for seed users")
        except Exception as e:
            logger.warning(f"_sync_seed_users commit failed: {e}")

async def _ensure_tables():

    """Create any missing tables (non-destructive -- skips existing)."""

    from sqlalchemy import text

    from app.core.db import async_engine, Base

    # Import all model modules to register with Base.metadata

    import importlib

    from pathlib import Path

    models_dir = Path(__file__).parent / "models"

    for f in models_dir.glob("*.py"):

        if f.name != "__init__.py":

            importlib.import_module(f"app.models.{f.stem}")



    # Step 1: Drop orphan indexes that may block create_all

    for idx in ["ix_permissions_module"]:

        try:

            async with async_engine.begin() as conn:

                await conn.execute(text(f"DROP INDEX IF EXISTS {idx}"))

        except Exception:

            pass



    # Step 2: Create ALL tables via raw DDL (order respects FK dependencies)

    # This is more reliable than create_all which fails on ENUM conflicts,

    # type mismatches in legacy models, or duplicate indexes.

    raw_ddl = [

        # ?? Core tables (no FK dependencies) ??

        """CREATE TABLE IF NOT EXISTS companies (

            id UUID PRIMARY KEY, name VARCHAR(255) NOT NULL,

            slug VARCHAR(64) UNIQUE NOT NULL, domain VARCHAR(255),

            logo_url VARCHAR(512), settings JSONB,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",



        """CREATE TABLE IF NOT EXISTS roles (

            id SERIAL PRIMARY KEY,

            name VARCHAR(64) NOT NULL UNIQUE,

            description VARCHAR(255),

            company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

            hierarchy_level INTEGER NOT NULL DEFAULT 10,

            is_system BOOLEAN NOT NULL DEFAULT FALSE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",



        # ?? Tables depending on companies ??

        """CREATE TABLE IF NOT EXISTS branches (

            id UUID PRIMARY KEY,

            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

            name VARCHAR(255) NOT NULL, code VARCHAR(32) NOT NULL,

            region VARCHAR(128), timezone VARCHAR(64) DEFAULT 'UTC',

            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            UNIQUE(company_id, code))""",



        # ?? Tables depending on branches ??

        """CREATE TABLE IF NOT EXISTS departments (

            id UUID PRIMARY KEY,

            branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,

            name VARCHAR(255) NOT NULL, code VARCHAR(32) NOT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            UNIQUE(branch_id, code))""",



        # ?? Users (depends on companies, branches, departments) ??

        """CREATE TABLE IF NOT EXISTS users (

            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            email VARCHAR(255) NOT NULL UNIQUE,

            hashed_password VARCHAR(255) NOT NULL,

            full_name VARCHAR(255),

            company_id UUID REFERENCES companies(id) ON DELETE SET NULL,

            branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,

            department_id UUID REFERENCES departments(id) ON DELETE SET NULL,

            job_title VARCHAR(128),

            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            is_superuser BOOLEAN NOT NULL DEFAULT FALSE,

            token_version INTEGER NOT NULL DEFAULT 1,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",



        # ?? RBAC join tables ??

        """CREATE TABLE IF NOT EXISTS user_roles (

            id SERIAL PRIMARY KEY,

            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

            role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            UNIQUE(user_id, role_id))""",



        """CREATE TABLE IF NOT EXISTS permissions (

            id SERIAL PRIMARY KEY,

            codename VARCHAR(128) UNIQUE NOT NULL,

            module VARCHAR(64) NOT NULL, action VARCHAR(64) NOT NULL,

            description VARCHAR(255) NOT NULL DEFAULT '',

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",



        """CREATE TABLE IF NOT EXISTS role_permissions (

            id SERIAL PRIMARY KEY,

            role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,

            permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            UNIQUE(role_id, permission_id))""",



        # ?? Auth support ??

        """CREATE TABLE IF NOT EXISTS refresh_tokens (

            id SERIAL PRIMARY KEY,

            jti VARCHAR(64) NOT NULL UNIQUE,

            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

            expires_at TIMESTAMPTZ NOT NULL,

            revoked BOOLEAN NOT NULL DEFAULT FALSE,

            replaced_by_jti VARCHAR(64),

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            created_ip VARCHAR(64),

            created_user_agent VARCHAR(256))""",



        # ?? ALTER TABLE for existing tables that may need new columns ??

        "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL",

        "ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL",

        "ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL",

        "ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(128)",

        "ALTER TABLE roles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE",

        "ALTER TABLE roles ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER NOT NULL DEFAULT 10",

        "ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE",



        # ?? Phase 2: FX positions (tenant-scoped, soft-delete) ??????????????????

        """CREATE TABLE IF NOT EXISTS positions (

            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

            branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,

            created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

            record_id VARCHAR(128) NOT NULL,

            entity VARCHAR(255) NOT NULL,

            flow_type VARCHAR(4) NOT NULL,

            currency VARCHAR(3) NOT NULL,

            amount NUMERIC(20,6) NOT NULL,

            value_date VARCHAR(10) NOT NULL,

            status VARCHAR(16) NOT NULL DEFAULT 'CONFIRMED',

            description VARCHAR(512),

            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT positions_currency_length CHECK (char_length(currency) = 3),

            CONSTRAINT positions_amount_positive CHECK (amount > 0),

            CONSTRAINT positions_flow_type_enum CHECK (flow_type IN ('AR', 'AP')),

            CONSTRAINT positions_status_enum CHECK (status IN ('CONFIRMED', 'FORECAST')),

            UNIQUE(company_id, record_id))""",

        "CREATE INDEX IF NOT EXISTS ix_positions_scope ON positions(company_id, branch_id, is_active)",

        "CREATE INDEX IF NOT EXISTS ix_positions_currency ON positions(company_id, currency)",

        "CREATE INDEX IF NOT EXISTS ix_positions_created_by ON positions(created_by, created_at)",



        # ?? Phase 0: Position lifecycle columns (ADD IF NOT EXISTS -- safe migration) ??

        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS execution_status VARCHAR(20) NOT NULL DEFAULT 'NEW'",

        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS policy_id UUID",

        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS last_run_id VARCHAR(64)",

        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ",

        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS execution_ref VARCHAR(128)",

        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS hedge_amount NUMERIC(20,6)",

        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS hedge_rate NUMERIC(20,8)",

        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(512)",

        # CHECK constraint for execution_status -- added separately (IF NOT EXISTS not supported for constraints, wrapped in DO block)

        """DO $$ BEGIN

            ALTER TABLE positions ADD CONSTRAINT positions_exec_status_enum

            CHECK (execution_status IN ('NEW','POLICY_ASSIGNED','READY_TO_EXECUTE','HEDGED','REJECTED'));

        EXCEPTION WHEN duplicate_object THEN NULL; END $$""",

        "CREATE INDEX IF NOT EXISTS ix_positions_exec_status ON positions(company_id, execution_status)",

        "CREATE INDEX IF NOT EXISTS ix_positions_policy ON positions(policy_id)",



        # ?? Phase 3: Policy templates + instances ????????????????????????????????

        """CREATE TABLE IF NOT EXISTS policy_templates (

            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

            name VARCHAR(255) NOT NULL,

            short_name VARCHAR(16) NOT NULL,

            description TEXT,

            risk_posture VARCHAR(16) NOT NULL,

            category VARCHAR(32) NOT NULL,

            config JSONB NOT NULL,

            version INTEGER NOT NULL DEFAULT 1,

            is_system BOOLEAN NOT NULL DEFAULT FALSE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",

        """CREATE TABLE IF NOT EXISTS policy_instances (

            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

            branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,

            template_id UUID NOT NULL REFERENCES policy_templates(id),

            activated_by UUID NOT NULL REFERENCES users(id),

            activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            is_active BOOLEAN NOT NULL DEFAULT TRUE)""",

        "CREATE INDEX IF NOT EXISTS ix_policy_instances_scope ON policy_instances(company_id, branch_id, is_active)",


        # Sprint A+B: Policy template audit columns
        "ALTER TABLE policy_templates ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL",
        "ALTER TABLE policy_templates ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL",
        "ALTER TABLE policy_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ",
        "ALTER TABLE policy_templates ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'",
        "CREATE INDEX IF NOT EXISTS ix_policy_templates_status ON policy_templates(status, company_id)",

        # Sprint D: User policy favorites
        """CREATE TABLE IF NOT EXISTS user_policy_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES policy_templates(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, template_id))""",
        "CREATE INDEX IF NOT EXISTS ix_policy_favorites_user ON user_policy_favorites(user_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_policy_favorites_template ON user_policy_favorites(template_id)",


        # ?? Connector framework tables ??

        """CREATE TABLE IF NOT EXISTS connector_runs (

            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            company_id UUID NOT NULL,

            branch_id UUID,

            triggered_by UUID NOT NULL,

            connector_type VARCHAR(32) NOT NULL,

            source_filename VARCHAR(512),

            source_hash VARCHAR(128),

            status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',

            total_rows INTEGER NOT NULL DEFAULT 0,

            created_ok INTEGER NOT NULL DEFAULT 0,

            error_count INTEGER NOT NULL DEFAULT 0,

            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            completed_at TIMESTAMPTZ)""",



        "CREATE INDEX IF NOT EXISTS ix_connector_runs_scope ON connector_runs(company_id, branch_id)",

        "CREATE INDEX IF NOT EXISTS ix_connector_runs_user  ON connector_runs(triggered_by, started_at)",



        """CREATE TABLE IF NOT EXISTS connector_run_errors (

            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            run_id UUID NOT NULL REFERENCES connector_runs(id) ON DELETE CASCADE,

            row_number INTEGER,

            field_name VARCHAR(128),

            error_message TEXT NOT NULL,

            raw_data JSONB)""",



        "CREATE INDEX IF NOT EXISTS ix_connector_run_errors_run ON connector_run_errors(run_id)",



        # ?? Phase 0: Calculation runs persistence (replaces in-memory _run_store) ??

        """CREATE TABLE IF NOT EXISTS calculation_runs (

            id VARCHAR(64) PRIMARY KEY,

            company_id UUID,

            user_id UUID,

            inputs_hash VARCHAR(128) NOT NULL,

            outputs_hash VARCHAR(128) NOT NULL,

            run_hash VARCHAR(128) NOT NULL,

            position_ids JSONB NOT NULL DEFAULT '[]',

            run_envelope JSONB NOT NULL,

            trace_lite JSONB,

            trade_count INTEGER NOT NULL DEFAULT 0,

            hedge_count INTEGER NOT NULL DEFAULT 0,

            policy_hash VARCHAR(128),

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",

        "CREATE INDEX IF NOT EXISTS ix_calc_runs_tenant ON calculation_runs(company_id, created_at)",

        "CREATE INDEX IF NOT EXISTS ix_calc_runs_hash ON calculation_runs(run_hash)",

        "CREATE INDEX IF NOT EXISTS ix_calc_runs_positions ON calculation_runs USING gin(position_ids)",

        # Sprint 1.0: policy version pinning (ADD IF NOT EXISTS -- safe migration)

        "ALTER TABLE calculation_runs ADD COLUMN IF NOT EXISTS policy_revision_id VARCHAR(64)",

        "CREATE INDEX IF NOT EXISTS ix_calc_runs_policy_rev ON calculation_runs(policy_revision_id)",



        # ?? Phase 0: Audit event ledger (append-only, tamper-evident, WORM) ??

        """CREATE TABLE IF NOT EXISTS audit_events (

            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            company_id UUID,

            branch_id UUID,

            actor_id UUID,

            actor_email VARCHAR(255),

            actor_role VARCHAR(64),

            event_type VARCHAR(32) NOT NULL,

            description VARCHAR(1024) NOT NULL,

            entity_type VARCHAR(32),

            entity_id VARCHAR(64),

            payload JSONB NOT NULL DEFAULT '{}',

            event_hash VARCHAR(64) NOT NULL,

            prev_event_hash VARCHAR(64) NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',

            request_id VARCHAR(64),

            ip_address VARCHAR(64),

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",

        "CREATE INDEX IF NOT EXISTS ix_audit_tenant_time ON audit_events(company_id, created_at)",

        "CREATE INDEX IF NOT EXISTS ix_audit_event_type ON audit_events(company_id, event_type)",

        "CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_events(entity_type, entity_id)",

        "CREATE INDEX IF NOT EXISTS ix_audit_actor ON audit_events(actor_id, created_at)",

        "CREATE INDEX IF NOT EXISTS ix_audit_hash ON audit_events(event_hash)",

        # ?? BUG-3 FIX: policy_revisions table (WORM append-only policy version snapshots) ??
        """CREATE TABLE IF NOT EXISTS policy_revisions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            policy_instance_id UUID NOT NULL,
            template_id UUID NOT NULL REFERENCES policy_templates(id),
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
            revision INTEGER NOT NULL DEFAULT 1,
            canonical_policy JSONB NOT NULL,
            policy_hash VARCHAR(64) NOT NULL,
            created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            created_by_email VARCHAR(255),
            change_reason TEXT,
            prev_revision_id UUID REFERENCES policy_revisions(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",
        "CREATE INDEX IF NOT EXISTS ix_policy_rev_instance ON policy_revisions(policy_instance_id, revision)",
        "CREATE INDEX IF NOT EXISTS ix_policy_rev_hash ON policy_revisions(policy_hash)",
        "CREATE INDEX IF NOT EXISTS ix_policy_rev_tenant ON policy_revisions(company_id, created_at)",

        # ?? BUG-3 FIX: positions.policy_revision_id column (policy version pinning) ??
        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS policy_revision_id UUID",
        "CREATE INDEX IF NOT EXISTS ix_positions_policy_revision ON positions(policy_revision_id)",

        # ?? BUG-3 FIX: execution_proposals table (4-eyes SoD workflow) ??
        """CREATE TABLE IF NOT EXISTS execution_proposals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            position_id UUID NOT NULL,
            company_id UUID NOT NULL,
            branch_id UUID,
            status VARCHAR(16) NOT NULL DEFAULT 'PROPOSED',
            proposed_by UUID NOT NULL,
            proposed_by_email VARCHAR(255),
            proposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            proposal_payload JSONB NOT NULL DEFAULT '{}',
            proposal_hash VARCHAR(64) NOT NULL,
            approved_by UUID,
            approved_by_email VARCHAR(255),
            approved_at TIMESTAMPTZ,
            approval_notes TEXT,
            approval_hash VARCHAR(64),
            execution_ref VARCHAR(128),
            executed_at TIMESTAMPTZ,
            rejection_reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT ck_execution_proposals_sod CHECK (approved_by IS NULL OR approved_by != proposed_by))""",
        "CREATE INDEX IF NOT EXISTS ix_exec_proposals_position ON execution_proposals(position_id, status)",
        "CREATE INDEX IF NOT EXISTS ix_exec_proposals_company ON execution_proposals(company_id, status, proposed_at)",
        "CREATE INDEX IF NOT EXISTS ix_exec_proposals_proposer ON execution_proposals(proposed_by, status)",

        # ?? BUG-4 FIX: Add missing columns to execution_proposals (table may have been
        # created by an older SQLAlchemy create_all before these columns were in the model)
        "ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS proposed_by_email VARCHAR(255)",
        "ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS approved_by_email VARCHAR(255)",
        "ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS approval_notes TEXT",
        "ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS approval_hash VARCHAR(64)",
        "ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS execution_ref VARCHAR(128)",
        "ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ",
        "ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS rejection_reason TEXT",
        "ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",

        # ?? Support Ticketing (tenant-scoped, WORM events) ??
        """CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    branch_id UUID,
    submitted_by UUID NOT NULL,
    submitted_by_email VARCHAR(255),
    ticket_ref VARCHAR(16) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(4) NOT NULL DEFAULT 'S3',
    category VARCHAR(32) NOT NULL DEFAULT 'other',
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    resolution_notes TEXT,
    diagnostics_bundle JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    CONSTRAINT ck_ticket_severity CHECK (severity IN ('S0','S1','S2','S3','S4')),
    CONSTRAINT ck_ticket_status CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
    UNIQUE(company_id, ticket_ref))""",
        "CREATE INDEX IF NOT EXISTS ix_tickets_tenant ON support_tickets(company_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_tickets_status ON support_tickets(company_id, status)",
        "CREATE INDEX IF NOT EXISTS ix_tickets_user ON support_tickets(submitted_by, created_at)",

        """CREATE TABLE IF NOT EXISTS ticket_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    company_id UUID NOT NULL,
    actor_id UUID,
    actor_email VARCHAR(255),
    event_type VARCHAR(32) NOT NULL,
    old_status VARCHAR(16),
    new_status VARCHAR(16),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",
        "CREATE INDEX IF NOT EXISTS ix_ticket_events_ticket ON ticket_events(ticket_id, created_at)",

        # ?? WORM enforcement: DB-level triggers prevent UPDATE/DELETE on ticket_events ??
        # These triggers make the "append-only" property a database guarantee, not just convention.
        """CREATE OR REPLACE FUNCTION ticket_events_worm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ticket_events is WORM (append-only): % on row % is forbidden', TG_OP, OLD.id;
END;
$$""",
        """DO $$ BEGIN
  CREATE TRIGGER trg_ticket_events_no_update
    BEFORE UPDATE ON ticket_events
    FOR EACH ROW EXECUTE FUNCTION ticket_events_worm();
EXCEPTION WHEN duplicate_object THEN NULL; END $$""",
        """DO $$ BEGIN
  CREATE TRIGGER trg_ticket_events_no_delete
    BEFORE DELETE ON ticket_events
    FOR EACH ROW EXECUTE FUNCTION ticket_events_worm();
EXCEPTION WHEN duplicate_object THEN NULL; END $$""",

        # ── MarketSnapshot WORM store (backend-authoritative market data) ────────
        # Each row is a timestamped, hashed, tenant-scoped market data capture.
        # UNIQUE(company_id, market_snapshot_hash) prevents duplicate ingestion.
        """CREATE TABLE IF NOT EXISTS market_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    market_snapshot_hash VARCHAR(64) NOT NULL,
    provider VARCHAR(64) NOT NULL DEFAULT 'unknown',
    data_class VARCHAR(32) NOT NULL DEFAULT 'INDICATIVE_FALLBACK',
    as_of TIMESTAMPTZ NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    primary_currency VARCHAR(8) NOT NULL DEFAULT 'MXN',
    spot_rate DOUBLE PRECISION NOT NULL,
    payload JSONB NOT NULL,
    canonical_payload_json TEXT NOT NULL,
    raw_payload_hash VARCHAR(64),
    is_synthetic_forward BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, market_snapshot_hash))""",
        "CREATE INDEX IF NOT EXISTS ix_market_snapshots_company_as_of ON market_snapshots(company_id, as_of)",
        "CREATE INDEX IF NOT EXISTS ix_market_snapshots_company_currency ON market_snapshots(company_id, primary_currency)",

        # WORM: DB-level triggers prevent UPDATE/DELETE on market_snapshots
        """CREATE OR REPLACE FUNCTION market_snapshots_worm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'market_snapshots is WORM (append-only): % on row % is forbidden', TG_OP, OLD.id;
END;
$$""",
        """DO $$ BEGIN
  CREATE TRIGGER trg_market_snapshots_no_update
    BEFORE UPDATE ON market_snapshots
    FOR EACH ROW EXECUTE FUNCTION market_snapshots_worm();
EXCEPTION WHEN duplicate_object THEN NULL; END $$""",
        """DO $$ BEGIN
  CREATE TRIGGER trg_market_snapshots_no_delete
    BEFORE DELETE ON market_snapshots
    FOR EACH ROW EXECUTE FUNCTION market_snapshots_worm();
EXCEPTION WHEN duplicate_object THEN NULL; END $$""",

    ]

    for stmt in raw_ddl:

        try:

            async with async_engine.begin() as conn:

                await conn.execute(text(stmt))

        except Exception as e:

            logger.debug(f"DDL skipped: {e}")



    logger.info("? Database tables ensured")





@asynccontextmanager

async def lifespan(app: FastAPI):

    await init_engine()

    rebuild_all_schemas()



    try:

        await _ensure_tables()

    except Exception as e:

        logger.warning(f"?? _ensure_tables skipped: {e}")



    try:

        await _seed_roles()

    except Exception as e:

        logger.warning(f"?? _seed_roles skipped (DB may be uninitialised): {e}")



    try:

        await _seed_permissions()

    except Exception as e:

        logger.warning(f"?? _seed_permissions skipped (DB may be uninitialised): {e}")



    try:

        await _seed_policy_templates()

    except Exception as e:

        logger.warning(f"?? _seed_policy_templates skipped: {e}")



    try:

        await _sync_seed_users()

    except Exception as e:

        logger.warning(f"?? _sync_seed_users skipped: {e}")



    try:

        yield

    finally:

        await shutdown_engine()





# -------------------------------------------------------------------

# FastAPI App (ROOTLESS -- NGINX OWNS /api)

# -------------------------------------------------------------------

app = FastAPI(

    title=settings.APP_NAME,

    version="1.0.0",

    lifespan=lifespan,

    docs_url=None,

    redoc_url=None,

    openapi_url="/api/openapi.json",

)





# -------------------------------------------------------------------

# Root Redirect (PRODUCTION SAFE)

# -------------------------------------------------------------------

@app.get("/", include_in_schema=False)

def root_redirect():

    return HTMLResponse(

        """

        <html>

            <head>

                <meta http-equiv="refresh" content="0; url=/api/docs" />

            </head>

            <body>

                Redirecting to API docs...

            </body>

        </html>

        """

    )





# -------------------------------------------------------------------

# Global Exception Guard

# -------------------------------------------------------------------

@app.exception_handler(Exception)

async def unhandled_exception_handler(request: Request, exc: Exception):

    logger.error("? Unhandled exception %s %s", request.method, request.url.path)

    traceback.print_exc()

    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})





# -------------------------------------------------------------------

# Middleware (CANONICAL ORDER -- Starlette LIFO: last added = outermost)

# Inner -> Outer: GZip -> AuditHeaders -> RateLimit -> APIKeyAuth -> CORS

# CORS must be outermost to handle OPTIONS preflight before auth blocks it.

# -------------------------------------------------------------------

app.add_middleware(GZipMiddleware, minimum_size=512)

app.add_middleware(AuditHeadersMiddleware)

app.add_middleware(

    RateLimitMiddleware,

    requests_per_minute=60,

    redis_url=settings.REDIS_URL,

)

app.add_middleware(APIKeyAuthMiddleware)



# CORS outermost -- added last so it runs first (intercepts OPTIONS preflight)

app.add_middleware(

    CORSMiddleware,

    allow_origins=[str(o).rstrip("/") for o in settings.CORS_ALLOW_ORIGINS],

    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,

    allow_methods=settings.CORS_ALLOW_METHODS,

    allow_headers=settings.CORS_ALLOW_HEADERS,

)





# -------------------------------------------------------------------

# Security Headers

# -------------------------------------------------------------------

@app.middleware("http")

async def security_headers(request: Request, call_next):

    response: Response = await call_next(request)

    response.headers.setdefault("X-Content-Type-Options", "nosniff")

    response.headers.setdefault("X-Frame-Options", "DENY")

    response.headers.setdefault("Referrer-Policy", "no-referrer")

    return response





# -------------------------------------------------------------------

# Routers (SINGLE MOUNT)

# -------------------------------------------------------------------

from app.api.router import router as api_router

from app.routes.engine import router as engine_router



app.include_router(api_router, prefix="/api")

app.include_router(engine_router, prefix="/api")



logger.info("? Routers mounted under /api")





# -------------------------------------------------------------------

# OpenAPI (CANONICAL)

# -------------------------------------------------------------------

def custom_openapi() -> dict[str, Any]:

    if app.openapi_schema:

        return app.openapi_schema



    schema = get_openapi(

        title=settings.APP_NAME,

        version="1.0.0",

        description="SynexFund HedgeCalc API",

        routes=app.routes,

    )



    schema["servers"] = [{"url": "/api"}]

    app.openapi_schema = schema

    return schema





app.openapi = custom_openapi





# -------------------------------------------------------------------

# Public System Endpoint

# -------------------------------------------------------------------

@app.get("/api/health", tags=["system"])

def health():

    return {"status": "ok", "service": settings.APP_NAME}





# -------------------------------------------------------------------

# Docs

# -------------------------------------------------------------------

@app.get("/api/docs", include_in_schema=False)

def swagger_docs():

    return get_swagger_ui_html(

        openapi_url="/api/openapi.json",

        title=f"{settings.APP_NAME} - Swagger",

        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",

        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css",

    )





@app.get("/api/redoc", include_in_schema=False)

def redoc_docs():

    return get_redoc_html(

        openapi_url="/api/openapi.json",

        title=f"{settings.APP_NAME} - ReDoc",

    )





# -------------------------------------------------------------------

# Scheduler

# -------------------------------------------------------------------

@app.on_event("startup")

async def on_startup():

    scheduler = AsyncIOScheduler(timezone="UTC")

    scheduler.add_job(

        cleanup_audit_tables,

        CronTrigger(hour=3, minute=30),

        id="audit_cleanup",

        replace_existing=True,

    )

    scheduler.start()

    app.state.scheduler = scheduler





@app.on_event("shutdown")

async def on_shutdown():

    scheduler = getattr(app.state, "scheduler", None)

    if scheduler:

        scheduler.shutdown(wait=False)

