"""Hash-chain helpers for Synex governance audit events."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from synex_kernel.audit.models import SynexAuditEvent

GENESIS_PREV_HASH = "0" * 64


def _canonical_payload(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def _event_hash(seq: int, event_type: str, payload: dict[str, Any], limb_id: str, prev_hash: str) -> str:
    body = {
        "seq": seq,
        "event_type": event_type,
        "payload": payload,
        "limb_id": limb_id,
        "prev_hash": prev_hash,
    }
    return hashlib.sha256(_canonical_payload(body).encode("utf-8")).hexdigest()


def get_chain_length(session: Session) -> int:
    """Return number of events in the governance chain."""
    return int(session.scalar(select(func.count(SynexAuditEvent.id))) or 0)


def get_latest_hash(session: Session) -> str | None:
    """Return latest event hash."""
    stmt = select(SynexAuditEvent.event_hash).order_by(SynexAuditEvent.seq.desc()).limit(1)
    return session.scalar(stmt)


def create_genesis(session: Session, limb_id: str = "synex-kernel") -> SynexAuditEvent | None:
    """Create the genesis event if the chain is empty."""
    if get_chain_length(session) > 0:
        return None
    return append_event(session, "genesis", {"version": 1}, limb_id=limb_id)


def append_event(
    session: Session,
    event_type: str,
    payload: dict[str, Any],
    *,
    limb_id: str,
) -> SynexAuditEvent:
    """Append a governance event to the chain."""
    latest_seq = session.scalar(select(func.max(SynexAuditEvent.seq)))
    seq = int(latest_seq) + 1 if latest_seq is not None else 0
    prev_hash = get_latest_hash(session) or GENESIS_PREV_HASH
    event_hash = _event_hash(seq, event_type, payload, limb_id, prev_hash)
    event = SynexAuditEvent(
        seq=seq,
        event_type=event_type,
        payload=payload,
        limb_id=limb_id,
        prev_hash=prev_hash,
        event_hash=event_hash,
    )
    session.add(event)
    return event


def verify_chain(session: Session) -> tuple[bool, int | None]:
    """Verify the governance hash chain."""
    events = session.scalars(select(SynexAuditEvent).order_by(SynexAuditEvent.seq.asc())).all()
    prev_hash = GENESIS_PREV_HASH
    expected_seq = 0
    for event in events:
        if event.seq != expected_seq:
            return False, event.seq
        if event.prev_hash != prev_hash:
            return False, event.seq
        expected = _event_hash(event.seq, event.event_type, event.payload, event.limb_id, event.prev_hash)
        if event.event_hash != expected:
            return False, event.seq
        prev_hash = event.event_hash
        expected_seq += 1
    return True, None

