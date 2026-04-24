"""
app/tasks/hash_chain_verify.py
Nightly job: verify WORM audit_events hash chain integrity across all tenants.

Runs daily at 02:30 UTC via APScheduler. Read-only — never mutates audit
tables. On break detection: logs ERROR and raises so Sentry captures the event.
"""
from __future__ import annotations

import logging

from app.core.db import async_session_maker
from app.services.hash_chain_verifier import verify_all_chains

log = logging.getLogger(__name__)


class HashChainBrokenError(RuntimeError):
    """Raised when audit_events hash chain has any integrity break."""


async def run_hash_chain_verify_job() -> None:
    async with async_session_maker() as session:
        report = await verify_all_chains(session)

    log.info(
        "hash_chain_verify: tenants=%d events=%d healthy=%s breaks=%d",
        report.tenants_checked,
        report.events_checked,
        report.healthy,
        len(report.breaks),
    )

    if not report.healthy:
        log.error(
            "hash_chain_verify: %d integrity break(s) detected — first 5: %s",
            len(report.breaks),
            [
                f"tenant={b.company_id} idx={b.sequence_index} kind={b.kind}"
                for b in report.breaks[:5]
            ],
        )
        raise HashChainBrokenError(
            f"{len(report.breaks)} hash-chain integrity break(s) across "
            f"{report.tenants_checked} tenants"
        )
