"""
seed_demo.py — Three-persona demo seeder for ORDR TreasuryFX.

Creates realistic-but-synthetic demo tenants used in prospect calls. Each
persona has a distinct profile (mid-market manufacturer, SaaS scale-up,
multinational enterprise) and ships with:

  * 1 company + 1 branch + 1 department
  * 4 user accounts (treasurer, approver, auditor, admin) — all real DB rows
  * 6 months of historical positions in 5 currencies
  * A handful of completed hedges (HEDGED status, with hedge_rate)
  * 1 pending ExecutionProposal awaiting approval — for the maker/checker demo
  * 6 months of WORM audit_events (INGEST → POLICY → CALCULATE → LIFECYCLE → EXECUTION)
  * Hash chain validated end-to-end, head hash printed

Personas:
  acme       Acme Manufacturing  — $400M FX/yr, USD base, EUR/CNY/MXN/JPY/GBP exposure
  northbeam  Northbeam SaaS      — $80M FX/yr,  USD base, EUR/GBP/CAD/AUD/SGD exposure
  meridian   Meridian Industries — $1.8B FX/yr, USD base, EUR/JPY/GBP/CHF/BRL exposure

Usage (from backend/):
    python scripts/seed_demo.py --persona acme --reset
    python scripts/seed_demo.py --persona northbeam --reset
    python scripts/seed_demo.py --persona meridian --reset

Add --no-reset to additively top up without dropping existing data.

Environment:
    DATABASE_URL      Required. postgresql+asyncpg://... (or sqlite+aiosqlite://)
    DEMO_PASSWORD     Optional. Defaults to "demo" if unset.

Idempotency:
    --reset wipes only the persona's company_id rows. Other tenants untouched.

Hash chain:
    Every event_hash chains to prev_event_hash via SHA-256. Head hash printed
    at end of run; record it before every prospect call.
"""
from __future__ import annotations

import argparse
import asyncio
import importlib
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

# Resolve backend/ as the import root regardless of where the script is run from
_BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND_DIR))

# Import all ORM models so create_all sees the full metadata graph
for _f in (_BACKEND_DIR / "app" / "models").glob("*.py"):
    if _f.name not in {"__init__.py"}:
        importlib.import_module(f"app.models.{_f.stem}")

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base
from app.core.security import hash_password
from app.models.audit_event import (
    GENESIS_HASH,
    AuditEvent,
    build_audit_event,
    compute_event_hash,
)
from app.models.execution_proposal import ExecutionProposal
from app.models.organization import Branch, Company, Department
from app.models.position import Position
from app.models.rbac import Role, UserRole
from app.models.user import User

UTC = timezone.utc

# ── Persona configuration ────────────────────────────────────────────────────
# Each persona is fully deterministic: fixed UUIDs let --reset re-run cleanly.

PERSONAS: dict[str, dict] = {
    "acme": {
        "company_id":  uuid.UUID("aaaaaaaa-1111-1111-1111-111111111111"),
        "branch_id":   uuid.UUID("aaaaaaaa-1111-1111-1111-222222222222"),
        "dept_id":     uuid.UUID("aaaaaaaa-1111-1111-1111-333333333333"),
        "name":        "Acme Manufacturing Inc.",
        "slug":        "demo-acme",
        "domain":      "acme.demo",
        "branch_name": "Headquarters — Detroit",
        "branch_code": "DET",
        "region":      "North America",
        "tz":          "America/Detroit",
        "annual_fx":   Decimal("400000000"),
        "currencies":  [("EUR", 0.40), ("CNY", 0.25), ("MXN", 0.15), ("JPY", 0.12), ("GBP", 0.08)],
        "rates":       {"EUR": 1.085, "CNY": 0.139, "MXN": 0.058, "JPY": 0.0067, "GBP": 1.272},
        "plan_tier":   "professional",
        "policy_method": "critical_terms_match",
    },
    "northbeam": {
        "company_id":  uuid.UUID("bbbbbbbb-2222-2222-2222-111111111111"),
        "branch_id":   uuid.UUID("bbbbbbbb-2222-2222-2222-222222222222"),
        "dept_id":     uuid.UUID("bbbbbbbb-2222-2222-2222-333333333333"),
        "name":        "Northbeam SaaS Ltd.",
        "slug":        "demo-northbeam",
        "domain":      "northbeam.demo",
        "branch_name": "HQ — San Francisco",
        "branch_code": "SFO",
        "region":      "North America",
        "tz":          "America/Los_Angeles",
        "annual_fx":   Decimal("80000000"),
        "currencies":  [("EUR", 0.35), ("GBP", 0.25), ("CAD", 0.18), ("AUD", 0.12), ("SGD", 0.10)],
        "rates":       {"EUR": 1.085, "GBP": 1.272, "CAD": 0.736, "AUD": 0.661, "SGD": 0.748},
        "plan_tier":   "starter",
        "policy_method": "critical_terms_match",
    },
    "meridian": {
        "company_id":  uuid.UUID("cccccccc-3333-3333-3333-111111111111"),
        "branch_id":   uuid.UUID("cccccccc-3333-3333-3333-222222222222"),
        "dept_id":     uuid.UUID("cccccccc-3333-3333-3333-333333333333"),
        "name":        "Meridian Industries plc",
        "slug":        "demo-meridian",
        "domain":      "meridian.demo",
        "branch_name": "Group Treasury — London",
        "branch_code": "LDN",
        "region":      "EMEA",
        "tz":          "Europe/London",
        "annual_fx":   Decimal("1800000000"),
        "currencies":  [("EUR", 0.32), ("JPY", 0.22), ("GBP", 0.20), ("CHF", 0.14), ("BRL", 0.12)],
        "rates":       {"EUR": 1.085, "JPY": 0.0067, "GBP": 1.272, "CHF": 1.142, "BRL": 0.197},
        "plan_tier":   "enterprise",
        "policy_method": "regression",
    },
}

DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "demo")


def db_url() -> str:
    raw = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./demo.db")
    if raw.startswith("postgres://"):
        raw = raw.replace("postgres://", "postgresql+asyncpg://", 1)
    if raw.startswith("postgresql://"):
        raw = raw.replace("postgresql://", "postgresql+asyncpg://", 1)
    return raw


# ── Persona user accounts ────────────────────────────────────────────────────
# Roles must already exist in the DB (created by seed_company.py).

def persona_users(persona: str, p: dict) -> list[tuple]:
    """Return [(email, password, full_name, role_name)] for the persona."""
    return [
        (f"treasurer@{persona}.demo", DEMO_PASSWORD, "Demo Treasurer",   "senior_analyst"),
        (f"approver@{persona}.demo",  DEMO_PASSWORD, "Demo Approver",    "supervisor"),
        (f"auditor@{persona}.demo",   DEMO_PASSWORD, "Demo Auditor",     "auditor"),
        (f"admin@{persona}.demo",     DEMO_PASSWORD, "Demo Admin",       "admin"),
    ]


# ── Wipe existing persona data ───────────────────────────────────────────────

async def wipe_persona(session: AsyncSession, p: dict) -> None:
    """Drop persona's positions, proposals, audit events. Keep users + company shell."""
    cid = p["company_id"]
    await session.execute(delete(ExecutionProposal).where(ExecutionProposal.company_id == cid))
    await session.execute(delete(AuditEvent).where(AuditEvent.company_id == cid))
    await session.execute(delete(Position).where(Position.company_id == cid))
    await session.flush()


# ── Org structure ────────────────────────────────────────────────────────────

async def upsert_org(session: AsyncSession, p: dict) -> None:
    co = (await session.execute(select(Company).where(Company.id == p["company_id"]))).scalars().first()
    if not co:
        session.add(Company(
            id=p["company_id"], name=p["name"], slug=p["slug"], domain=p["domain"],
            settings={
                "default_currency": "USD",
                "plan_tier": p["plan_tier"],
                "demo_tenant": True,
                "policy_method": p["policy_method"],
            },
        ))

    br = (await session.execute(select(Branch).where(Branch.id == p["branch_id"]))).scalars().first()
    if not br:
        session.add(Branch(
            id=p["branch_id"], company_id=p["company_id"],
            name=p["branch_name"], code=p["branch_code"],
            region=p["region"], timezone=p["tz"],
        ))

    dp = (await session.execute(select(Department).where(Department.id == p["dept_id"]))).scalars().first()
    if not dp:
        session.add(Department(
            id=p["dept_id"], branch_id=p["branch_id"],
            name="Treasury Desk", code="TRE",
        ))
    await session.flush()


async def upsert_users(session: AsyncSession, persona: str, p: dict) -> dict[str, User]:
    """Create demo accounts; return {role_name: User}."""
    out: dict[str, User] = {}
    for email, password, full_name, role_name in persona_users(persona, p):
        user = (await session.execute(select(User).where(User.email == email))).scalars().first()
        if not user:
            user = User(
                id=uuid.uuid4(),
                email=email,
                full_name=full_name,
                hashed_password=hash_password(password, _skip_length_check=True),
                company_id=p["company_id"],
                branch_id=p["branch_id"],
                department_id=p["dept_id"],
                is_active=True,
            )
            session.add(user)
            await session.flush()

        # Bind role through UserRole join table (idempotent)
        role = (await session.execute(select(Role).where(Role.name == role_name))).scalars().first()
        if role:
            link = (await session.execute(
                select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id)
            )).scalars().first()
            if not link:
                session.add(UserRole(user_id=user.id, role_id=role.id))
        out[role_name] = user
    await session.flush()
    return out


# ── Position generation ──────────────────────────────────────────────────────

def _split_amount(total: Decimal, weights: list[float]) -> list[Decimal]:
    """Distribute `total` across weights, rounding to 2dp."""
    parts = [Decimal(str(round(float(total) * w, 2))) for w in weights]
    drift = total - sum(parts)
    parts[0] += drift
    return parts


def _exposures_for_month(p: dict, month_offset: int, rng: random.Random) -> list[dict]:
    """One month of exposures: 6-12 positions across the persona's currency mix."""
    today = datetime.now(UTC).date()
    month_start = (today.replace(day=1) - timedelta(days=30 * month_offset))
    monthly_total = p["annual_fx"] / Decimal("12") * Decimal(str(rng.uniform(0.85, 1.15)))

    weights = [w for _, w in p["currencies"]]
    monthly_per_ccy = _split_amount(monthly_total, weights)

    positions: list[dict] = []
    for (ccy, _w), ccy_total in zip(p["currencies"], monthly_per_ccy):
        # 1-3 positions per currency per month
        n_pos = rng.randint(1, 3)
        sub_weights = [rng.uniform(0.3, 1.0) for _ in range(n_pos)]
        sub_sum = sum(sub_weights)
        sub_weights = [w / sub_sum for w in sub_weights]
        sub_amounts = _split_amount(ccy_total, sub_weights)

        for i, amt in enumerate(sub_amounts, start=1):
            value_date = month_start + timedelta(days=rng.randint(0, 27))
            flow = "AR" if rng.random() > 0.4 else "AP"
            entity = rng.choice([
                "Subsidiary A — Sales", "Subsidiary B — Procurement",
                "Group HQ", "Sales Office EU", "Manufacturing JP",
            ])
            positions.append({
                "record_id": f"DEMO-{month_offset:02d}-{ccy}-{i}-{rng.randint(1000, 9999)}",
                "entity":    entity,
                "flow_type": flow,
                "currency":  ccy,
                "amount":    amt.quantize(Decimal("0.01")),
                "value_date": value_date.isoformat(),
                "month_offset": month_offset,
            })
    return positions


async def seed_positions_and_events(
    session: AsyncSession,
    persona: str,
    p: dict,
    users: dict[str, User],
) -> tuple[int, int, str, Position]:
    """
    Create 6 months of positions + audit events with a tamper-evident hash chain.

    Returns: (n_positions, n_events, head_hash, pending_position)
    """
    rng = random.Random(f"{persona}-2026-04-25")  # deterministic
    treasurer = users["senior_analyst"]
    approver  = users["supervisor"]

    prev_hash = GENESIS_HASH
    n_events  = 0
    n_positions = 0

    # Monotonically increasing timestamp anchor — each event gets a unique
    # created_at so the chain can be walked deterministically by created_at
    # ordering on read-back (works on both SQLite and Postgres).
    ts_anchor = datetime.now(UTC) - timedelta(days=180)
    ts_step = timedelta(milliseconds=1)

    def _add_event(**kwargs) -> AuditEvent:
        nonlocal prev_hash, n_events, ts_anchor
        ts_anchor = ts_anchor + ts_step
        evt = build_audit_event(prev_event_hash=prev_hash, **kwargs)
        evt.created_at = ts_anchor  # override the in-builder NOW
        # Re-hash with the explicit timestamp so event_hash matches what's stored
        from app.models.audit_event import compute_event_hash as _hash
        evt.event_hash = _hash(
            event_type=evt.event_type,
            actor_id=str(evt.actor_id) if evt.actor_id else None,
            entity_id=str(evt.entity_id) if evt.entity_id else None,
            payload=evt.payload,
            created_at=ts_anchor,
            prev_hash=prev_hash,
        )
        session.add(evt)
        prev_hash = evt.event_hash
        n_events += 1
        return evt

    # System startup event — anchors the chain
    _add_event(
        event_type="SYSTEM",
        description=f"Demo tenant {persona} initialized",
        payload={"persona": persona, "tenant": p["slug"], "seeded_at": ts_anchor.isoformat()},
        company_id=p["company_id"],
        branch_id=p["branch_id"],
        actor_email="system@ordrtreasuryfx.com",
        actor_role="system",
    )

    pending_position: Position | None = None

    # 6 months of history, oldest first
    for month_offset in range(5, -1, -1):
        for pos_data in _exposures_for_month(p, month_offset, rng):
            now_utc = datetime.now(UTC)
            pos = Position(
                id=uuid.uuid4(),
                company_id=p["company_id"],
                branch_id=p["branch_id"],
                created_by=treasurer.id,
                record_id=pos_data["record_id"],
                entity=pos_data["entity"],
                flow_type=pos_data["flow_type"],
                currency=pos_data["currency"],
                amount=pos_data["amount"],
                value_date=pos_data["value_date"],
                status="CONFIRMED",
                description=f"Demo exposure -- {persona}",
                execution_status="NEW",
                is_active=True,
                created_at=now_utc,
                updated_at=now_utc,
            )

            # Older positions get fully hedged; the most-recent month gets one pending.
            is_recent = month_offset == 0
            should_hedge = (not is_recent) or (rng.random() > 0.4)

            if should_hedge:
                # Move through full lifecycle: NEW → POLICY_ASSIGNED → READY_TO_EXECUTE → HEDGED
                pos.execution_status = "HEDGED"
                rate = p["rates"].get(pos.currency, 1.0)
                # Add small slippage so quotes look realistic
                pos.hedge_rate = Decimal(str(round(rate * rng.uniform(0.998, 1.002), 6)))
                pos.hedge_amount = pos.amount
                pos.executed_at = datetime.now(UTC) - timedelta(days=30 * month_offset + rng.randint(0, 5))
                pos.execution_ref = f"FWD-{rng.randint(100000, 999999)}"

            session.add(pos)
            n_positions += 1

            # Capture one recent unhedged position as our "pending proposal" candidate
            if is_recent and pos.execution_status == "NEW" and pending_position is None:
                pending_position = pos

            # Emit audit events for the position lifecycle
            for evt_type, descr, extra in _events_for_position(pos, treasurer, approver, p):
                _add_event(
                    event_type=evt_type,
                    description=descr,
                    payload=extra,
                    company_id=p["company_id"],
                    branch_id=p["branch_id"],
                    actor_id=treasurer.id if evt_type != "EXECUTION" else approver.id,
                    actor_email=treasurer.email if evt_type != "EXECUTION" else approver.email,
                    actor_role="senior_analyst" if evt_type != "EXECUTION" else "supervisor",
                    entity_type="position",
                    entity_id=str(pos.id),
                )

    await session.flush()
    return n_positions, n_events, prev_hash, pending_position  # type: ignore[return-value]


def _events_for_position(pos: Position, treasurer: User, approver: User, p: dict) -> list[tuple[str, str, dict]]:
    """Emit the audit-event sequence appropriate for the position's terminal state."""
    base = {
        "position_id": str(pos.id),
        "record_id":   pos.record_id,
        "currency":    pos.currency,
        "amount":      str(pos.amount),
        "flow_type":   pos.flow_type,
        "value_date":  pos.value_date,
    }
    events: list[tuple[str, str, dict]] = [
        ("INGEST",   f"Position {pos.record_id} imported", base),
    ]
    if pos.execution_status in {"POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED"}:
        events.append(("POLICY",    f"Policy assigned to {pos.record_id}", {**base, "policy_method": p["policy_method"]}))
        events.append(("CALCULATE", f"Engine produced hedge plan for {pos.record_id}",
                       {**base, "hedge_ratio": "1.00", "engine_version": "1.0.0"}))
    if pos.execution_status == "HEDGED":
        events.append(("LIFECYCLE", f"{pos.record_id} → READY_TO_EXECUTE",  {**base, "from": "POLICY_ASSIGNED", "to": "READY_TO_EXECUTE"}))
        events.append(("EXECUTION", f"{pos.record_id} executed by approver",
                       {**base, "hedge_rate": str(pos.hedge_rate), "execution_ref": pos.execution_ref,
                        "approver": approver.email}))
        events.append(("LIFECYCLE", f"{pos.record_id} → HEDGED",            {**base, "from": "READY_TO_EXECUTE", "to": "HEDGED"}))
    return events


# ── Pending proposal for maker/checker demo ──────────────────────────────────

async def seed_pending_proposal(
    session: AsyncSession,
    p: dict,
    pos: Position,
    users: dict[str, User],
) -> ExecutionProposal:
    """One PROPOSED proposal awaiting checker approval — drives the Tri-State demo."""
    treasurer = users["senior_analyst"]
    rate = p["rates"].get(pos.currency, 1.0)
    hedge_rate = Decimal(str(round(rate * 0.999, 6)))

    payload = {
        "execution_ref": f"FWD-PENDING-{random.randint(100000, 999999)}",
        "hedge_amount":  str(pos.amount),
        "hedge_rate":    str(hedge_rate),
        "instrument":    "FX_FORWARD",
        "settlement_date": pos.value_date,
        "notes":         "Awaiting maker/checker approval",
    }

    import hashlib, json as _json
    proposal_hash = hashlib.sha256(
        _json.dumps(payload, sort_keys=True).encode()
    ).hexdigest()

    now_utc = datetime.now(UTC)
    prop = ExecutionProposal(
        id=uuid.uuid4(),
        position_id=pos.id,
        company_id=p["company_id"],
        branch_id=p["branch_id"],
        status="PROPOSED",
        proposed_by=treasurer.id,
        proposed_by_email=treasurer.email,
        proposed_at=now_utc,
        proposal_payload=payload,
        proposal_hash=proposal_hash,
        created_at=now_utc,
        updated_at=now_utc,
    )
    session.add(prop)

    # Move the position into READY_TO_EXECUTE so the proposal is actionable
    pos.execution_status = "READY_TO_EXECUTE"
    pos.updated_at = now_utc  # required for SQLite (no NOW() function)
    await session.flush()
    return prop


# ── Main ─────────────────────────────────────────────────────────────────────

async def verify_chain(session: AsyncSession, p: dict) -> tuple[bool, int, str]:
    """Walk the persona's audit_events oldest->newest, validating prev_hash linkage.

    Returns (ok, n_events, head_hash). Raises on actual chain corruption
    (prev_hash mismatch or missing event_hash).

    NOTE: This validates *linkage* — that each row's prev_event_hash matches
    the previous row's event_hash, and that no event_hash is empty. It does
    NOT recompute hashes from canonicalized payload+timestamp, because
    datetime serialization differences (notably SQLite vs Postgres) can
    legitimately alter the canonical form on round-trip without indicating
    tampering. For full hash recomputation, use the production audit-pack
    verifier which runs in-DB before persistence.
    """
    rows = (await session.execute(
        select(AuditEvent)
        .where(AuditEvent.company_id == p["company_id"])
        .order_by(AuditEvent.created_at.asc(), AuditEvent.id.asc())
    )).scalars().all()

    prev = GENESIS_HASH
    for row in rows:
        if not row.event_hash:
            raise RuntimeError(f"Empty event_hash on event {row.id}")
        if row.prev_event_hash != prev:
            raise RuntimeError(
                f"Hash chain broken at event {row.id} "
                f"(expected_prev={prev}, stored_prev={row.prev_event_hash})"
            )
        prev = row.event_hash
    return True, len(rows), prev


async def run(persona: str, reset: bool) -> None:
    p = PERSONAS[persona]
    url = db_url()

    bar = "=" * 72
    print(f"\n{bar}")
    print(f"  ORDR DEMO SEED -- persona={persona}  ({p['name']})")
    print(f"  DB: {url[:60]}...")
    print(f"  Reset: {reset}")
    print(f"{bar}\n")

    engine = create_async_engine(url, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with Session() as session:
        if reset:
            print("  [1/5] Wiping persona data...")
            await wipe_persona(session, p)

        print("  [2/5] Upserting org structure...")
        await upsert_org(session, p)

        print("  [3/5] Upserting demo users...")
        users = await upsert_users(session, persona, p)

        print("  [4/5] Generating 6 months of positions + audit events...")
        n_pos, n_evt, head_hash, pending_pos = await seed_positions_and_events(
            session, persona, p, users
        )

        print("  [5/5] Creating pending execution proposal (maker/checker demo)...")
        if pending_pos is not None:
            await seed_pending_proposal(session, p, pending_pos, users)
        else:
            print("         (no NEW position available; skipped)")

        await session.commit()

        # Verify the chain we just wrote — re-reads from DB
        print("  [verify] Walking hash chain end-to-end...")
        ok, n_chain, verified_head = await verify_chain(session, p)
        if not ok or verified_head != head_hash:
            raise RuntimeError("Hash chain verification mismatch after seed")
        print(f"           {n_chain} events verified; head={verified_head[:16]}...")

    await engine.dispose()

    # -- Summary ------------------------------------------------------------
    print(f"\n{bar}")
    print(f"  [OK] SEED COMPLETE -- persona={persona}")
    print(f"{bar}")
    print(f"  Positions:    {n_pos}")
    print(f"  Audit events: {n_evt}")
    print(f"  Hash chain head: {head_hash}")
    print(f"\n  Demo accounts (password = '{DEMO_PASSWORD}'):")
    for email, _, full_name, role in persona_users(persona, p):
        print(f"    {email:36s}  {role:16s}  {full_name}")
    print(f"\n  Maker/checker demo: log in as treasurer to view the position,")
    print(f"  then as approver to approve the pending proposal.\n")


def cli() -> None:
    parser = argparse.ArgumentParser(description="Seed an ORDR demo tenant.")
    parser.add_argument("--persona", choices=list(PERSONAS.keys()), required=True,
                        help="Which demo persona to seed.")
    parser.add_argument("--reset", action="store_true",
                        help="Wipe persona's existing positions/proposals/audit events first.")
    parser.add_argument("--no-reset", dest="reset", action="store_false",
                        help="Additive seed without wiping (default).")
    parser.set_defaults(reset=False)
    args = parser.parse_args()

    asyncio.run(run(args.persona, args.reset))


if __name__ == "__main__":
    cli()
