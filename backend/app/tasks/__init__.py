"""
app/tasks/__init__.py
HedgeCalc - Celery Task Registry

This file exists intentionally.
Its presence guarantees deterministic task discovery.
"""

# Explicit imports ensure registration
from app.tasks.audit_cleanup import cleanup_audit_tables  # noqa: F401
