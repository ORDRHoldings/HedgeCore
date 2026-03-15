"""SHA-256 hash chain operations (pure functions)."""
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from typing import Optional


def compute_hash(data: str) -> str:
    """Compute SHA-256 hash of a string."""
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def compute_chain_hash(prev_hash: str, payload_hash: str) -> str:
    """Compute the chain hash from previous hash and payload hash."""
    return compute_hash(f"{prev_hash}:{payload_hash}")


def append_to_chain(
    conn: sqlite3.Connection,
    event_type: str,
    payload: str,
    session_id: Optional[str] = None,
) -> int:
    """Append an event to the audit chain. Returns the new seq number."""
    # Get the latest chain hash
    row = conn.execute(
        "SELECT seq, chain_hash FROM audit_chain ORDER BY seq DESC LIMIT 1"
    ).fetchone()

    if row is None:
        raise RuntimeError("Audit chain has no genesis row. Run `nexus.py init` first.")

    prev_hash = row["chain_hash"]
    payload_hash = compute_hash(payload)
    chain_hash = compute_chain_hash(prev_hash, payload_hash)

    cursor = conn.execute(
        "INSERT INTO audit_chain (prev_hash, payload_hash, chain_hash, event_type, payload, session_id) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (prev_hash, payload_hash, chain_hash, event_type, payload, session_id),
    )
    return cursor.lastrowid


def verify_chain(conn: sqlite3.Connection) -> tuple[bool, Optional[int]]:
    """Verify the entire hash chain. Returns (valid, first_broken_seq)."""
    rows = conn.execute(
        "SELECT seq, prev_hash, payload_hash, chain_hash FROM audit_chain ORDER BY seq ASC"
    ).fetchall()

    if not rows:
        return False, None

    for i, row in enumerate(rows):
        if i == 0:
            # Genesis row — skip chain validation
            continue

        prev_row = rows[i - 1]
        expected_prev = prev_row["chain_hash"]
        expected_chain = compute_chain_hash(row["prev_hash"], row["payload_hash"])

        if row["prev_hash"] != expected_prev:
            return False, row["seq"]
        if row["chain_hash"] != expected_chain:
            return False, row["seq"]

    return True, None


def get_chain_length(conn: sqlite3.Connection) -> int:
    """Get the current chain length."""
    row = conn.execute("SELECT COUNT(*) as cnt FROM audit_chain").fetchone()
    return row["cnt"]


def get_latest_hash(conn: sqlite3.Connection) -> str:
    """Get the latest chain hash."""
    row = conn.execute(
        "SELECT chain_hash FROM audit_chain ORDER BY seq DESC LIMIT 1"
    ).fetchone()
    return row["chain_hash"] if row else ""
