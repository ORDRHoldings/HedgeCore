"""
Custom Report Templates service (P2-B).

Tenant-scoped user-defined report templates. Distinct from the 46 hardcoded
system presets (frontend-only) and from SavedReport (which is a run-bound
snapshot). A CustomReportTemplate is a *reusable blueprint*: section mix +
default bindings, applied to any future run.

Pure-function validators; CRUD is straightforward tenant-scoped ORM.
"""
from __future__ import annotations

import logging
from datetime import datetime, UTC
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.custom_report_template import CustomReportTemplate
from app.models.user import User

log = logging.getLogger(__name__)


# ── Whitelists (must track frontend reportTypes.ts) ─────────────────

_VALID_SECTION_TYPES = {
    "EXECUTIVE_SUMMARY", "HEDGE_PLAN_TABLE", "EXPOSURE_DECOMPOSITION",
    "SCENARIO_SENSITIVITY", "POLICY_COMPLIANCE", "HEDGE_EFFICIENCY",
    "FORWARD_CURVE", "CONNECTOR_HEALTH", "DATA_QUALITY",
    "POSITION_REGISTER", "EXECUTION_LOG", "APPROVAL_CHAIN",
    "POLICY_RATIONALE", "STRESS_TEST_RESULTS", "MACRO_OVERLAY",
    "AUDIT_EVENTS", "DISCLOSURES", "ASSUMPTIONS_REGISTRY",
    "COVER_PAGE", "TABLE_OF_CONTENTS", "CUSTOM_NARRATIVE",
}

_VALID_SECTION_STATUSES = {"INCLUDED", "EXCLUDED", "DRAFT"}

_VALID_CATEGORIES = {
    "EXECUTIVE_BOARD", "TREASURY_FX", "RISK_COMMITTEE", "POLICY_PACK",
    "EXECUTION_PACK", "SCENARIO_STRESS", "EXPOSURE_DECOMP",
    "DATA_QUALITY", "CONNECTOR_HEALTH", "COMPLIANCE_AUDIT",
    "MULTI_CURRENCY",
}

_VALID_AUDIENCES = {
    "BOARD", "CFO", "TREASURER", "RISK_COMMITTEE",
    "AUDIT", "TRADER", "ANALYST", "REGULATOR",
}

MAX_SECTIONS = 40
MAX_NAME_LEN = 255
MAX_SHORT_NAME_LEN = 64


class CustomReportTemplateError(ValueError):
    """Raised when template input fails validation."""


# ── Validation ──────────────────────────────────────────────────────

def validate_section(section: Any, idx: int) -> dict[str, Any]:
    """Validate a single section spec; return the canonicalised dict."""
    if not isinstance(section, dict):
        raise CustomReportTemplateError(
            f"section[{idx}] must be an object"
        )
    section_type = section.get("type")
    if section_type not in _VALID_SECTION_TYPES:
        raise CustomReportTemplateError(
            f"section[{idx}] type {section_type!r} is not a valid SectionType"
        )
    title = section.get("title")
    if not isinstance(title, str) or not title.strip():
        raise CustomReportTemplateError(
            f"section[{idx}] title must be a non-empty string"
        )
    order = section.get("order")
    if not isinstance(order, int) or order < 0:
        raise CustomReportTemplateError(
            f"section[{idx}] order must be a non-negative integer"
        )
    status = section.get("status", "INCLUDED")
    if status not in _VALID_SECTION_STATUSES:
        raise CustomReportTemplateError(
            f"section[{idx}] status {status!r} not in {_VALID_SECTION_STATUSES}"
        )
    page_break = bool(section.get("page_break_before", False))
    return {
        "type": section_type,
        "title": title.strip()[:200],
        "order": order,
        "status": status,
        "page_break_before": page_break,
    }


def validate_sections(sections: Any) -> list[dict[str, Any]]:
    """Validate the full sections list. Return canonicalised list."""
    if not isinstance(sections, list) or not sections:
        raise CustomReportTemplateError("sections must be a non-empty list")
    if len(sections) > MAX_SECTIONS:
        raise CustomReportTemplateError(
            f"sections list exceeds max length {MAX_SECTIONS}"
        )
    return [validate_section(s, i) for i, s in enumerate(sections)]


def validate_audience(audience: Any) -> list[str]:
    if audience is None:
        return []
    if not isinstance(audience, list):
        raise CustomReportTemplateError("audience must be a list")
    out: list[str] = []
    for a in audience:
        if a not in _VALID_AUDIENCES:
            raise CustomReportTemplateError(
                f"audience value {a!r} not in {_VALID_AUDIENCES}"
            )
        out.append(a)
    return out


def validate_category(category: Any) -> str:
    if category not in _VALID_CATEGORIES:
        raise CustomReportTemplateError(
            f"category {category!r} not in {_VALID_CATEGORIES}"
        )
    return category


def _validate_name(name: Any) -> str:
    if not isinstance(name, str) or not name.strip():
        raise CustomReportTemplateError("name must be a non-empty string")
    if len(name) > MAX_NAME_LEN:
        raise CustomReportTemplateError(f"name exceeds {MAX_NAME_LEN} chars")
    return name.strip()


def _validate_short_name(short_name: Any) -> str:
    if not isinstance(short_name, str) or not short_name.strip():
        raise CustomReportTemplateError("short_name must be a non-empty string")
    if len(short_name) > MAX_SHORT_NAME_LEN:
        raise CustomReportTemplateError(
            f"short_name exceeds {MAX_SHORT_NAME_LEN} chars"
        )
    return short_name.strip()


def _validate_tags(tags: Any) -> list[str]:
    if tags is None:
        return []
    if not isinstance(tags, list):
        raise CustomReportTemplateError("tags must be a list of strings")
    out: list[str] = []
    for t in tags:
        if not isinstance(t, str) or not t.strip():
            raise CustomReportTemplateError("each tag must be a non-empty string")
        out.append(t.strip()[:32])
    return out


def _validate_default_bindings(bindings: Any) -> dict[str, Any]:
    if bindings is None:
        return {}
    if not isinstance(bindings, dict):
        raise CustomReportTemplateError("default_bindings must be an object")
    return bindings


# ── CRUD ────────────────────────────────────────────────────────────

async def list_templates(
    session: AsyncSession,
    user: User,
    *,
    category: str | None = None,
    include_inactive: bool = False,
) -> list[CustomReportTemplate]:
    stmt = select(CustomReportTemplate).where(
        CustomReportTemplate.company_id == user.company_id,
    )
    if category is not None:
        stmt = stmt.where(CustomReportTemplate.category == category)
    if not include_inactive:
        stmt = stmt.where(CustomReportTemplate.is_active.is_(True))
    stmt = stmt.order_by(CustomReportTemplate.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_template(
    session: AsyncSession, user: User, template_id: UUID
) -> CustomReportTemplate | None:
    stmt = select(CustomReportTemplate).where(
        CustomReportTemplate.id == template_id,
        CustomReportTemplate.company_id == user.company_id,
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def create_template(
    session: AsyncSession,
    user: User,
    *,
    name: str,
    short_name: str,
    category: str,
    sections: list[dict[str, Any]],
    description: str | None = None,
    audience: list[str] | None = None,
    default_bindings: dict[str, Any] | None = None,
    tags: list[str] | None = None,
) -> CustomReportTemplate:
    name_v = _validate_name(name)
    short_v = _validate_short_name(short_name)
    cat_v = validate_category(category)
    sections_v = validate_sections(sections)
    audience_v = validate_audience(audience)
    bindings_v = _validate_default_bindings(default_bindings)
    tags_v = _validate_tags(tags)

    template = CustomReportTemplate(
        company_id=user.company_id,
        user_id=user.id,
        name=name_v,
        short_name=short_v,
        description=(description or None),
        category=cat_v,
        audience=audience_v,
        sections=sections_v,
        default_bindings=bindings_v,
        tags=tags_v,
        is_active=True,
    )
    session.add(template)
    await session.flush()
    await session.commit()
    await session.refresh(template)
    return template


async def update_template(
    session: AsyncSession,
    user: User,
    template_id: UUID,
    *,
    name: str | None = None,
    description: str | None = None,
    category: str | None = None,
    sections: list[dict[str, Any]] | None = None,
    audience: list[str] | None = None,
    default_bindings: dict[str, Any] | None = None,
    tags: list[str] | None = None,
    is_active: bool | None = None,
) -> CustomReportTemplate:
    template = await get_template(session, user, template_id)
    if template is None:
        raise CustomReportTemplateError("template not found")

    if name is not None:
        template.name = _validate_name(name)
    if description is not None:
        template.description = description or None
    if category is not None:
        template.category = validate_category(category)
    if sections is not None:
        template.sections = validate_sections(sections)
    if audience is not None:
        template.audience = validate_audience(audience)
    if default_bindings is not None:
        template.default_bindings = _validate_default_bindings(default_bindings)
    if tags is not None:
        template.tags = _validate_tags(tags)
    if is_active is not None:
        template.is_active = bool(is_active)

    template.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(template)
    return template


async def delete_template(
    session: AsyncSession, user: User, template_id: UUID
) -> None:
    """Soft delete — sets is_active=False; preserves history."""
    template = await get_template(session, user, template_id)
    if template is None:
        raise CustomReportTemplateError("template not found")
    template.is_active = False
    template.updated_at = datetime.now(UTC)
    await session.commit()
