"""Database integrity verification."""
import sqlite3
from ..security.hash_chain import verify_chain
from ..constants import SCHEMA_VERSION


def verify_schema_version(conn: sqlite3.Connection) -> tuple[bool, str]:
    """Check if schema version matches expected."""
    row = conn.execute(
        "SELECT value FROM _nexus_meta WHERE key = 'schema_version'"
    ).fetchone()
    if not row:
        return False, "No schema_version in _nexus_meta"
    current = int(row["value"])
    if current != SCHEMA_VERSION:
        return False, f"Schema version mismatch: DB={current}, expected={SCHEMA_VERSION}"
    return True, "OK"


def verify_worm_triggers(conn: sqlite3.Connection) -> tuple[bool, str]:
    """Verify WORM triggers exist on audit_chain and healing_log."""
    expected = {
        "audit_chain_no_update", "audit_chain_no_delete",
        "healing_log_no_update", "healing_log_no_delete",
    }
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'trigger'"
    ).fetchall()
    found = {row["name"] for row in rows}
    missing = expected - found
    if missing:
        return False, f"Missing WORM triggers: {', '.join(sorted(missing))}"
    return True, "OK"


def verify_genesis(conn: sqlite3.Connection) -> tuple[bool, str]:
    """Verify genesis row exists."""
    row = conn.execute(
        "SELECT seq FROM audit_chain WHERE seq = 1 AND event_type = 'genesis'"
    ).fetchone()
    if not row:
        return False, "Genesis row missing from audit_chain"
    return True, "OK"


def verify_hash_chain(conn: sqlite3.Connection) -> tuple[bool, str]:
    """Verify the full hash chain integrity."""
    valid, broken_seq = verify_chain(conn)
    if not valid:
        if broken_seq:
            return False, f"Hash chain broken at seq={broken_seq}"
        return False, "Hash chain empty or invalid"
    return True, "OK"


def verify_agents_seeded(conn: sqlite3.Connection) -> tuple[bool, str]:
    """Verify all agents are seeded."""
    from ..constants import AGENT_NAMES
    row = conn.execute("SELECT COUNT(*) as cnt FROM agents").fetchone()
    if row["cnt"] < len(AGENT_NAMES):
        return False, f"Only {row['cnt']}/{len(AGENT_NAMES)} agents seeded"
    return True, "OK"


def full_integrity_check(conn: sqlite3.Connection) -> list[tuple[str, bool, str]]:
    """Run all integrity checks. Returns list of (check_name, passed, message)."""
    checks = [
        ("schema_version", verify_schema_version),
        ("worm_triggers", verify_worm_triggers),
        ("genesis_row", verify_genesis),
        ("hash_chain", verify_hash_chain),
        ("agents_seeded", verify_agents_seeded),
    ]
    results = []
    for name, check_fn in checks:
        try:
            passed, msg = check_fn(conn)
            results.append((name, passed, msg))
        except Exception as e:
            results.append((name, False, str(e)))
    return results
