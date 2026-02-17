"""A34: External Hash Anchor Service.

Daily process:
1. Compute Merkle root of all ledger_entries.root_hash
2. Generate daily_anchor_hash
3. Store in anchor_hashes table

Future-ready for: blockchain publish, external auditor export.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any


def compute_merkle_root(hashes: list[str]) -> str:
    """Compute Merkle root of a list of hash strings.

    Parameters
    ----------
    hashes : list[str]
        Leaf hashes (ledger entry root_hashes).

    Returns
    -------
    str
        Merkle root hash.
    """
    if not hashes:
        return hashlib.sha256(b"empty_anchor").hexdigest()

    if len(hashes) == 1:
        return hashes[0]

    # Build tree bottom-up
    current_level = list(hashes)

    while len(current_level) > 1:
        next_level: list[str] = []
        for i in range(0, len(current_level), 2):
            left = current_level[i]
            right = current_level[i + 1] if i + 1 < len(current_level) else left
            combined = hashlib.sha256(f"{left}{right}".encode()).hexdigest()
            next_level.append(combined)
        current_level = next_level

    return current_level[0]


def build_daily_anchor(
    ledger_entries: list[dict],
    anchor_date: datetime | None = None,
) -> dict[str, Any]:
    """Build daily anchor hash from ledger entries.

    Parameters
    ----------
    ledger_entries : list[dict]
        Ledger entries, each with 'root_hash'.
    anchor_date : datetime | None
        Date for the anchor. Defaults to now UTC.

    Returns
    -------
    dict
        Anchor hash record ready for storage.
    """
    if anchor_date is None:
        anchor_date = datetime.now(timezone.utc)

    root_hashes = [
        entry.get("root_hash", "")
        for entry in ledger_entries
        if entry.get("root_hash")
    ]

    merkle_root = compute_merkle_root(root_hashes)

    return {
        "anchor_date": anchor_date.isoformat(),
        "merkle_root": merkle_root,
        "entry_count": len(root_hashes),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def verify_entry_in_tree(
    entry_hash: str,
    all_hashes: list[str],
    expected_root: str,
) -> bool:
    """Verify that an entry's hash is part of the Merkle tree.

    Parameters
    ----------
    entry_hash : str
        Root hash of the entry to verify.
    all_hashes : list[str]
        All leaf hashes in the tree.
    expected_root : str
        Expected Merkle root.

    Returns
    -------
    bool
        True if the entry is in the tree and root matches.
    """
    if entry_hash not in all_hashes:
        return False

    computed_root = compute_merkle_root(all_hashes)
    return computed_root == expected_root
