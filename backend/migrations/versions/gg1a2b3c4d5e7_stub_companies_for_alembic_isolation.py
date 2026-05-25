"""stub: pre-create out-of-order tables for alembic-in-isolation

Revision ID: gg1a2b3c4d5e7
Revises: g1a2b3c4d5e6
Create Date: 2026-05-25

Several tables in the historical chain are either ORM-only (created
only by `_ensure_tables()` in `app/main.py`, never by any migration)
or are referenced as FK targets by migrations that run BEFORE the
migration that creates them (out-of-order DAG dependencies):

  - `companies` — ORM-only. First crash: `h1a2b3c4d5e6` ALTER.
  - `legal_entities` — created by `0017_legal_entities` at chain
    position 45 but FK-referenced by `r1a2b3c4d5e6_add_debt_tables`
    at chain position 35.
  - `permissions` — ORM-only. Crash: `t1a2b3c4d5e6_add_ir_debt_permissions`
    INSERT.
  - `roles` — ORM-only. FK target of `role_permissions`.
  - `role_permissions` — ORM-only. Crash: `t1a2b3c4d5e6_add_ir_debt_permissions`
    INSERT INTO role_permissions.

Production tolerates both because `run_alembic_upgrade()` swallows
exceptions non-fatally and `_ensure_tables()` finalises the schema.
The advisory backend-postgres CI job runs alembic in isolation and
crashes on the first such reference.

This stub creates both tables with `CREATE TABLE IF NOT EXISTS`,
making the operation idempotent — production already has the tables
(populated by `_ensure_tables` for `companies`, or by `0017` for
`legal_entities` on a fresh chain), so the stub is a no-op there.

Schemas match the production state:
  - `companies`: app/main.py lines 435-445
  - `legal_entities`: 0017_legal_entities.py lines 17-36
  - `permissions`: app/main.py line 551
  - `roles`: app/main.py lines 449-465
  - `role_permissions`: app/main.py lines 565-575

Architectural note: this is the architecturally clean follow-up to
the per-migration guard sweep (`24dfb84`, `0cba136`, `d3c46ed`).
Instead of guarding every migration that touches a missing table,
it inserts the missing CREATEs at the chain segment before the
first ALTER. RISK-CI-PG-02.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "gg1a2b3c4d5e7"
down_revision = "g1a2b3c4d5e6"
branch_labels = None
depends_on = None


COMPANIES_DDL = """
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(64) UNIQUE NOT NULL,
    domain VARCHAR(255),
    logo_url VARCHAR(512),
    settings JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


LEGAL_ENTITIES_DDL = """
CREATE TABLE IF NOT EXISTS legal_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    parent_entity_id UUID REFERENCES legal_entities(id),
    legal_name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100) NOT NULL,
    lei VARCHAR(20),
    giin VARCHAR(19),
    registration_number VARCHAR(100),
    jurisdiction VARCHAR(100),
    country CHAR(2) NOT NULL,
    functional_currency CHAR(3) NOT NULL,
    reporting_currency CHAR(3) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version INTEGER NOT NULL DEFAULT 1
);
"""


PERMISSIONS_DDL = """
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    codename VARCHAR(128) UNIQUE NOT NULL,
    module VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


ROLES_DDL = """
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(64) NOT NULL UNIQUE,
    description VARCHAR(255),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    hierarchy_level INTEGER NOT NULL DEFAULT 10,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


ROLE_PERMISSIONS_DDL = """
CREATE TABLE IF NOT EXISTS role_permissions (
    id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);
"""


def upgrade() -> None:
    op.execute(COMPANIES_DDL)
    op.execute(LEGAL_ENTITIES_DDL)
    op.execute(PERMISSIONS_DDL)
    op.execute(ROLES_DDL)
    op.execute(ROLE_PERMISSIONS_DDL)


def downgrade() -> None:
    # Intentional no-op. Dropping these tables would cascade-destroy
    # large portions of the schema, and the stub purpose is to bring
    # an empty PG up to the chain's mid-state. Tables created by
    # stubs of this shape should be cleaned via
    # `DROP SCHEMA public CASCADE`, not via alembic downgrade.
    pass
