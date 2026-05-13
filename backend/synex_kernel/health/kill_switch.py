"""Kill switch primitive for governance checks."""

from __future__ import annotations


class KillSwitchActivatedError(RuntimeError):
    """Raised when a limb is administratively amputated."""


class KillSwitchReceiver:
    """In-memory kill switch receiver."""

    def __init__(self, limb_id: str):
        self.limb_id = limb_id
        self.is_activated = False
        self.reason: str | None = None

    def activate(self, reason: str) -> None:
        self.is_activated = True
        self.reason = reason

    def deactivate(self) -> None:
        self.is_activated = False
        self.reason = None

    def check(self) -> None:
        if self.is_activated:
            raise KillSwitchActivatedError(f"limb amputated by kill switch: {self.reason}")

