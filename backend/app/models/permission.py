"""

app/models/permission.py

HedgeCalc - Granular Permission Models



Defines:

- Permission: atomic capability (e.g. 'trades.create')

- RolePermission: many-to-many between Role and Permission



Permissions are organized by module and action:

  codename = "{module}.{action}"  (e.g. "trades.create", "reports.view_all_branches")



Seed data is loaded in main.py lifespan.

"""



from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Permission(Base):

    """Atomic permission capability."""



    __tablename__ = "permissions"



    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)



    codename: Mapped[str] = mapped_column(

        String(128), nullable=False, unique=True, index=True,

        doc="Unique dotted identifier (e.g. 'trades.create').",

    )



    module: Mapped[str] = mapped_column(

        String(64), nullable=False, index=True,

        doc="Logical module grouping (e.g. 'trades', 'pipeline').",

    )



    action: Mapped[str] = mapped_column(

        String(64), nullable=False,

        doc="Action within module (e.g. 'create', 'view', 'approve').",

    )



    description: Mapped[str] = mapped_column(

        String(255), nullable=False, default="",

        doc="Human-readable description of what this permission allows.",

    )



    created_at: Mapped[datetime] = mapped_column(

        DateTime(timezone=True), server_default=func.now(), nullable=False,

    )



    # Relationships

    role_permissions: Mapped[list[RolePermission]] = relationship(

        "RolePermission",

        back_populates="permission",

        cascade="all, delete-orphan",

    )



    __table_args__: tuple = ()



    def __repr__(self) -> str:

        return f"<Permission {self.codename!r}>"





class RolePermission(Base):

    """Links a Role to a Permission (many-to-many)."""



    __tablename__ = "role_permissions"



    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)



    role_id: Mapped[int] = mapped_column(

        ForeignKey("roles.id", ondelete="CASCADE"),

        nullable=False,

        index=True,

    )



    permission_id: Mapped[int] = mapped_column(

        ForeignKey("permissions.id", ondelete="CASCADE"),

        nullable=False,

        index=True,

    )



    created_at: Mapped[datetime] = mapped_column(

        DateTime(timezone=True), server_default=func.now(), nullable=False,

    )



    # Relationships

    role = relationship("Role", backref="role_permissions")

    permission: Mapped[Permission] = relationship(

        "Permission", back_populates="role_permissions",

    )



    __table_args__ = (

        UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),

        Index("ix_role_permissions_role_id", "role_id"),

    )



    def __repr__(self) -> str:

        return f"<RolePermission role={self.role_id} perm={self.permission_id}>"





# -------------------------------------------------------------------

# Seed Data: All available permissions

# -------------------------------------------------------------------

# Used by _seed_permissions() in main.py



SEED_PERMISSIONS: list[tuple[str, str, str, str]] = [

    # (codename, module, action, description)



    # Trades

    ("trades.view", "trades", "view", "View trade exposure positions"),

    ("trades.create", "trades", "create", "Create new trade positions"),

    ("trades.edit", "trades", "edit", "Edit existing trade positions"),

    ("trades.delete", "trades", "delete", "Delete trade positions"),

    ("trades.import_csv", "trades", "import_csv", "Import trades from CSV files"),
    ("trades.execute", "trades", "execute", "Execute (confirm) hedged trades -- READY_TO_EXECUTE -> HEDGED"),



    # Hedges

    ("hedges.view", "hedges", "view", "View existing hedge positions"),

    ("hedges.create", "hedges", "create", "Create new hedge positions"),

    ("hedges.edit", "hedges", "edit", "Edit existing hedge positions"),

    ("hedges.delete", "hedges", "delete", "Delete hedge positions"),



    # Calculate

    ("calculate.run_sandbox", "calculate", "run_sandbox", "Run sandbox (ephemeral) calculations"),

    ("calculate.run_production", "calculate", "run_production", "Run production hedge calculations"),



    # Pipeline governance

    ("pipeline.create_proposal", "pipeline", "create_proposal", "Create hedge proposals from sandbox results"),

    ("pipeline.submit_staging", "pipeline", "submit_staging", "Submit proposals to governance staging"),

    ("pipeline.approve", "pipeline", "approve", "Approve staged hedge artifacts"),

    ("pipeline.reject", "pipeline", "reject", "Reject staged hedge artifacts"),

    ("pipeline.authorize_ledger", "pipeline", "authorize_ledger", "Authorize final ledger entry"),



    # Policy

    ("policy.view", "policy", "view", "View hedge policy configurations"),

    ("policy.edit", "policy", "edit", "Edit hedge policy parameters"),

    ("policy.activate",      "policy", "activate",      "Activate / deactivate a policy instance"),
    ("policy.create_preset", "policy", "create_preset", "Create custom policy presets"),



    # Market data

    ("market.view", "market", "view", "View market data snapshots"),

    ("market.edit", "market", "edit", "Manually edit market data"),

    ("market.autofill", "market", "autofill", "Trigger market data autofill"),

    ("market.snapshot.create", "market", "snapshot.create", "Persist market snapshots to WORM store"),

    ("market.snapshot.read", "market", "snapshot.read", "Read market snapshots from WORM store"),



    # Reports

    ("reports.view_own_branch", "reports", "view_own_branch", "View reports for own branch"),

    ("reports.view_all_branches", "reports", "view_all_branches", "View reports across all branches"),

    ("reports.export_pdf",   "reports", "export_pdf",   "Export reports as PDF"),

    ("reports.export_excel", "reports", "export_excel", "Export reports as Excel"),

    ("reports.export",       "reports", "export",       "Export reports in any format (PDF, Excel, ZIP, Committee Pack)"),



    # User management

    ("users.view", "users", "view", "View user profiles and lists"),

    ("users.create", "users", "create", "Create new user accounts"),

    ("users.edit", "users", "edit", "Edit user profiles and assignments"),

    ("users.deactivate", "users", "deactivate", "Deactivate user accounts"),

    ("users.assign_roles", "users", "assign_roles", "Assign or remove roles from users"),



    # Company management

    ("company.view_settings", "company", "view_settings", "View company settings"),

    ("company.edit_settings", "company", "edit_settings", "Edit company settings"),

    ("company.manage_branches", "company", "manage_branches", "Create, edit, and deactivate branches"),



    # Audit

    ("audit.view_own", "audit", "view_own", "View own activity logs"),

    ("audit.view_branch", "audit", "view_branch", "View activity logs for own branch"),

    ("audit.view_all", "audit", "view_all", "View activity logs across entire company"),



    # Overrides

    ("overrides.override_subordinate", "overrides", "override_subordinate", "Override subordinate decisions"),

    ("overrides.impersonate", "overrides", "impersonate", "View-as another user (read-only, fully logged)"),



    # System diagnostics (schema governance)

    ("system.schema.read", "system", "schema.read", "Read full schema readiness diagnostics via /system/schema-health"),

]



# Default role -> permissions mapping for seed

DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {

    "admin": [p[0] for p in SEED_PERMISSIONS],  # All permissions



    "supervisor": [

        "trades.view", "trades.create", "trades.edit", "trades.delete", "trades.import_csv", "trades.execute",

        "hedges.view", "hedges.create", "hedges.edit", "hedges.delete",

        "calculate.run_sandbox", "calculate.run_production",

        "pipeline.create_proposal", "pipeline.submit_staging",

        "pipeline.approve", "pipeline.reject",

        "policy.view", "policy.edit", "policy.activate",

        "market.view", "market.edit", "market.autofill",
        "market.snapshot.create", "market.snapshot.read",

        "reports.view_own_branch", "reports.view_all_branches",

        "reports.export_pdf", "reports.export_excel", "reports.export",

        "users.view",

        "audit.view_own", "audit.view_branch",

        "overrides.override_subordinate",

        "system.schema.read",

    ],



    "risk_analyst": [

        "trades.view", "trades.create", "trades.edit", "trades.delete", "trades.import_csv", "trades.execute",

        "hedges.view", "hedges.create", "hedges.edit",

        "calculate.run_sandbox", "calculate.run_production",

        "pipeline.create_proposal", "pipeline.submit_staging",

        "policy.view", "policy.edit", "policy.activate", "policy.create_preset",

        "market.view", "market.autofill",
        "market.snapshot.create", "market.snapshot.read",

        "reports.view_own_branch", "reports.export_pdf", "reports.export",

        "audit.view_own", "audit.view_branch",

        "system.schema.read",

    ],

}

