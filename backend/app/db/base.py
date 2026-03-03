"""
app/db/base.py

HedgeCalc - Canonical SQLAlchemy Declarative Base

RULES:
- This file defines the ONE and ONLY declarative Base for the entire project
- ALL ORM models MUST import Base from here
- Alembic MUST reference this Base
- session.py and engine wiring must NOT redefine Base
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """
    Canonical SQLAlchemy Declarative Base.

    All ORM models inherit from this class.
    """
    pass
