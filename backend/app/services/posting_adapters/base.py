"""Abstract base class for GL posting adapters."""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class PostingResult:
    success: bool
    payload: str       # ERP journal ref on success, raw response otherwise
    error: str = ""    # error message on failure
    erp_ref: str = ""  # ERP-assigned journal ID (if available)


class GLPostingAdapter(ABC):
    """Interface all posting adapters must implement."""

    @abstractmethod
    async def post(self, journal_entry) -> PostingResult:
        """Post a single JournalEntry to the ERP. Returns PostingResult."""
        ...

    @property
    @abstractmethod
    def system_name(self) -> str:
        """Identifier stored in JournalEntry.posted_to."""
        ...
