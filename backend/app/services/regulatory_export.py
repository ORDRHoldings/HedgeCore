"""app/services/regulatory_export.py

Regulatory format exports for Audit Lab.

Provides two serialisation helpers:
  - export_isda_xml   : ISDA-style XML trade confirmation envelope
  - export_finra_17a4 : FINRA Rule 17a-4 immutable record (pipe-delimited text)

Both functions are pure (no DB / IO) and return strings.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from xml.sax.saxutils import escape as xml_escape


# ---------------------------------------------------------------------------
# ISDA XML export
# ---------------------------------------------------------------------------

def export_isda_xml(
    run_data: dict,
    transactions: list[dict],
    *,
    audit_summary: dict | None = None,
) -> str:
    """Generate ISDA-format XML with standard trade confirmation fields.

    Parameters
    ----------
    run_data : dict
        Top-level calculation run metadata.  Expected keys:
          run_id, trade_date, value_date, counterparty,
          currency_base, currency_quote, notional, rate.
    transactions : list[dict]
        Individual transaction legs.  Each dict should contain:
          transaction_id, direction (BUY/SELL), currency, amount,
          rate, value_date.
    audit_summary : dict | None
        Optional audit summary data.  When provided, an ``<auditSummary>``
        section is appended before the closing envelope tag.  Expected keys:
          total_markup_usd, total_loss_usd, methodology_version,
          findings_count, findings_total_usd.

    Returns
    -------
    str
        Well-formed XML string representing the ISDA trade confirmation.
    """
    lines: list[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<isda:tradeConfirmation xmlns:isda="urn:isda:trade:2024">',
        "  <header>",
        f"    <runId>{_x(run_data.get('run_id', ''))}</runId>",
        f"    <tradeDate>{_x(run_data.get('trade_date', ''))}</tradeDate>",
        f"    <valueDate>{_x(run_data.get('value_date', ''))}</valueDate>",
        f"    <counterparty>{_x(run_data.get('counterparty', ''))}</counterparty>",
        f"    <generatedAt>{_now_iso()}</generatedAt>",
        "  </header>",
        "  <tradeDetails>",
        f"    <currencyBase>{_x(run_data.get('currency_base', ''))}</currencyBase>",
        f"    <currencyQuote>{_x(run_data.get('currency_quote', ''))}</currencyQuote>",
        f"    <notional>{_x(str(run_data.get('notional', '')))}</notional>",
        f"    <rate>{_x(str(run_data.get('rate', '')))}</rate>",
        "  </tradeDetails>",
        "  <transactions>",
    ]

    for txn in transactions:
        lines.append("    <transaction>")
        lines.append(
            f"      <transactionId>{_x(txn.get('transaction_id', ''))}</transactionId>"
        )
        lines.append(
            f"      <direction>{_x(txn.get('direction', ''))}</direction>"
        )
        lines.append(
            f"      <currency>{_x(txn.get('currency', ''))}</currency>"
        )
        lines.append(
            f"      <amount>{_x(str(txn.get('amount', '')))}</amount>"
        )
        lines.append(
            f"      <rate>{_x(str(txn.get('rate', '')))}</rate>"
        )
        lines.append(
            f"      <valueDate>{_x(txn.get('value_date', ''))}</valueDate>"
        )
        lines.append("    </transaction>")

    lines.append("  </transactions>")

    # Audit summary section (optional — included when audit data is available)
    if audit_summary:
        lines.append("  <auditSummary>")
        lines.append(
            f"    <totalMarkupUsd>{_x(str(audit_summary.get('total_markup_usd', 0)))}</totalMarkupUsd>"
        )
        lines.append(
            f"    <totalLossUsd>{_x(str(audit_summary.get('total_loss_usd', 0)))}</totalLossUsd>"
        )
        lines.append(
            f"    <methodologyVersion>{_x(str(audit_summary.get('methodology_version', '')))}</methodologyVersion>"
        )
        lines.append("    <findingsSummary>")
        lines.append(
            f"      <count>{_x(str(audit_summary.get('findings_count', 0)))}</count>"
        )
        lines.append(
            f"      <totalUsd>{_x(str(audit_summary.get('findings_total_usd', 0)))}</totalUsd>"
        )
        lines.append("    </findingsSummary>")
        lines.append("  </auditSummary>")

    lines.append("</isda:tradeConfirmation>")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# FINRA 17a-4 export
# ---------------------------------------------------------------------------

def export_finra_17a4(
    run_data: dict,
    findings: list[dict],
    hash_chain: list[str],
) -> str:
    """Generate FINRA 17a-4 compliant immutable record format.

    The output is pipe-delimited text with three sections:
      HEADER  -- single line with report metadata
      RECORD  -- one line per finding, each with its own SHA-256 hash
      TRAILER -- record count + overall integrity hash

    Parameters
    ----------
    run_data : dict
        Report-level metadata.  Expected keys:
          run_id, generated_by, report_date.
    findings : list[dict]
        Individual audit findings.  Each dict should contain:
          finding_id, timestamp, category, severity, description.
    hash_chain : list[str]
        Pre-existing hash chain entries to incorporate.

    Returns
    -------
    str
        Pipe-delimited text with HEADER, RECORD, and TRAILER lines.
    """
    generated_at = _now_iso()
    lines: list[str] = []

    # -- Header ---------------------------------------------------------------
    header_parts = [
        "HEADER",
        run_data.get("run_id", ""),
        run_data.get("generated_by", "SYSTEM"),
        run_data.get("report_date", generated_at[:10]),
        generated_at,
        f"CHAIN_LENGTH={len(hash_chain)}",
    ]
    lines.append("|".join(header_parts))

    # -- Records --------------------------------------------------------------
    running_hash = hash_chain[-1] if hash_chain else "0" * 64
    record_hashes: list[str] = []

    for seq, finding in enumerate(findings, start=1):
        record_body = "|".join([
            "RECORD",
            str(seq).zfill(6),
            finding.get("finding_id", ""),
            finding.get("timestamp", generated_at),
            finding.get("category", ""),
            finding.get("severity", ""),
            finding.get("description", ""),
            f"PREV_HASH={running_hash}",
        ])

        record_hash = hashlib.sha256(record_body.encode("utf-8")).hexdigest()
        record_hashes.append(record_hash)
        lines.append(f"{record_body}|HASH={record_hash}")
        running_hash = record_hash

    # -- Trailer --------------------------------------------------------------
    integrity_payload = "|".join(record_hashes) if record_hashes else "EMPTY"
    integrity_hash = hashlib.sha256(
        integrity_payload.encode("utf-8")
    ).hexdigest()

    trailer_parts = [
        "TRAILER",
        f"RECORD_COUNT={len(findings)}",
        f"INTEGRITY_HASH={integrity_hash}",
        generated_at,
    ]
    lines.append("|".join(trailer_parts))

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _x(value: str) -> str:
    """XML-escape a string value."""
    return xml_escape(str(value))


def _now_iso() -> str:
    """Return current UTC time as ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()
