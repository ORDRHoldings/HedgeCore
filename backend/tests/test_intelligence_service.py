# backend/tests/test_intelligence_service.py
"""Service-layer tests for intelligence_service — AsyncMock DB session."""
from __future__ import annotations

import hashlib
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _mock_company(intelligence_enabled=True, plan_tier="intelligence"):
    c = MagicMock()
    c.id = uuid.uuid4()
    c.plan_tier = plan_tier
    c.intelligence_enabled = intelligence_enabled
    return c


def _mock_user(company=None):
    u = MagicMock()
    u.id = uuid.uuid4()
    u.company = company or _mock_company()
    u.company_id = u.company.id
    return u


# ── build_treasury_context ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_build_treasury_context_returns_string():
    """build_treasury_context returns a non-empty string."""
    from app.services.intelligence_service import build_treasury_context
    session = AsyncMock()
    # Mock all DB queries to return empty results
    session.execute = AsyncMock(return_value=MagicMock(fetchall=MagicMock(return_value=[])))
    company_id = uuid.uuid4()
    result = await build_treasury_context(session, company_id)
    assert isinstance(result, str)
    assert len(result) > 0


# ── prompt hash ────────────────────────────────────────────────────────────

def test_prompt_hash_deterministic():
    """Same prompt always produces same 64-char hex hash."""
    from app.services.intelligence_service import _hash_prompt
    h1 = _hash_prompt("hello world")
    h2 = _hash_prompt("hello world")
    assert h1 == h2
    assert len(h1) == 64
    assert all(c in "0123456789abcdef" for c in h1)


def test_prompt_hash_sensitive():
    """Different prompts produce different hashes."""
    from app.services.intelligence_service import _hash_prompt
    assert _hash_prompt("prompt A") != _hash_prompt("prompt B")


# ── query_intelligence ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_query_intelligence_success():
    """query_intelligence returns QueryResponse with answer and stores hash."""
    from app.services.intelligence_service import query_intelligence

    company_id = uuid.uuid4()
    user_id = uuid.uuid4()

    mock_message = MagicMock()
    mock_message.content = [MagicMock(text="EUR net short $2.4M.")]
    mock_message.usage.input_tokens = 100
    mock_message.usage.output_tokens = 50

    mock_log_row = MagicMock()
    mock_log_row.id = uuid.uuid4()

    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(fetchall=MagicMock(return_value=[])))

    with patch("app.services.intelligence_service.settings") as mock_settings, \
         patch("app.services.intelligence_service._log_query", new_callable=AsyncMock, return_value=mock_log_row) as mock_log, \
         patch("app.services.intelligence_service.anthropic") as mock_anthropic:

        mock_settings.ANTHROPIC_API_KEY = "test-key"
        mock_settings.ANTHROPIC_MODEL = "claude-sonnet-4-6"

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_message)
        mock_anthropic.AsyncAnthropic.return_value = mock_client

        result = await query_intelligence(session, company_id, user_id, "What is our EUR exposure?")

    assert result.answer == "EUR net short $2.4M."
    assert result.tokens_used == 150
    # Verify _log_query received a 64-char hex hash, not raw prompt
    call_args = mock_log.call_args
    prompt_hash_arg = call_args.args[4] if len(call_args.args) > 4 else call_args.kwargs.get("prompt_hash")
    assert len(prompt_hash_arg) == 64
    assert all(c in "0123456789abcdef" for c in prompt_hash_arg)


@pytest.mark.asyncio
async def test_query_intelligence_missing_api_key_raises_503():
    """query_intelligence raises HTTP 503 when ANTHROPIC_API_KEY is empty."""
    from app.services.intelligence_service import query_intelligence
    from fastapi import HTTPException

    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(fetchall=MagicMock(return_value=[])))

    with patch("app.services.intelligence_service.settings") as mock_settings:
        mock_settings.ANTHROPIC_API_KEY = ""
        with pytest.raises(HTTPException) as exc_info:
            await query_intelligence(session, uuid.uuid4(), uuid.uuid4(), "test")
    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_query_intelligence_api_error_raises_502():
    """query_intelligence raises HTTP 502 when Anthropic API returns an error."""
    from app.services.intelligence_service import query_intelligence
    from fastapi import HTTPException

    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(fetchall=MagicMock(return_value=[])))

    with patch("app.services.intelligence_service.settings") as mock_settings, \
         patch("app.services.intelligence_service.anthropic") as mock_anthropic_mod:

        mock_settings.ANTHROPIC_API_KEY = "test-key"
        mock_settings.ANTHROPIC_MODEL = "claude-sonnet-4-6"

        mock_client = AsyncMock()
        mock_anthropic_mod.APIError = type("APIError", (Exception,), {"status_code": 429})
        mock_client.messages.create = AsyncMock(
            side_effect=mock_anthropic_mod.APIError("rate limit")
        )
        mock_anthropic_mod.AsyncAnthropic.return_value = mock_client

        with pytest.raises(HTTPException) as exc_info:
            await query_intelligence(session, uuid.uuid4(), uuid.uuid4(), "test")
    assert exc_info.value.status_code == 502


# ── draft_commentary ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_draft_commentary_unknown_report_raises_404():
    """draft_commentary raises 404 when report_id not found."""
    from app.services.intelligence_service import draft_commentary
    from fastapi import HTTPException

    session = AsyncMock()
    # Simulate no run found
    mock_result = MagicMock()
    mock_result.scalar_one_or_none = MagicMock(return_value=None)
    session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.intelligence_service.settings") as mock_settings:
        mock_settings.ANTHROPIC_API_KEY = "test-key"
        with pytest.raises(HTTPException) as exc_info:
            await draft_commentary(
                session, uuid.uuid4(), uuid.uuid4(),
                "hedge_effectiveness", str(uuid.uuid4())
            )
    assert exc_info.value.status_code == 404
