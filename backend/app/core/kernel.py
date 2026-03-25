"""Synex Kernel integration — governance layer for TreasuryFX.

TreasuryFX already has its own WORM audit chain (audit_events, calculation_runs,
ledger_entries) with SHA-256 hashing and PostgreSQL triggers. That chain stays.

The kernel chain runs alongside for Synexiun-level governance:
- Identity verification (Ed25519 certificates)
- Kill switch reception
- Policy epoch tracking
- Budget tracking
- Upward diode reporting to Core

Two chains, two purposes:
- TreasuryFX chain: domain-level audit (trades, calculations, positions)
- Kernel chain: governance-level audit (identity, policy, budget, health)

Diode: HeartbeatEmitter sends periodic HealthBeacons to synex-core via
the upward channel (/diode/upward). Core URL configured via SYNEX_CORE_URL.
"""

import logging
import os
import time

from sqlalchemy.orm import Session

from synex_kernel.audit.chain import (
    append_event,
    create_genesis,
    get_chain_length,
    get_latest_hash,
    verify_chain,
)
from synex_kernel.audit.models import Base as KernelBase
from synex_kernel.audit.triggers import install_worm_triggers
from synex_kernel.db.session import get_engine, get_session_factory
from synex_kernel.exceptions import KillSwitchActivatedError
from synex_kernel.health.budget import BudgetTracker
from synex_kernel.health.heartbeat import HeartbeatEmitter
from synex_kernel.health.kill_switch import KillSwitchReceiver
from synex_kernel.health.status import HealthReport, HealthStatus
from synex_kernel.identity.verifier import CertificateRevocation
from synex_kernel.middleware.governance import GovernanceContext

logger = logging.getLogger("hedgecalc.kernel")

_engine = None
_session_factory = None
_initialized = False
_heartbeat: HeartbeatEmitter | None = None
_governance: GovernanceContext | None = None
_start_time: float = 0.0

LIMB_ID = "synexfund-treasuryfx"


def _get_sync_db_url() -> str:
    """Get sync DB URL for kernel engine."""
    url = os.environ.get(
        "SYNEX_KERNEL_DB_URL",
        os.environ.get("DATABASE_URL", "sqlite:///treasuryfx_kernel.db"),
    )
    # Convert async driver URLs to sync
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    url = url.replace("sqlite+aiosqlite://", "sqlite://")
    return url


def init_kernel() -> None:
    """Initialize the kernel governance layer."""
    global _engine, _session_factory, _initialized, _governance

    if _initialized:
        return

    try:
        db_url = _get_sync_db_url()
        _engine = get_engine(db_url)

        KernelBase.metadata.create_all(_engine)
        CertificateRevocation.metadata.create_all(_engine)
        install_worm_triggers(_engine)

        _session_factory = get_session_factory(_engine)

        session = _session_factory()
        try:
            create_genesis(session)
            append_event(
                session,
                "limb_initialized",
                {
                    "limb_id": LIMB_ID,
                    "service": "treasuryfx-api",
                    "existing_chain": "audit_events (preserved)",
                },
                limb_id=LIMB_ID,
            )
            session.commit()
        finally:
            session.close()

        # Build bootstrap policy enforcer
        enforcer = None
        try:
            from .policy_rules import build_bootstrap_enforcer
            enforcer = build_bootstrap_enforcer()
            if enforcer:
                logger.info("Bootstrap policy loaded: %d rules", enforcer.rule_count)
        except Exception as e:
            logger.debug("Policy enforcer not loaded: %s", e)

        # Initialize governance context (kill switch + budget + policy)
        _governance = GovernanceContext(
            limb_id=LIMB_ID,
            enforcer=enforcer,
            budget=BudgetTracker(epoch_budget=100_000),
            kill_switch=KillSwitchReceiver(LIMB_ID),
        )

        _initialized = True
        logger.info("Synex kernel initialized for %s", LIMB_ID)

    except Exception as e:
        logger.warning("Kernel initialization skipped: %s", e)


def get_kernel_session() -> Session | None:
    """Get a kernel DB session, or None if not initialized."""
    if _session_factory is None:
        return None
    return _session_factory()


def audit_governance_event(
    event_type: str,
    payload: dict,
) -> None:
    """Log a governance event to the kernel chain."""
    session = get_kernel_session()
    if session is None:
        return

    try:
        append_event(session, event_type, payload, limb_id=LIMB_ID)
        session.commit()
    except Exception as e:
        session.rollback()
        logger.debug("Kernel audit failed: %s", e)
    finally:
        session.close()


def get_governance() -> GovernanceContext | None:
    """Get the GovernanceContext, or None if not initialized."""
    return _governance


def governance_check(budget_cost: int = 0, match_sig: int | None = None) -> None:
    """Run all governance checks (kill switch → policy → budget).

    If match_sig is provided and an enforcer is loaded, the policy is checked
    and the rule's budget_cost is used (unless budget_cost is explicitly set).
    """
    if _governance is None:
        return
    _governance.check_all(match_sig=match_sig, budget_cost=budget_cost)


def kernel_health() -> dict:
    """Return kernel governance health status."""
    session = get_kernel_session()
    if session is None:
        return {"status": "not_initialized", "chain_length": 0}

    try:
        length = get_chain_length(session)
        valid, broken = verify_chain(session) if length > 0 else (True, None)
        latest = get_latest_hash(session)
        health = {
            "status": "alive" if valid else "degraded",
            "chain_length": length,
            "chain_valid": valid,
            "latest_hash": latest[:16] + "..." if latest else None,
            "limb_id": LIMB_ID,
        }
        if _governance:
            health["budget_remaining"] = _governance.budget.remaining
            health["budget_total"] = _governance.budget.total
            health["kill_switch"] = _governance.kill_switch.is_activated
        return health
    finally:
        session.close()


# ── Diode: Heartbeat to Core ──────────────────────────────────────────


def _get_core_url() -> str | None:
    """Get synex-core base URL from env. None disables the diode."""
    return os.environ.get("SYNEX_CORE_URL")


def _get_core_headers() -> dict[str, str]:
    """Build request headers for synex-core, including auth if configured."""
    headers = {"Content-Type": "application/json"}
    token = os.environ.get("SYNEX_CORE_ADMIN_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _collect_health() -> HealthReport:
    """Build a HealthReport from current kernel state."""
    budget_remaining = _governance.budget.remaining if _governance else 0
    budget_total = _governance.budget.total if _governance else 0

    session = get_kernel_session()
    if session is None:
        return HealthReport(
            limb_id=LIMB_ID,
            status=HealthStatus.DEGRADED,
            budget_remaining=budget_remaining,
            budget_total=budget_total,
            uptime_seconds=time.monotonic() - _start_time,
        )
    try:
        length = get_chain_length(session)
        valid, _ = verify_chain(session) if length > 0 else (True, None)
        return HealthReport(
            limb_id=LIMB_ID,
            status=HealthStatus.ALIVE if valid else HealthStatus.DEGRADED,
            budget_remaining=budget_remaining,
            budget_total=budget_total,
            uptime_seconds=time.monotonic() - _start_time,
        )
    except Exception:
        return HealthReport(
            limb_id=LIMB_ID,
            status=HealthStatus.DEGRADED,
            budget_remaining=budget_remaining,
            budget_total=budget_total,
            uptime_seconds=time.monotonic() - _start_time,
        )
    finally:
        session.close()


def _send_beacon(report: HealthReport) -> None:
    """POST a HealthBeacon to synex-core's upward diode."""
    core_url = _get_core_url()
    if not core_url:
        return

    import httpx

    payload = {
        "type": "health_beacon",
        "payload": {
            "limb_id": report.limb_id,
            "status": report.status.value,
            "budget_remaining": report.budget_remaining,
            "budget_total": report.budget_total,
            "epoch": report.epoch,
            "uptime_seconds": report.uptime_seconds,
            "timestamp": report.timestamp.isoformat(),
        },
    }
    try:
        resp = httpx.post(f"{core_url}/diode/upward", json=payload, headers=_get_core_headers(), timeout=5.0)
        if resp.status_code != 200:
            logger.debug("Core beacon rejected: %s", resp.status_code)
    except Exception as e:
        logger.debug("Core beacon send failed: %s", e)


async def start_heartbeat() -> None:
    """Start the HeartbeatEmitter (async). No-op if no Core URL configured."""
    global _heartbeat, _start_time

    if not _initialized:
        return

    if not _get_core_url():
        logger.debug("SYNEX_CORE_URL not set — heartbeat disabled")
        return

    _start_time = time.monotonic()
    _heartbeat = HeartbeatEmitter(
        limb_id=LIMB_ID,
        collect_fn=_collect_health,
        send_fn=_send_beacon,
    )
    await _heartbeat.start()
    logger.info("Heartbeat emitter started → %s", _get_core_url())


async def stop_heartbeat() -> None:
    """Stop the HeartbeatEmitter."""
    global _heartbeat
    if _heartbeat:
        await _heartbeat.stop()
        _heartbeat = None
        logger.info("Heartbeat emitter stopped")
