"""Async heartbeat emitter."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

from synex_kernel.health.status import HealthReport


class HeartbeatEmitter:
    """Periodic heartbeat sender used by the upward diode."""

    def __init__(
        self,
        *,
        limb_id: str,
        collect_fn: Callable[[], HealthReport],
        send_fn: Callable[[HealthReport], None | Awaitable[None]],
        interval_seconds: float = 30.0,
    ):
        self.limb_id = limb_id
        self.collect_fn = collect_fn
        self.send_fn = send_fn
        self.interval_seconds = interval_seconds
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _run(self) -> None:
        while self._running:
            report = self.collect_fn()
            result = self.send_fn(report)
            if asyncio.iscoroutine(result):
                await result
            await asyncio.sleep(self.interval_seconds)
