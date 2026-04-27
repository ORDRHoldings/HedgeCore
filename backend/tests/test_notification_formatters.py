"""Tests for Slack/Teams notification formatters."""
from __future__ import annotations
from unittest.mock import patch


def test_slack_blocks_has_header_block():
    from app.services.notification_formatters import format_slack_blocks
    result = format_slack_blocks("hedge_run.completed", {"run_id": "abc", "trade_count": 5})
    assert result["blocks"][0]["type"] == "header"
    assert "Hedge Run Completed" in result["blocks"][0]["text"]["text"]


def test_slack_blocks_erp_failed_has_error_in_section():
    from app.services.notification_formatters import format_slack_blocks
    result = format_slack_blocks("erp_post.failed", {"error_message": "timeout", "je_id": "xyz"})
    section_text = result["blocks"][1]["text"]["text"]
    assert "error_message" in section_text


def test_slack_blocks_excludes_tenant_id_from_fields():
    from app.services.notification_formatters import format_slack_blocks
    result = format_slack_blocks("hedge_run.completed", {"run_id": "abc", "tenant_id": "t1"})
    section_text = result["blocks"][1]["text"]["text"]
    assert "tenant_id" not in section_text


def test_teams_card_structure():
    from app.services.notification_formatters import format_teams_card
    result = format_teams_card("journal_entry.posted", {"je_id": "1", "erp_ref": "QB-9"})
    assert result["@type"] == "MessageCard"
    assert "sections" in result


def test_teams_card_journal_posted_facts_include_erp_ref():
    from app.services.notification_formatters import format_teams_card
    result = format_teams_card("journal_entry.posted", {"je_id": "1", "erp_ref": "QB-9999"})
    fact_names = [f["name"] for f in result["sections"][0]["facts"]]
    assert "erp_ref" in fact_names


def test_format_payload_dispatches_slack():
    from app.services.notification_formatters import format_payload
    result = format_payload("slack", "hedge_run.completed", {"run_id": "x"})
    assert "blocks" in result


def test_format_payload_dispatches_teams():
    from app.services.notification_formatters import format_payload
    result = format_payload("teams", "hedge_run.completed", {"run_id": "x"})
    assert "@type" in result


def test_format_payload_generic_returns_raw():
    from app.services.notification_formatters import format_payload
    data = {"run_id": "x", "trade_count": 3}
    result = format_payload("generic", "hedge_run.completed", data)
    assert result is data


def test_format_payload_formatter_exception_returns_raw():
    from app.services.notification_formatters import format_payload
    data = {"run_id": "x"}
    with patch("app.services.notification_formatters.format_slack_blocks", side_effect=RuntimeError("boom")):
        result = format_payload("slack", "hedge_run.completed", data)
    assert result is data
