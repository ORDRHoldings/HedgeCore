"""Health report models for the local Synex kernel."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum


class HealthStatus(str, Enum):
    ALIVE = "alive"
    DEGRADED = "degraded"
    DEAD = "dead"


@dataclass
class HealthReport:
    limb_id: str
    status: HealthStatus
    budget_remaining: int
    budget_total: int
    uptime_seconds: float
    epoch: int = 0
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))

