"""Tests for channel_type webhook extension."""
from __future__ import annotations
import pytest
from app.models.webhook import SUPPORTED_EVENTS, CHANNEL_TYPES


def test_new_events_in_supported_set():
    assert "hedge_run.completed" in SUPPORTED_EVENTS
    assert "journal_entry.posted" in SUPPORTED_EVENTS
    assert "erp_post.failed" in SUPPORTED_EVENTS


def test_channel_types_constant():
    assert "slack" in CHANNEL_TYPES
    assert "teams" in CHANNEL_TYPES
    assert "generic" in CHANNEL_TYPES
