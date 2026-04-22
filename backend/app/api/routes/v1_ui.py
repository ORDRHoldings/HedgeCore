"""
v1_ui.py — UI-specific endpoints: onboarding summary + user UI preferences.
Tenant-safe, RBAC-gated, deterministic.
"""
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import get_current_user
from app.models.calculation_run import CalculationRun
from app.models.execution_proposal import ExecutionProposal
from app.models.policy import PolicyInstance
from app.models.position import Position
from app.models.user import User

router = APIRouter(prefix="/v1/ui", tags=["ui"])

# ---------------------------------------------------------------------------
# Validation constants (appearance)
# ---------------------------------------------------------------------------

VALID_THEME_IDS = {"ordr-default", "institutional-obsidian", "algorithmic-slate", "executive-clarity", "midnight-terminal", "arctic-frost", "warm-carbon"}
VALID_MODES = {"system", "dark", "light"}
VALID_ACCENTS = {"ruddy-blue", "violet", "emerald", "amber", "coral", "teal", "rose", "indigo"}
VALID_DENSITIES = {"compact", "standard", "spacious"}

# ---------------------------------------------------------------------------
# Response / Request schemas
# ---------------------------------------------------------------------------

class OnboardingSummaryResponse(BaseModel):
    exposures_open_count: int
    policy_assigned: bool
    policy_id: str | None
    last_run_id: str | None
    last_run_at: str | None
    pending_proposals_count: int
    pending_approvals_count: int
    net_notional_base: str | None
    net_notional_amount: float | None
    last_run_estimated_cost: float | None
    risk_gate_status: str  # "online" | "offline" | "unknown"
class UiPrefsResponse(BaseModel):
    show_quickstart: bool
    quickstart_dismissed_at: str | None
class UiPrefsUpdate(BaseModel):
    show_quickstart: bool | None = None


class AppearancePrefs(BaseModel):
    """PATCH body for appearance settings — all fields optional."""
    theme_id: str | None = None
    mode_override: str | None = None
    accent_id: str | None = None
    density: str | None = None
    ui_font: str | None = None
    numeric_font: str | None = None
    base_font_size: int | None = Field(None, ge=12, le=16)
    tabular_numerals: bool | None = None
    reduced_motion: bool | None = None
    high_contrast: bool | None = None
    color_plus_icon: bool | None = None
    template_id: str | None = None


class AppearancePrefsResponse(BaseModel):
    """Full appearance prefs with defaults filled."""
    theme_id: str = "institutional-obsidian"
    mode_override: str = "system"
    accent_id: str = "ruddy-blue"
    density: str = "standard"
    ui_font: str = "IBM Plex Sans"
    numeric_font: str = "IBM Plex Mono"
    base_font_size: int = 14
    tabular_numerals: bool = True
    reduced_motion: bool = False
    high_contrast: bool = False
    color_plus_icon: bool = False
    template_id: str | None = None

# ---------------------------------------------------------------------------
# Exported pure helpers (testable without DB)
# ---------------------------------------------------------------------------

def build_safe_summary_defaults() -> dict:
    return {
        "exposures_open_count": 0,
        "policy_assigned": False,
        "policy_id": None,
        "last_run_id": None,
        "last_run_at": None,
        "pending_proposals_count": 0,
        "pending_approvals_count": 0,
        "net_notional_base": None,
        "net_notional_amount": None,
        "last_run_estimated_cost": None,
        "risk_gate_status": "unknown",
    }
def get_show_quickstart_from_prefs(prefs: dict | None) -> bool:
    if not prefs:
        return True
    return bool(prefs.get("show_quickstart", True))
def apply_prefs_update(existing: dict, *, show_quickstart: bool | None = None) -> dict:
    prefs = dict(existing)
    if show_quickstart is not None:
        prefs["show_quickstart"] = show_quickstart
        if not show_quickstart:
            prefs["quickstart_dismissed_at"] = datetime.now(UTC).isoformat()
    return prefs


_APPEARANCE_KEYS = {
    "theme_id", "mode_override", "accent_id", "density",
    "ui_font", "numeric_font", "base_font_size",
    "tabular_numerals", "reduced_motion", "high_contrast",
    "color_plus_icon", "template_id",
}

_ENUM_VALIDATORS: dict[str, set[str]] = {
    "theme_id": VALID_THEME_IDS,
    "mode_override": VALID_MODES,
    "accent_id": VALID_ACCENTS,
    "density": VALID_DENSITIES,
}


def get_appearance_defaults() -> dict:
    """Returns the canonical default appearance dict."""
    return {
        "theme_id": "institutional-obsidian",
        "mode_override": "system",
        "accent_id": "ruddy-blue",
        "density": "standard",
        "ui_font": "IBM Plex Sans",
        "numeric_font": "IBM Plex Mono",
        "base_font_size": 14,
        "tabular_numerals": True,
        "reduced_motion": False,
        "high_contrast": False,
        "color_plus_icon": False,
        "template_id": None,
    }


def get_appearance_from_prefs(prefs: dict | None) -> dict:
    """Extract appearance sub-dict from user prefs, filling defaults."""
    defaults = get_appearance_defaults()
    if not prefs:
        return defaults
    stored = prefs.get("appearance")
    if not stored or not isinstance(stored, dict):
        return defaults
    # Merge only known keys
    result = dict(defaults)
    for key in _APPEARANCE_KEYS:
        if key in stored and stored[key] is not None:
            result[key] = stored[key]
    return result


def apply_appearance_update(existing: dict, updates: dict) -> dict:
    """Merge validated updates into existing appearance dict. Pure function."""
    result = dict(existing)
    for key, value in updates.items():
        if key not in _APPEARANCE_KEYS:
            continue
        if value is None:
            continue
        # Enum validation — reject invalid values silently
        if key in _ENUM_VALIDATORS:
            if value not in _ENUM_VALIDATORS[key]:
                continue
        # Font size clamping
        if key == "base_font_size":
            value = max(12, min(16, int(value)))
        result[key] = value
    return result

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/onboarding-summary", response_model=OnboardingSummaryResponse)
async def get_onboarding_summary(
    request: Request,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> OnboardingSummaryResponse:
    """
    Returns a tenant-scoped snapshot of system readiness for the Quick Start Window.
    All queries are wrapped in try/except; failures return safe zero defaults.
    """
    data = build_safe_summary_defaults()

    company_id = current_user.company_id

    # 1. exposures_open_count
    try:
        open_statuses = ("NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE")
        q = (
            select(func.count())
            .select_from(Position)
            .where(
                Position.company_id == company_id,
                Position.is_active == True,  # noqa: E712
                Position.execution_status.in_(open_statuses),
            )
        )
        result = await db.execute(q)
        data["exposures_open_count"] = result.scalar() or 0
    except Exception:
        pass

    # 2+3. policy_assigned + policy_id
    try:
        q = (
            select(PolicyInstance)
            .where(
                PolicyInstance.company_id == company_id,
                PolicyInstance.is_active == True,  # noqa: E712
            )
            .order_by(PolicyInstance.activated_at.desc())
            .limit(1)
        )
        result = await db.execute(q)
        instance = result.scalars().first()
        if instance:
            data["policy_assigned"] = True
            data["policy_id"] = str(instance.id)
    except Exception:
        pass

    # 4+5. last_run_id + last_run_at
    try:
        q = (
            select(CalculationRun)
            .where(CalculationRun.company_id == company_id)
            .order_by(CalculationRun.created_at.desc())
            .limit(1)
        )
        result = await db.execute(q)
        run = result.scalars().first()
        if run:
            data["last_run_id"] = str(run.id)
            data["last_run_at"] = run.created_at.isoformat() if run.created_at else None
    except Exception:
        pass

    # 6. pending_proposals_count (status = PROPOSED)
    try:
        q = (
            select(func.count())
            .select_from(ExecutionProposal)
            .where(
                ExecutionProposal.company_id == company_id,
                ExecutionProposal.status == "PROPOSED",
            )
        )
        result = await db.execute(q)
        data["pending_proposals_count"] = result.scalar() or 0
    except Exception:
        pass

    # 7. pending_approvals_count (status = APPROVED — awaiting execute)
    try:
        q = (
            select(func.count())
            .select_from(ExecutionProposal)
            .where(
                ExecutionProposal.company_id == company_id,
                ExecutionProposal.status == "APPROVED",
            )
        )
        result = await db.execute(q)
        data["pending_approvals_count"] = result.scalar() or 0
    except Exception:
        pass

    # 8. net_notional_base + net_notional_amount (open positions, USD)
    try:
        open_statuses = ("NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE")
        q = (
            select(func.sum(Position.amount))
            .where(
                Position.company_id == company_id,
                Position.is_active == True,  # noqa: E712
                Position.execution_status.in_(open_statuses),
                Position.currency == "USD",
            )
        )
        result = await db.execute(q)
        total = result.scalar()
        if total is not None:
            data["net_notional_base"] = "USD"
            data["net_notional_amount"] = float(total)
    except Exception:
        pass

    # 9. last_run_estimated_cost: None (complex calc, v1 deferred)
    # 10. risk_gate_status: "unknown" (no live health check in v1)

    # Non-blocking audit event
    try:
        from app.models.audit_event import GENESIS_HASH, AuditEvent, build_audit_event

        _prev_q = (
            select(AuditEvent.event_hash)
            .where(AuditEvent.company_id == company_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(1)
        )
        _prev_result = await db.execute(_prev_q)
        _prev_hash = _prev_result.scalars().first() or GENESIS_HASH

        _evt = build_audit_event(
            event_type="SYSTEM",
            description="UI: onboarding summary fetched",
            payload={},
            prev_event_hash=_prev_hash,
            company_id=company_id,
            branch_id=current_user.branch_id,
            actor_id=current_user.id,
            actor_email=current_user.email,
            entity_type="ui_summary",
            entity_id=None,
        )
        db.add(_evt)
        await db.commit()
    except Exception:
        pass

    return OnboardingSummaryResponse(**data)
@router.get("/prefs", response_model=UiPrefsResponse)
async def get_ui_prefs(
    current_user: User = Depends(get_current_user),
) -> UiPrefsResponse:
    """Returns current user's UI preferences with safe defaults."""
    prefs = current_user.ui_preferences or {}
    return UiPrefsResponse(
        show_quickstart=get_show_quickstart_from_prefs(prefs),
        quickstart_dismissed_at=prefs.get("quickstart_dismissed_at"),
    )
@router.patch("/prefs", response_model=UiPrefsResponse)
async def patch_ui_prefs(
    body: UiPrefsUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> UiPrefsResponse:
    """Merges UI preference updates into the user row's JSONB field."""
    existing = dict(current_user.ui_preferences or {})
    updated = apply_prefs_update(existing, show_quickstart=body.show_quickstart)
    current_user.ui_preferences = updated
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    prefs = current_user.ui_preferences or {}
    return UiPrefsResponse(
        show_quickstart=get_show_quickstart_from_prefs(prefs),
        quickstart_dismissed_at=prefs.get("quickstart_dismissed_at"),
    )


@router.get("/appearance", response_model=AppearancePrefsResponse)
async def get_appearance(
    current_user: User = Depends(get_current_user),
) -> AppearancePrefsResponse:
    """Returns current user's appearance preferences with safe defaults."""
    prefs = current_user.ui_preferences or {}
    appearance = get_appearance_from_prefs(prefs)
    return AppearancePrefsResponse(**appearance)


@router.patch("/appearance", response_model=AppearancePrefsResponse)
async def patch_appearance(
    body: AppearancePrefs,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> AppearancePrefsResponse:
    """Merges appearance preference updates into user.ui_preferences['appearance']."""
    all_prefs = dict(current_user.ui_preferences or {})
    existing_appearance = get_appearance_from_prefs(all_prefs)
    updates = body.model_dump(exclude_none=True)
    updated_appearance = apply_appearance_update(existing_appearance, updates)
    all_prefs["appearance"] = updated_appearance
    current_user.ui_preferences = all_prefs
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    final = get_appearance_from_prefs(current_user.ui_preferences or {})
    return AppearancePrefsResponse(**final)
