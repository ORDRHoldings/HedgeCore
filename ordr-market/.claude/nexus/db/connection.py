"""SQLite WAL connection with row_factory."""
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from ..constants import DB_PATH


def get_connection(db_path: Path = DB_PATH, readonly: bool = False) -> sqlite3.Connection:
    """Get a configured SQLite connection with WAL mode and row factory."""
    if readonly:
        uri = f"file:{db_path}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
    else:
        conn = sqlite3.connect(str(db_path))

    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


@contextmanager
def transaction(db_path: Path = DB_PATH):
    """Context manager for database transactions."""
    conn = get_connection(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@contextmanager
def readonly_connection(db_path: Path = DB_PATH):
    """Context manager for read-only database access."""
    conn = get_connection(db_path, readonly=True)
    try:
        yield conn
    finally:
        conn.close()
