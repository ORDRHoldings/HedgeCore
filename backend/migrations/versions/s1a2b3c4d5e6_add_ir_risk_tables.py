"""add_ir_risk_tables

Revision ID: s1a2b3c4d5e6
Revises: r1a2b3c4d5e6
Create Date: 2026-04-17
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "s1a2b3c4d5e6"
down_revision = "r1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ir_swaps",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("legal_entity_id", UUID(as_uuid=True), sa.ForeignKey("legal_entities.id"), nullable=True, index=True),
        sa.Column("linked_facility_id", UUID(as_uuid=True), sa.ForeignKey("debt_facilities.id"), nullable=True, index=True),
        sa.Column("instrument_type", sa.String(16), nullable=False),
        sa.Column("notional", sa.Numeric(20, 6), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("fixed_rate", sa.Numeric(10, 6), nullable=True),
        sa.Column("strike", sa.Numeric(10, 6), nullable=True),
        sa.Column("float_index", sa.String(16), nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("maturity_date", sa.Date, nullable=False),
        sa.Column("pay_fixed", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("day_count", sa.String(16), nullable=False, server_default="ACT365"),
        sa.Column("reset_frequency", sa.String(16), nullable=False, server_default="QUARTERLY"),
        sa.Column("last_npv", sa.Numeric(20, 6), nullable=True),
        sa.Column("last_dv01", sa.Numeric(20, 6), nullable=True),
        sa.Column("last_mtm_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="ACTIVE"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "ir_vol_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("index", sa.String(16), nullable=False),
        sa.Column("option_expiry", sa.String(8), nullable=False),
        sa.Column("swap_tenor", sa.String(8), nullable=False),
        sa.Column("strike", sa.Numeric(10, 6), nullable=False, server_default="0"),
        sa.Column("implied_vol_normal", sa.Numeric(10, 6), nullable=True),
        sa.Column("implied_vol_lognormal", sa.Numeric(10, 6), nullable=True),
        sa.Column("as_of", sa.Date, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "ir_hedge_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("swap_id", UUID(as_uuid=True), sa.ForeignKey("ir_swaps.id"), nullable=False, index=True),
        sa.Column("facility_id", UUID(as_uuid=True), sa.ForeignKey("debt_facilities.id"), nullable=True),
        sa.Column("run_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("method", sa.String(32), nullable=False),
        sa.Column("ratio", sa.Numeric(10, 6), nullable=False),
        sa.Column("passed", sa.Boolean, nullable=False),
        sa.Column("inputs_hash", sa.String(64), nullable=False),
        sa.Column("run_hash", sa.String(64), nullable=False),
        sa.Column("prior_run_hash", sa.String(64), nullable=False, server_default="0000000000000000000000000000000000000000000000000000000000000000"),
        sa.Column("evidence_json", JSONB, nullable=False, server_default="{}"),
    )

    # WORM trigger: ir_hedge_runs is append-only
    op.execute("""
        CREATE OR REPLACE FUNCTION protect_ir_hedge_runs()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'ir_hedge_runs is append-only — UPDATE and DELETE are forbidden';
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER trg_ir_hedge_runs_worm
        BEFORE UPDATE OR DELETE ON ir_hedge_runs
        FOR EACH ROW EXECUTE FUNCTION protect_ir_hedge_runs();
    """)

    # Composite indexes
    op.create_index("ix_ir_swaps_tenant_status", "ir_swaps", ["tenant_id", "status"])
    op.create_index("ix_ir_hedge_runs_tenant_run_at", "ir_hedge_runs", ["tenant_id", "run_at"])


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_ir_hedge_runs_worm ON ir_hedge_runs;")
    op.execute("DROP FUNCTION IF EXISTS protect_ir_hedge_runs;")
    op.drop_index("ix_ir_swaps_tenant_status", "ir_swaps")
    op.drop_index("ix_ir_hedge_runs_tenant_run_at", "ir_hedge_runs")

    op.drop_table("ir_hedge_runs")
    op.drop_table("ir_vol_snapshots")
    op.drop_table("ir_swaps")
