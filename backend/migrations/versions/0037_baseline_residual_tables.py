"""0037 baseline: residual tables + column-patches into Alembic.

Makes `alembic upgrade head` build the full WORKING schema independent of
app/main.py::_ensure_tables() (verified empirically — see ADR-0021):
  - creates the 25 tables that existed only in _ensure_tables (incl. `positions`),
  - applies the 43 ADD COLUMN IF NOT EXISTS patches that _ensure_tables adds to
    alembic-managed tables (users.company_id/created_at, companies.plan_tier,
    execution_proposals.*, roles.hierarchy_level, etc.) — without which auth/users
    queries 500 on a pure-alembic schema,
  - re-applies the positions tenant-RLS that 0036 skips when positions is absent.

All statements are extracted VERBATIM from _ensure_tables (raw_ddl) via AST in
original order, and are idempotent (IF NOT EXISTS), so this is safe to co-run with
the _ensure_tables bridge during the transition.

Revision ID: 0037_baseline_residual_tables
Revises: 0036_force_rls_tenant_context
"""
from alembic import op

revision = "0037_baseline_residual_tables"
down_revision = "0036_force_rls_tenant_context"
branch_labels = None
depends_on = None

_NO_TENANT = "00000000-0000-0000-0000-000000000000"
_POS_CLAUSE = (
    "( current_setting('app.bypass_tenant_rls', true) = 'true'"
    " OR company_id::text = COALESCE("
    "   NULLIF(current_setting('app.current_tenant_id', true), ''), '" + _NO_TENANT + "') )"
)

# Verbatim DDL extracted from app/main.py::_ensure_tables (raw_ddl), original order:
# the 25 residual tables + ADD COLUMN patches on alembic-managed tables.
_BASELINE_DDL = [
    "CREATE TABLE IF NOT EXISTS branches (\n\n            id UUID PRIMARY KEY,\n\n            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,\n\n            name VARCHAR(255) NOT NULL, code VARCHAR(32) NOT NULL,\n\n            region VARCHAR(128), timezone VARCHAR(64) DEFAULT 'UTC',\n\n            is_active BOOLEAN NOT NULL DEFAULT TRUE,\n\n            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n\n            UNIQUE(company_id, code))",
    'CREATE TABLE IF NOT EXISTS departments (\n\n            id UUID PRIMARY KEY,\n\n            branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,\n\n            name VARCHAR(255) NOT NULL, code VARCHAR(32) NOT NULL,\n\n            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n\n            UNIQUE(branch_id, code))',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(128)',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_preferences JSONB',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE companies ADD COLUMN IF NOT EXISTS sso_provider VARCHAR(64)',
    'ALTER TABLE companies ADD COLUMN IF NOT EXISTS sso_domain VARCHAR(255)',
    'ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(128) UNIQUE',
    'ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(128) UNIQUE',
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan_tier VARCHAR(32) NOT NULL DEFAULT 'starter'",
    'ALTER TABLE companies ADD COLUMN IF NOT EXISTS intelligence_enabled BOOLEAN NOT NULL DEFAULT FALSE',
    'ALTER TABLE roles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE',
    'ALTER TABLE roles ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER NOT NULL DEFAULT 10',
    'ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE',
    "CREATE TABLE IF NOT EXISTS positions (\n\n            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n\n            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,\n\n            branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,\n\n            created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,\n\n            record_id VARCHAR(128) NOT NULL,\n\n            entity VARCHAR(255) NOT NULL,\n\n            flow_type VARCHAR(4) NOT NULL,\n\n            currency VARCHAR(3) NOT NULL,\n\n            amount NUMERIC(20,6) NOT NULL,\n\n            value_date VARCHAR(10) NOT NULL,\n\n            status VARCHAR(16) NOT NULL DEFAULT 'CONFIRMED',\n\n            description VARCHAR(512),\n\n            is_active BOOLEAN NOT NULL DEFAULT TRUE,\n\n            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n\n            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n\n            CONSTRAINT positions_currency_length CHECK (char_length(currency) = 3),\n\n            CONSTRAINT positions_amount_positive CHECK (amount > 0),\n\n            CONSTRAINT positions_flow_type_enum CHECK (flow_type IN ('AR', 'AP')),\n\n            CONSTRAINT positions_status_enum CHECK (status IN ('CONFIRMED', 'FORECAST')),\n\n            UNIQUE(company_id, record_id))",
    'CREATE INDEX IF NOT EXISTS ix_positions_scope ON positions(company_id, branch_id, is_active)',
    'CREATE INDEX IF NOT EXISTS ix_positions_currency ON positions(company_id, currency)',
    'CREATE INDEX IF NOT EXISTS ix_positions_created_by ON positions(created_by, created_at)',
    "ALTER TABLE positions ADD COLUMN IF NOT EXISTS execution_status VARCHAR(20) NOT NULL DEFAULT 'NEW'",
    'ALTER TABLE positions ADD COLUMN IF NOT EXISTS policy_id UUID',
    'ALTER TABLE positions ADD COLUMN IF NOT EXISTS last_run_id VARCHAR(64)',
    'ALTER TABLE positions ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ',
    'ALTER TABLE positions ADD COLUMN IF NOT EXISTS execution_ref VARCHAR(128)',
    'ALTER TABLE positions ADD COLUMN IF NOT EXISTS hedge_amount NUMERIC(20,6)',
    'ALTER TABLE positions ADD COLUMN IF NOT EXISTS hedge_rate NUMERIC(20,8)',
    'ALTER TABLE positions ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(512)',
    "DO $$ BEGIN\n\n            ALTER TABLE positions ADD CONSTRAINT positions_exec_status_enum\n\n            CHECK (execution_status IN ('NEW','POLICY_ASSIGNED','READY_TO_EXECUTE','HEDGED','REJECTED'));\n\n        EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    'CREATE INDEX IF NOT EXISTS ix_positions_exec_status ON positions(company_id, execution_status)',
    'CREATE INDEX IF NOT EXISTS ix_positions_policy ON positions(policy_id)',
    'CREATE TABLE IF NOT EXISTS policy_templates (\n\n            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n\n            company_id UUID REFERENCES companies(id) ON DELETE CASCADE,\n\n            name VARCHAR(255) NOT NULL,\n\n            short_name VARCHAR(16) NOT NULL,\n\n            description TEXT,\n\n            risk_posture VARCHAR(16) NOT NULL,\n\n            category VARCHAR(32) NOT NULL,\n\n            config JSONB NOT NULL,\n\n            version INTEGER NOT NULL DEFAULT 1,\n\n            is_system BOOLEAN NOT NULL DEFAULT FALSE,\n\n            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    'CREATE TABLE IF NOT EXISTS policy_instances (\n\n            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n\n            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,\n\n            branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,\n\n            template_id UUID NOT NULL REFERENCES policy_templates(id),\n\n            activated_by UUID NOT NULL REFERENCES users(id),\n\n            activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n\n            is_active BOOLEAN NOT NULL DEFAULT TRUE)',
    'CREATE INDEX IF NOT EXISTS ix_policy_instances_scope ON policy_instances(company_id, branch_id, is_active)',
    'ALTER TABLE policy_templates ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL',
    'ALTER TABLE policy_templates ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL',
    'ALTER TABLE policy_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ',
    "ALTER TABLE policy_templates ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'",
    'CREATE INDEX IF NOT EXISTS ix_policy_templates_status ON policy_templates(status, company_id)',
    'CREATE TABLE IF NOT EXISTS user_policy_favorites (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n    template_id UUID NOT NULL REFERENCES policy_templates(id) ON DELETE CASCADE,\n    notes TEXT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n    UNIQUE(user_id, template_id))',
    'CREATE INDEX IF NOT EXISTS ix_policy_favorites_user ON user_policy_favorites(user_id, created_at)',
    'CREATE INDEX IF NOT EXISTS ix_policy_favorites_template ON user_policy_favorites(template_id)',
    "CREATE TABLE IF NOT EXISTS connector_runs (\n\n            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n\n            company_id UUID NOT NULL,\n\n            branch_id UUID,\n\n            triggered_by UUID NOT NULL,\n\n            connector_type VARCHAR(32) NOT NULL,\n\n            source_filename VARCHAR(512),\n\n            source_hash VARCHAR(128),\n\n            status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',\n\n            total_rows INTEGER NOT NULL DEFAULT 0,\n\n            created_ok INTEGER NOT NULL DEFAULT 0,\n\n            error_count INTEGER NOT NULL DEFAULT 0,\n\n            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n\n            completed_at TIMESTAMPTZ)",
    'CREATE INDEX IF NOT EXISTS ix_connector_runs_scope ON connector_runs(company_id, branch_id)',
    'CREATE INDEX IF NOT EXISTS ix_connector_runs_user  ON connector_runs(triggered_by, started_at)',
    'CREATE TABLE IF NOT EXISTS connector_run_errors (\n\n            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n\n            run_id UUID NOT NULL REFERENCES connector_runs(id) ON DELETE CASCADE,\n\n            row_number INTEGER,\n\n            field_name VARCHAR(128),\n\n            error_message TEXT NOT NULL,\n\n            raw_data JSONB)',
    'CREATE INDEX IF NOT EXISTS ix_connector_run_errors_run ON connector_run_errors(run_id)',
    'ALTER TABLE calculation_runs ADD COLUMN IF NOT EXISTS policy_revision_id VARCHAR(64)',
    'ALTER TABLE positions ADD COLUMN IF NOT EXISTS policy_revision_id UUID',
    'CREATE INDEX IF NOT EXISTS ix_positions_policy_revision ON positions(policy_revision_id)',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS proposed_by_email VARCHAR(255)',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS approved_by_email VARCHAR(255)',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS approval_notes TEXT',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS approval_hash VARCHAR(64)',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS execution_ref VARCHAR(128)',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS rejection_reason TEXT',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()',
    'ALTER TABLE staging_artifacts ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS second_approver_required BOOLEAN NOT NULL DEFAULT FALSE',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS second_approver_id UUID',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS second_approver_email VARCHAR(128)',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS second_approved_at TIMESTAMPTZ',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS second_approval_notes VARCHAR(1024)',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS second_approval_hash VARCHAR(64)',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS risk_decision_hash VARCHAR(64)',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS risk_verdict VARCHAR(32)',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS actual_fill_rate FLOAT',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS actual_fill_notional FLOAT',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS slippage_bps FLOAT',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS fill_timestamp VARCHAR(64)',
    'ALTER TABLE execution_proposals ADD COLUMN IF NOT EXISTS fill_hash VARCHAR(64)',
    "CREATE TABLE IF NOT EXISTS support_tickets (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    company_id UUID NOT NULL,\n    branch_id UUID,\n    submitted_by UUID NOT NULL,\n    submitted_by_email VARCHAR(255),\n    ticket_ref VARCHAR(16) NOT NULL,\n    subject VARCHAR(255) NOT NULL,\n    description TEXT NOT NULL,\n    severity VARCHAR(4) NOT NULL DEFAULT 'S3',\n    category VARCHAR(32) NOT NULL DEFAULT 'other',\n    status VARCHAR(16) NOT NULL DEFAULT 'OPEN',\n    resolution_notes TEXT,\n    diagnostics_bundle JSONB,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n    resolved_at TIMESTAMPTZ,\n    CONSTRAINT ck_ticket_severity CHECK (severity IN ('S0','S1','S2','S3','S4')),\n    CONSTRAINT ck_ticket_status CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),\n    UNIQUE(company_id, ticket_ref))",
    'CREATE INDEX IF NOT EXISTS ix_tickets_tenant ON support_tickets(company_id, created_at)',
    'CREATE INDEX IF NOT EXISTS ix_tickets_status ON support_tickets(company_id, status)',
    'CREATE INDEX IF NOT EXISTS ix_tickets_user ON support_tickets(submitted_by, created_at)',
    'CREATE TABLE IF NOT EXISTS ticket_events (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,\n    company_id UUID NOT NULL,\n    actor_id UUID,\n    actor_email VARCHAR(255),\n    event_type VARCHAR(32) NOT NULL,\n    old_status VARCHAR(16),\n    new_status VARCHAR(16),\n    comment TEXT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    'CREATE INDEX IF NOT EXISTS ix_ticket_events_ticket ON ticket_events(ticket_id, created_at)',
    "CREATE OR REPLACE FUNCTION ticket_events_worm()\nRETURNS TRIGGER LANGUAGE plpgsql AS $$\nBEGIN\n  RAISE EXCEPTION 'ticket_events is WORM (append-only): % on row % is forbidden', TG_OP, OLD.id;\nEND;\n$$",
    'DO $$ BEGIN\n  CREATE TRIGGER trg_ticket_events_no_update\n    BEFORE UPDATE ON ticket_events\n    FOR EACH ROW EXECUTE FUNCTION ticket_events_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    'DO $$ BEGIN\n  CREATE TRIGGER trg_ticket_events_no_delete\n    BEFORE DELETE ON ticket_events\n    FOR EACH ROW EXECUTE FUNCTION ticket_events_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    "CREATE TABLE IF NOT EXISTS market_snapshots (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,\n    market_snapshot_hash VARCHAR(64) NOT NULL,\n    provider VARCHAR(64) NOT NULL DEFAULT 'unknown',\n    data_class VARCHAR(32) NOT NULL DEFAULT 'INDICATIVE_FALLBACK',\n    as_of TIMESTAMPTZ NOT NULL,\n    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n    primary_currency VARCHAR(8) NOT NULL DEFAULT 'MXN',\n    spot_rate DOUBLE PRECISION NOT NULL,\n    payload JSONB NOT NULL,\n    canonical_payload_json TEXT NOT NULL,\n    raw_payload_hash VARCHAR(64),\n    is_synthetic_forward BOOLEAN NOT NULL DEFAULT TRUE,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n    UNIQUE(company_id, market_snapshot_hash))",
    'CREATE INDEX IF NOT EXISTS ix_market_snapshots_company_as_of ON market_snapshots(company_id, as_of)',
    'CREATE INDEX IF NOT EXISTS ix_market_snapshots_company_currency ON market_snapshots(company_id, primary_currency)',
    "DO $$ BEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM information_schema.table_constraints\n    WHERE constraint_name = 'uix_market_snapshots_company_hash'\n      AND table_name = 'market_snapshots'\n  ) THEN\n    IF NOT EXISTS (\n      SELECT 1 FROM pg_indexes WHERE indexname = 'uix_market_snapshots_company_hash'\n    ) THEN\n      CREATE UNIQUE INDEX uix_market_snapshots_company_hash\n        ON market_snapshots(company_id, market_snapshot_hash);\n    END IF;\n    ALTER TABLE market_snapshots\n      ADD CONSTRAINT uix_market_snapshots_company_hash\n      UNIQUE USING INDEX uix_market_snapshots_company_hash;\n  END IF;\nEND $$",
    "CREATE OR REPLACE FUNCTION market_snapshots_worm()\nRETURNS TRIGGER LANGUAGE plpgsql AS $$\nBEGIN\n  RAISE EXCEPTION 'market_snapshots is WORM (append-only): % on row % is forbidden', TG_OP, OLD.id;\nEND;\n$$",
    'DO $$ BEGIN\n  CREATE TRIGGER trg_market_snapshots_no_update\n    BEFORE UPDATE ON market_snapshots\n    FOR EACH ROW EXECUTE FUNCTION market_snapshots_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    'DO $$ BEGIN\n  CREATE TRIGGER trg_market_snapshots_no_delete\n    BEFORE DELETE ON market_snapshots\n    FOR EACH ROW EXECUTE FUNCTION market_snapshots_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    "CREATE TABLE IF NOT EXISTS saved_reports (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,\n    run_id VARCHAR(64) NOT NULL,\n    name VARCHAR(255) NOT NULL,\n    snapshot JSONB NOT NULL DEFAULT '{}',\n    version_number INTEGER NOT NULL DEFAULT 1,\n    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    'CREATE INDEX IF NOT EXISTS ix_saved_reports_user ON saved_reports(user_id, saved_at)',
    'CREATE INDEX IF NOT EXISTS ix_saved_reports_company ON saved_reports(company_id, saved_at)',
    'CREATE INDEX IF NOT EXISTS ix_saved_reports_run ON saved_reports(run_id)',
    "CREATE TABLE IF NOT EXISTS report_schedules (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,\n    name VARCHAR(255) NOT NULL,\n    frequency VARCHAR(16) NOT NULL,\n    report_type VARCHAR(64) NOT NULL,\n    recipients JSONB NOT NULL DEFAULT '[]',\n    last_run_at TIMESTAMPTZ,\n    next_run_at TIMESTAMPTZ,\n    is_active BOOLEAN NOT NULL DEFAULT TRUE,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    'CREATE INDEX IF NOT EXISTS ix_report_schedules_user ON report_schedules(user_id, created_at)',
    'CREATE INDEX IF NOT EXISTS ix_report_schedules_company ON report_schedules(company_id, is_active)',
    'CREATE INDEX IF NOT EXISTS ix_report_schedules_next_run ON report_schedules(is_active, next_run_at)',
    'ALTER TABLE staging_artifacts ADD COLUMN IF NOT EXISTS company_id UUID',
    'ALTER TABLE proposals ADD COLUMN IF NOT EXISTS company_id UUID',
    'ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS company_id UUID',
    'CREATE TABLE IF NOT EXISTS audit_datasets (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,\n    period_start DATE NOT NULL,\n    period_end DATE NOT NULL,\n    source_filename TEXT NOT NULL,\n    source_hash TEXT NOT NULL,\n    row_count INTEGER NOT NULL,\n    currency_pairs JSONB,\n    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n    UNIQUE(company_id, source_hash))',
    'CREATE INDEX IF NOT EXISTS ix_audit_datasets_company ON audit_datasets(company_id, created_at)',
    'CREATE TABLE IF NOT EXISTS audit_transactions (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    dataset_id UUID NOT NULL REFERENCES audit_datasets(id) ON DELETE CASCADE,\n    company_id UUID NOT NULL,\n    row_index INTEGER NOT NULL,\n    trade_date DATE,\n    value_date DATE,\n    currency_sold TEXT,\n    currency_bought TEXT,\n    amount_sold NUMERIC,\n    amount_bought NUMERIC,\n    effective_rate NUMERIC,\n    counterparty TEXT,\n    fee_amount NUMERIC,\n    fee_currency TEXT,\n    reference TEXT,\n    row_hash TEXT NOT NULL,\n    parse_warnings JSONB,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    'CREATE INDEX IF NOT EXISTS ix_audit_transactions_dataset ON audit_transactions(dataset_id)',
    'CREATE INDEX IF NOT EXISTS ix_audit_transactions_company ON audit_transactions(company_id)',
    "CREATE TABLE IF NOT EXISTS audit_runs (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,\n    dataset_id UUID NOT NULL REFERENCES audit_datasets(id),\n    methodology_version TEXT NOT NULL,\n    benchmark_config JSONB NOT NULL,\n    run_hash TEXT NOT NULL,\n    inputs_hash TEXT NOT NULL,\n    outputs_hash TEXT NOT NULL,\n    trace_bundle JSONB NOT NULL,\n    status TEXT NOT NULL DEFAULT 'COMPLETED',\n    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    'CREATE INDEX IF NOT EXISTS ix_audit_runs_company ON audit_runs(company_id, created_at)',
    'CREATE INDEX IF NOT EXISTS ix_audit_runs_dataset ON audit_runs(dataset_id)',
    "CREATE TABLE IF NOT EXISTS audit_findings (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    run_id UUID NOT NULL REFERENCES audit_runs(id),\n    company_id UUID NOT NULL,\n    finding_type TEXT NOT NULL,\n    currency_pair TEXT,\n    counterparty TEXT,\n    amount_usd NUMERIC NOT NULL,\n    amount_local NUMERIC,\n    local_currency TEXT,\n    severity TEXT NOT NULL,\n    narrative TEXT NOT NULL,\n    evidence JSONB NOT NULL DEFAULT '[]',\n    finding_hash TEXT NOT NULL,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    'CREATE INDEX IF NOT EXISTS ix_audit_findings_run ON audit_findings(run_id)',
    'CREATE INDEX IF NOT EXISTS ix_audit_findings_company ON audit_findings(company_id, created_at)',
    'CREATE TABLE IF NOT EXISTS audit_reports (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    run_id UUID NOT NULL REFERENCES audit_runs(id),\n    company_id UUID NOT NULL,\n    report_json JSONB NOT NULL,\n    report_hash TEXT NOT NULL,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    'CREATE INDEX IF NOT EXISTS ix_audit_reports_run ON audit_reports(run_id)',
    "CREATE OR REPLACE FUNCTION audit_datasets_worm()\nRETURNS TRIGGER LANGUAGE plpgsql AS $$\nBEGIN\n  RAISE EXCEPTION 'audit_datasets is WORM (append-only): % on row % is forbidden', TG_OP, OLD.id;\nEND;\n$$",
    'DO $$ BEGIN\n  CREATE TRIGGER trg_audit_datasets_no_update\n    BEFORE UPDATE ON audit_datasets\n    FOR EACH ROW EXECUTE FUNCTION audit_datasets_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    'DO $$ BEGIN\n  CREATE TRIGGER trg_audit_datasets_no_delete\n    BEFORE DELETE ON audit_datasets\n    FOR EACH ROW EXECUTE FUNCTION audit_datasets_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    "CREATE OR REPLACE FUNCTION audit_transactions_worm()\nRETURNS TRIGGER LANGUAGE plpgsql AS $$\nBEGIN\n  RAISE EXCEPTION 'audit_transactions is WORM (append-only): % on row % is forbidden', TG_OP, OLD.id;\nEND;\n$$",
    'DO $$ BEGIN\n  CREATE TRIGGER trg_audit_transactions_no_update\n    BEFORE UPDATE ON audit_transactions\n    FOR EACH ROW EXECUTE FUNCTION audit_transactions_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    'DO $$ BEGIN\n  CREATE TRIGGER trg_audit_transactions_no_delete\n    BEFORE DELETE ON audit_transactions\n    FOR EACH ROW EXECUTE FUNCTION audit_transactions_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    "CREATE OR REPLACE FUNCTION audit_runs_worm()\nRETURNS TRIGGER LANGUAGE plpgsql AS $$\nBEGIN\n  RAISE EXCEPTION 'audit_runs is WORM (append-only): % on row % is forbidden', TG_OP, OLD.id;\nEND;\n$$",
    'DO $$ BEGIN\n  CREATE TRIGGER trg_audit_runs_no_update\n    BEFORE UPDATE ON audit_runs\n    FOR EACH ROW EXECUTE FUNCTION audit_runs_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    'DO $$ BEGIN\n  CREATE TRIGGER trg_audit_runs_no_delete\n    BEFORE DELETE ON audit_runs\n    FOR EACH ROW EXECUTE FUNCTION audit_runs_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    "CREATE OR REPLACE FUNCTION audit_findings_worm()\nRETURNS TRIGGER LANGUAGE plpgsql AS $$\nBEGIN\n  RAISE EXCEPTION 'audit_findings is WORM (append-only): % on row % is forbidden', TG_OP, OLD.id;\nEND;\n$$",
    'DO $$ BEGIN\n  CREATE TRIGGER trg_audit_findings_no_update\n    BEFORE UPDATE ON audit_findings\n    FOR EACH ROW EXECUTE FUNCTION audit_findings_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    'DO $$ BEGIN\n  CREATE TRIGGER trg_audit_findings_no_delete\n    BEFORE DELETE ON audit_findings\n    FOR EACH ROW EXECUTE FUNCTION audit_findings_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    "CREATE OR REPLACE FUNCTION audit_reports_worm()\nRETURNS TRIGGER LANGUAGE plpgsql AS $$\nBEGIN\n  RAISE EXCEPTION 'audit_reports is WORM (append-only): % on row % is forbidden', TG_OP, OLD.id;\nEND;\n$$",
    'DO $$ BEGIN\n  CREATE TRIGGER trg_audit_reports_no_update\n    BEFORE UPDATE ON audit_reports\n    FOR EACH ROW EXECUTE FUNCTION audit_reports_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    'DO $$ BEGIN\n  CREATE TRIGGER trg_audit_reports_no_delete\n    BEFORE DELETE ON audit_reports\n    FOR EACH ROW EXECUTE FUNCTION audit_reports_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    "CREATE TABLE IF NOT EXISTS decision_runs (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,\n    position_ids JSONB NOT NULL DEFAULT '[]',\n    policy_revision_id UUID,\n    market_snapshot_id UUID,\n    run_hash TEXT NOT NULL,\n    inputs_hash TEXT NOT NULL,\n    outputs_hash TEXT NOT NULL,\n    trace_bundle JSONB NOT NULL,\n    methodology_version TEXT NOT NULL DEFAULT '1.0.0',\n    status TEXT NOT NULL DEFAULT 'COMPLETED',\n    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    'CREATE INDEX IF NOT EXISTS ix_decision_runs_company ON decision_runs(company_id, created_at)',
    'CREATE TABLE IF NOT EXISTS decision_proposals (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    decision_run_id UUID NOT NULL REFERENCES decision_runs(id),\n    company_id UUID NOT NULL,\n    rank INTEGER NOT NULL,\n    action TEXT NOT NULL,\n    currency_pair TEXT NOT NULL,\n    instrument TEXT NOT NULL,\n    side TEXT NOT NULL,\n    notional_amount NUMERIC NOT NULL,\n    notional_currency TEXT NOT NULL,\n    hedge_ratio_pct NUMERIC NOT NULL,\n    residual_exposure NUMERIC NOT NULL,\n    cost_estimate_usd NUMERIC,\n    margin_proxy_usd NUMERIC,\n    rationale TEXT NOT NULL,\n    schedule JSONB,\n    proposal_hash TEXT NOT NULL,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    'CREATE INDEX IF NOT EXISTS ix_decision_proposals_run ON decision_proposals(decision_run_id)',
    'CREATE INDEX IF NOT EXISTS ix_decision_proposals_company ON decision_proposals(company_id)',
    'CREATE TABLE IF NOT EXISTS execution_packets (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    decision_run_id UUID NOT NULL REFERENCES decision_runs(id),\n    proposal_id UUID NOT NULL REFERENCES decision_proposals(id),\n    company_id UUID NOT NULL,\n    packet_json JSONB NOT NULL,\n    ibkr_payload JSONB,\n    ticket_text TEXT,\n    packet_hash TEXT NOT NULL,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    'CREATE INDEX IF NOT EXISTS ix_execution_packets_run ON execution_packets(decision_run_id)',
    "CREATE TABLE IF NOT EXISTS hedge_effectiveness_datasets (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    company_id UUID NOT NULL,\n    name VARCHAR(255) NOT NULL,\n    description TEXT,\n    currency_pair VARCHAR(10),\n    hedge_type VARCHAR(32) NOT NULL DEFAULT 'cash_flow',\n    designation_date DATE,\n    source VARCHAR(32) NOT NULL DEFAULT 'manual',\n    period_count INTEGER NOT NULL,\n    data_json JSONB NOT NULL,\n    source_hash TEXT NOT NULL,\n    created_by UUID NOT NULL,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    'CREATE INDEX IF NOT EXISTS ix_he_datasets_company ON hedge_effectiveness_datasets(company_id)',
    "CREATE TABLE IF NOT EXISTS hedge_effectiveness_runs (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    company_id UUID NOT NULL,\n    dataset_id UUID NOT NULL REFERENCES hedge_effectiveness_datasets(id),\n    methodology_version VARCHAR(16) NOT NULL,\n    standard VARCHAR(16) NOT NULL DEFAULT 'ASC_815',\n    method_requested VARCHAR(32) NOT NULL DEFAULT 'both',\n    dollar_offset_ratio NUMERIC,\n    dollar_offset_effective BOOLEAN,\n    regression_r_squared NUMERIC,\n    regression_slope NUMERIC,\n    regression_effective BOOLEAN,\n    regression_method VARCHAR(64),\n    overall_effective BOOLEAN NOT NULL,\n    run_hash TEXT NOT NULL,\n    inputs_hash TEXT NOT NULL,\n    outputs_hash TEXT NOT NULL,\n    report_json JSONB NOT NULL,\n    trace_bundle JSONB,\n    status VARCHAR(16) NOT NULL DEFAULT 'COMPLETED',\n    created_by UUID NOT NULL,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    'CREATE INDEX IF NOT EXISTS ix_he_runs_company ON hedge_effectiveness_runs(company_id)',
    'CREATE INDEX IF NOT EXISTS ix_he_runs_dataset ON hedge_effectiveness_runs(dataset_id)',
    "CREATE OR REPLACE FUNCTION hedge_effectiveness_runs_worm()\nRETURNS TRIGGER LANGUAGE plpgsql AS $$\nBEGIN\n  RAISE EXCEPTION 'hedge_effectiveness_runs is WORM (append-only): % on row % is forbidden', TG_OP, OLD.id;\nEND;\n$$",
    'DO $$ BEGIN\n  CREATE TRIGGER trg_he_runs_no_update\n    BEFORE UPDATE ON hedge_effectiveness_runs\n    FOR EACH ROW EXECUTE FUNCTION hedge_effectiveness_runs_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    'DO $$ BEGIN\n  CREATE TRIGGER trg_he_runs_no_delete\n    BEFORE DELETE ON hedge_effectiveness_runs\n    FOR EACH ROW EXECUTE FUNCTION hedge_effectiveness_runs_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    "CREATE OR REPLACE FUNCTION decision_runs_worm()\nRETURNS TRIGGER LANGUAGE plpgsql AS $$\nBEGIN\n  RAISE EXCEPTION 'decision_runs is WORM (append-only): % on row % is forbidden', TG_OP, OLD.id;\nEND;\n$$",
    'DO $$ BEGIN\n  CREATE TRIGGER trg_decision_runs_no_update\n    BEFORE UPDATE ON decision_runs\n    FOR EACH ROW EXECUTE FUNCTION decision_runs_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    'DO $$ BEGIN\n  CREATE TRIGGER trg_decision_runs_no_delete\n    BEFORE DELETE ON decision_runs\n    FOR EACH ROW EXECUTE FUNCTION decision_runs_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    "CREATE OR REPLACE FUNCTION decision_proposals_worm()\nRETURNS TRIGGER LANGUAGE plpgsql AS $$\nBEGIN\n  RAISE EXCEPTION 'decision_proposals is WORM (append-only): % on row % is forbidden', TG_OP, OLD.id;\nEND;\n$$",
    'DO $$ BEGIN\n  CREATE TRIGGER trg_decision_proposals_no_update\n    BEFORE UPDATE ON decision_proposals\n    FOR EACH ROW EXECUTE FUNCTION decision_proposals_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    'DO $$ BEGIN\n  CREATE TRIGGER trg_decision_proposals_no_delete\n    BEFORE DELETE ON decision_proposals\n    FOR EACH ROW EXECUTE FUNCTION decision_proposals_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    "CREATE OR REPLACE FUNCTION execution_packets_worm()\nRETURNS TRIGGER LANGUAGE plpgsql AS $$\nBEGIN\n  RAISE EXCEPTION 'execution_packets is WORM (append-only): % on row % is forbidden', TG_OP, OLD.id;\nEND;\n$$",
    'DO $$ BEGIN\n  CREATE TRIGGER trg_execution_packets_no_update\n    BEFORE UPDATE ON execution_packets\n    FOR EACH ROW EXECUTE FUNCTION execution_packets_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    'DO $$ BEGIN\n  CREATE TRIGGER trg_execution_packets_no_delete\n    BEFORE DELETE ON execution_packets\n    FOR EACH ROW EXECUTE FUNCTION execution_packets_worm();\nEXCEPTION WHEN duplicate_object THEN NULL; END $$',
    "CREATE TABLE IF NOT EXISTS user_watchlists (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n    name VARCHAR(255) NOT NULL DEFAULT 'My Watchlist',\n    symbols JSONB NOT NULL DEFAULT '[]',\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n    CONSTRAINT uix_user_watchlists_user_name UNIQUE (user_id, name))",
    'CREATE INDEX IF NOT EXISTS ix_user_watchlists_user ON user_watchlists(user_id)',
    "ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS channel_type VARCHAR(16) NOT NULL DEFAULT 'generic'",
    "CREATE TABLE IF NOT EXISTS import_batches (\n    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n    company_id UUID NOT NULL,\n    created_by UUID NOT NULL,\n    filename VARCHAR(512) NOT NULL,\n    file_hash VARCHAR(64) NOT NULL,\n    file_size_bytes INTEGER NOT NULL DEFAULT 0,\n    row_count INTEGER NOT NULL DEFAULT 0,\n    valid_count INTEGER NOT NULL DEFAULT 0,\n    error_count INTEGER NOT NULL DEFAULT 0,\n    duplicate_count INTEGER NOT NULL DEFAULT 0,\n    created_count INTEGER NOT NULL DEFAULT 0,\n    status VARCHAR(20) NOT NULL DEFAULT 'UPLOADED',\n    column_mapping JSONB,\n    validation_errors JSONB,\n    created_position_ids JSONB,\n    raw_preview JSONB,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n    validated_at TIMESTAMPTZ,\n    committed_at TIMESTAMPTZ)",
    'CREATE INDEX IF NOT EXISTS ix_import_batches_company ON import_batches(company_id)',
]


def upgrade() -> None:
    for stmt in _BASELINE_DDL:
        op.execute(stmt)
    op.execute("ALTER TABLE positions ENABLE ROW LEVEL SECURITY")
    for _cmd in ("select","insert","update","delete"):
        op.execute(f"DROP POLICY IF EXISTS positions_tenant_isolation_{_cmd} ON positions")
    op.execute(f"CREATE POLICY positions_tenant_isolation_select ON positions FOR SELECT USING {_POS_CLAUSE}")
    op.execute(f"CREATE POLICY positions_tenant_isolation_insert ON positions FOR INSERT WITH CHECK {_POS_CLAUSE}")
    op.execute(f"CREATE POLICY positions_tenant_isolation_update ON positions FOR UPDATE USING {_POS_CLAUSE}")
    op.execute(f"CREATE POLICY positions_tenant_isolation_delete ON positions FOR DELETE USING {_POS_CLAUSE}")
    op.execute("ALTER TABLE positions FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    # Drop only the residual tables; ADD COLUMN patches on pre-existing alembic
    # tables are left in place (harmless, and reversing them risks data loss).
    op.execute("DROP TABLE IF EXISTS audit_datasets CASCADE")
    op.execute("DROP TABLE IF EXISTS audit_findings CASCADE")
    op.execute("DROP TABLE IF EXISTS audit_reports CASCADE")
    op.execute("DROP TABLE IF EXISTS audit_runs CASCADE")
    op.execute("DROP TABLE IF EXISTS audit_transactions CASCADE")
    op.execute("DROP TABLE IF EXISTS branches CASCADE")
    op.execute("DROP TABLE IF EXISTS connector_run_errors CASCADE")
    op.execute("DROP TABLE IF EXISTS connector_runs CASCADE")
    op.execute("DROP TABLE IF EXISTS decision_proposals CASCADE")
    op.execute("DROP TABLE IF EXISTS decision_runs CASCADE")
    op.execute("DROP TABLE IF EXISTS departments CASCADE")
    op.execute("DROP TABLE IF EXISTS execution_packets CASCADE")
    op.execute("DROP TABLE IF EXISTS hedge_effectiveness_datasets CASCADE")
    op.execute("DROP TABLE IF EXISTS hedge_effectiveness_runs CASCADE")
    op.execute("DROP TABLE IF EXISTS import_batches CASCADE")
    op.execute("DROP TABLE IF EXISTS market_snapshots CASCADE")
    op.execute("DROP TABLE IF EXISTS policy_instances CASCADE")
    op.execute("DROP TABLE IF EXISTS policy_templates CASCADE")
    op.execute("DROP TABLE IF EXISTS positions CASCADE")
    op.execute("DROP TABLE IF EXISTS report_schedules CASCADE")
    op.execute("DROP TABLE IF EXISTS saved_reports CASCADE")
    op.execute("DROP TABLE IF EXISTS support_tickets CASCADE")
    op.execute("DROP TABLE IF EXISTS ticket_events CASCADE")
    op.execute("DROP TABLE IF EXISTS user_policy_favorites CASCADE")
    op.execute("DROP TABLE IF EXISTS user_watchlists CASCADE")
