"""Schema versioning and migrations."""
import sqlite3
from ..constants import SCHEMA_VERSION


def get_current_version(conn: sqlite3.Connection) -> int:
    """Get current schema version from DB."""
    try:
        row = conn.execute(
            "SELECT value FROM _nexus_meta WHERE key = 'schema_version'"
        ).fetchone()
        return int(row["value"]) if row else 0
    except sqlite3.OperationalError:
        return 0


def needs_migration(conn: sqlite3.Connection) -> bool:
    """Check if DB needs migration."""
    return get_current_version(conn) < SCHEMA_VERSION


MIGRATIONS = {
    # version: (description, sql)
    # Future migrations go here:
    # 2: ("Add new_table", "CREATE TABLE IF NOT EXISTS new_table (...);"),
}


def run_migrations(conn: sqlite3.Connection) -> list[str]:
    """Run pending migrations. Returns list of applied migration descriptions."""
    current = get_current_version(conn)
    applied = []

    for version in sorted(MIGRATIONS.keys()):
        if version > current:
            desc, sql = MIGRATIONS[version]
            conn.executescript(sql)
            conn.execute(
                "UPDATE _nexus_meta SET value = ?, updated_at = datetime('now') "
                "WHERE key = 'schema_version'",
                (str(version),),
            )
            applied.append(f"v{version}: {desc}")

    return applied
