"""
Policy ORM models.

PolicyTemplate — system-wide (company_id=NULL) or company-custom policy definitions.
PolicyInstance — a template activated for a specific company+branch. Only one is_active
                 per (company_id, branch_id) at any time (enforced in service layer).
"""
import uuid as _uuid

from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID

from app.core.db import Base


class PolicyTemplate(Base):
    """
    Immutable-ish template defining hedge ratio rules and execution parameters.

    System templates: company_id=NULL, is_system=True — seeded once, never deleted.
    Company templates: company_id set, is_system=False — created by company admins
                       with policy.create_preset permission.
    """
    __tablename__ = "policy_templates"

    id         = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    company_id = Column(PGUUID(as_uuid=True), nullable=True)    # NULL → system-wide
    name       = Column(String(255), nullable=False)
    short_name = Column(String(16),  nullable=False)             # e.g. 'BLNC', 'CNSV'
    description= Column(Text, nullable=True)
    risk_posture = Column(String(16), nullable=False)            # CONSERVATIVE|MODERATE|AGGRESSIVE
    category   = Column(String(32),  nullable=False)             # CORPORATE|FINANCIAL|SOVEREIGN|SECTOR
    # Full PolicyConfig as JSONB: {bucket_mode, hedge_ratios, cost_assumptions,
    #                               execution_product, min_trade_size_usd}
    config     = Column(JSONB, nullable=False)
    version    = Column(Integer, nullable=False, default=1)
    is_system  = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))


class PolicyInstance(Base):
    """
    An activation record linking a branch to a PolicyTemplate.

    Service enforces: at most one is_active=True per (company_id, branch_id).
    Deactivation is done by setting is_active=False on the previous instance,
    never by deletion (preserves audit trail).
    """
    __tablename__ = "policy_instances"

    id           = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    company_id   = Column(PGUUID(as_uuid=True), nullable=False)  # FK → companies
    branch_id    = Column(PGUUID(as_uuid=True), nullable=True)   # FK → branches (NULL = company-wide)
    template_id  = Column(PGUUID(as_uuid=True), nullable=False)  # FK → policy_templates
    activated_by = Column(PGUUID(as_uuid=True), nullable=False)  # FK → users
    activated_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
    is_active    = Column(Boolean, nullable=False, default=True)

    __table_args__ = (
        # Primary lookup: active policy for a branch
        Index("ix_policy_instances_scope", "company_id", "branch_id", "is_active"),
    )
