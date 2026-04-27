"""
app/services/notification_formatters.py

Pure-function formatters for Slack Incoming Webhooks (Block Kit) and
Microsoft Teams Incoming Webhooks (legacy MessageCard format).

No DB access, no I/O. Formatter errors fall back to the raw data dict
so delivery never blocks on a formatting failure.

[KNOWN DEBT]: Teams uses legacy MessageCard format. Microsoft deprecated
this in favour of Adaptive Cards. Upgrade in a future sub-project.
"""
from __future__ import annotations

import logging

_log = logging.getLogger("hedgecalc.services.notification_formatters")


def format_slack_blocks(event_type: str, data: dict) -> dict:
    """Return Slack Incoming Webhook body (Block Kit JSON).

    Slack expects the body to BE the Block Kit dict — no outer envelope.
    """
    title = event_type.replace("_", " ").replace(".", " ").title()
    fields = "\n".join(
        f"*{k}*: {v}" for k, v in data.items() if k != "tenant_id"
    ) or "_no fields_"
    return {
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": f"ORDR — {title}"},
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": fields},
            },
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": f"tenant: {data.get('tenant_id', '')}"}
                ],
            },
        ]
    }


def format_teams_card(event_type: str, data: dict) -> dict:
    """Return Teams Incoming Webhook body (legacy MessageCard format)."""
    facts = [
        {"name": k, "value": str(v)}
        for k, v in data.items()
        if k != "tenant_id"
    ]
    return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": "1C62F2",
        "summary": f"ORDR — {event_type}",
        "sections": [
            {
                "activityTitle": f"ORDR — {event_type.replace('_', ' ').replace('.', ' ').title()}",
                "facts": facts,
            }
        ],
    }


def format_payload(channel_type: str, event_type: str, data: dict) -> dict:
    """Dispatch to channel-specific formatter; fall back to raw data dict on error."""
    try:
        if channel_type == "slack":
            return format_slack_blocks(event_type, data)
        if channel_type == "teams":
            return format_teams_card(event_type, data)
    except Exception:  # noqa: BLE001
        _log.warning(
            "notification_formatters: formatter error for channel=%s event=%s — falling back to raw dict",
            channel_type,
            event_type,
        )
    return data
