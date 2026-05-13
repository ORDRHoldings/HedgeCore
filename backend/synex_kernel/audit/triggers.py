"""Database trigger hooks for the local Synex governance kernel."""

from __future__ import annotations

from sqlalchemy.engine import Engine


def install_worm_triggers(_engine: Engine) -> None:
    """Install WORM triggers where supported.

    TreasuryFX already enforces the primary domain WORM chain separately. The
    local governance kernel keeps this hook explicit so production can add
    engine-specific triggers without changing startup code.
    """
    return None

