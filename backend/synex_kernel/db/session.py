"""SQLAlchemy session helpers for the local Synex kernel."""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker


def get_engine(db_url: str) -> Engine:
    """Create a synchronous SQLAlchemy engine for kernel governance state."""
    connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
    return create_engine(db_url, future=True, connect_args=connect_args)


def get_session_factory(engine: Engine):
    """Return a sync session factory."""
    return sessionmaker(bind=engine, autoflush=True, autocommit=False, future=True)

