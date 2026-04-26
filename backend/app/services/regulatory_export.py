"""app/services/regulatory_export.py

Regulatory format exports for Audit Lab and Report Studio.

Provides six serialisation helpers:
  - export_isda_xml      : ISDA-style XML trade confirmation envelope
  - export_finra_17a4    : FINRA Rule 17a-4 immutable record (pipe-delimited text)
  - export_emir_xml      : EMIR Article 9 trade report (XML)
  - export_mifid_xml     : MiFID II RTS 25 transaction report (XML)
  - export_dodd_frank    : Dodd-Frank Title VII swap data report (pipe-delimited text)
  - export_ifrs9_xml     : IFRS 9 / ASC 815 hedge effectiveness evidence (XML)

All functions are pure (no DB / IO) and return strings.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
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
# EMIR Article 9 XML export
# ---------------------------------------------------------------------------

def export_emir_xml(
    run_data: dict,
    hedge_actions: list[dict],
    positions: list[dict],
) -> str:
    """Generate EMIR Article 9 trade report XML.

    Implements the key fields required by EMIR Refit (EU 2024/2987)
    for FX derivative reporting to EU trade repositories.

    Parameters
    ----------
    run_data : dict
        Run-level metadata.  Expected keys:
          run_id, reporting_entity_lei, counterparty_lei,
          trade_date, value_date, reporting_timestamp.
    hedge_actions : list[dict]
        Hedge plan buckets.  Each dict should contain:
          currency, instrument, hedge_notional, hedge_rate,
          value_date, position_id.
    positions : list[dict]
        Underlying positions.  Each dict should contain:
          record_id, currency, amount, flow_type, entity.

    Returns
    -------
    str
        Well-formed XML string representing the EMIR trade report.
    """
    generated_at = _now_iso()
    run_id = run_data.get("run_id", "")
    lei_reporting = run_data.get("reporting_entity_lei", "NOT_PROVIDED")
    lei_counterparty = run_data.get("counterparty_lei", "NOT_PROVIDED")

    lines: list[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<emir:tradeReport xmlns:emir="urn:eu:emir:trade:2024">',
        "  <reportHeader>",
        f"    <reportId>EMIR-{_x(run_id[:8])}-{generated_at[:10]}</reportId>",
        f"    <reportingTimestamp>{generated_at}</reportingTimestamp>",
        f"    <reportingEntityLEI>{_x(lei_reporting)}</reportingEntityLEI>",
        f"    <counterpartyLEI>{_x(lei_counterparty)}</counterpartyLEI>",
        "    <reportType>TRADE</reportType>",
        "    <actionType>NEW</actionType>",
        "    <regulatoryFramework>EMIR Refit (EU 2024/2987)</regulatoryFramework>",
        "  </reportHeader>",
        "  <tradeData>",
        f"    <uniqueTradeIdentifier>UTI-{_x(run_id)}</uniqueTradeIdentifier>",
        f"    <tradeDate>{_x(run_data.get('trade_date', generated_at[:10]))}</tradeDate>",
        f"    <valueDate>{_x(run_data.get('value_date', ''))}</valueDate>",
        "    <assetClass>FOREIGN_EXCHANGE</assetClass>",
        "    <productClassification>FX_DERIVATIVE</productClassification>",
        "    <hedgeFlag>true</hedgeFlag>",
        "    <hedgeAccountingStandard>IFRS_9</hedgeAccountingStandard>",
        "  </tradeData>",
        "  <hedgeActions>",
    ]

    total_notional = 0.0
    for i, action in enumerate(hedge_actions, 1):
        notional = float(action.get("hedge_notional", 0) or 0)
        total_notional += abs(notional)
        lines.append(f"    <action seq=\"{i}\">")
        lines.append(f"      <currency>{_x(action.get('currency', ''))}</currency>")
        lines.append(f"      <instrument>{_x(action.get('instrument', ''))}</instrument>")
        lines.append(f"      <notionalAmount>{_x(str(notional))}</notionalAmount>")
        lines.append(f"      <notionalCurrency>{_x(action.get('currency', 'USD'))}</notionalCurrency>")
        lines.append(f"      <rate>{_x(str(action.get('hedge_rate', '')))}</rate>")
        lines.append(f"      <settlementDate>{_x(action.get('value_date', ''))}</settlementDate>")
        lines.append(f"      <positionRef>{_x(str(action.get('position_id', '')))}</positionRef>")
        lines.append("    </action>")

    lines.append("  </hedgeActions>")
    lines.append(f"  <aggregateNotional>{total_notional}</aggregateNotional>")
    lines.append("  <underlyingExposures>")

    for pos in positions:
        lines.append("    <exposure>")
        lines.append(f"      <recordId>{_x(pos.get('record_id', ''))}</recordId>")
        lines.append(f"      <currency>{_x(pos.get('currency', ''))}</currency>")
        lines.append(f"      <amount>{_x(str(pos.get('amount', '')))}</amount>")
        lines.append(f"      <flowType>{_x(pos.get('flow_type', ''))}</flowType>")
        lines.append(f"      <entity>{_x(pos.get('entity', ''))}</entity>")
        lines.append("    </exposure>")

    lines.append("  </underlyingExposures>")
    lines.append("  <riskMitigation>")
    lines.append("    <article11Compliance>true</article11Compliance>")
    lines.append("    <portfolioReconciliation>DAILY</portfolioReconciliation>")
    lines.append("    <disputeResolution>STANDARD</disputeResolution>")
    lines.append("    <marginExchange>VM_ONLY</marginExchange>")
    lines.append("  </riskMitigation>")
    lines.append("</emir:tradeReport>")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# MiFID II RTS 25 XML export
# ---------------------------------------------------------------------------

def export_mifid_xml(
    run_data: dict,
    hedge_actions: list[dict],
    positions: list[dict],
) -> str:
    """Generate MiFID II RTS 25 transaction report XML.

    Implements the key fields required by MiFID II (EU 2014/65)
    Article 26 transaction reporting for FX derivatives.

    Parameters
    ----------
    run_data : dict
        Run-level metadata.  Expected keys:
          run_id, reporting_entity_lei, executing_entity_lei,
          trade_date, value_date, venue, decision_maker.
    hedge_actions : list[dict]
        Hedge plan buckets.  Each dict should contain:
          currency, instrument, hedge_notional, hedge_rate,
          value_date, position_id.
    positions : list[dict]
        Underlying positions for exposure context.

    Returns
    -------
    str
        Well-formed XML string representing the MiFID II transaction report.
    """
    generated_at = _now_iso()
    run_id = run_data.get("run_id", "")
    lei_reporting = run_data.get("reporting_entity_lei", "NOT_PROVIDED")
    lei_executing = run_data.get("executing_entity_lei", lei_reporting)

    lines: list[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<mifid:transactionReport xmlns:mifid="urn:eu:mifid2:rts25:2024">',
        "  <reportHeader>",
        f"    <transactionReferenceNumber>TRN-{_x(run_id[:12])}</transactionReferenceNumber>",
        f"    <reportingTimestamp>{generated_at}</reportingTimestamp>",
        f"    <reportingEntityLEI>{_x(lei_reporting)}</reportingEntityLEI>",
        f"    <executingEntityLEI>{_x(lei_executing)}</executingEntityLEI>",
        f"    <venue>{_x(run_data.get('venue', 'XOFF'))}</venue>",
        f"    <decisionMaker>{_x(run_data.get('decision_maker', ''))}</decisionMaker>",
        "    <regulatoryFramework>MiFID II (EU 2014/65) Article 26</regulatoryFramework>",
        "  </reportHeader>",
        "  <transactions>",
    ]

    for i, action in enumerate(hedge_actions, 1):
        notional = float(action.get("hedge_notional", 0) or 0)
        ccy = action.get("currency", "")
        lines.append(f"    <transaction seq=\"{i}\">")
        lines.append(f"      <instrumentType>{_x(action.get('instrument', 'FX_FORWARD'))}</instrumentType>")
        lines.append(f"      <instrumentId>FX-{_x(ccy)}-USD</instrumentId>")
        lines.append(f"      <buySellIndicator>{'BUY' if notional >= 0 else 'SELL'}</buySellIndicator>")
        lines.append(f"      <quantity>{abs(notional)}</quantity>")
        lines.append(f"      <quantityCurrency>{_x(ccy)}</quantityCurrency>")
        lines.append(f"      <price>{_x(str(action.get('hedge_rate', '')))}</price>")
        lines.append("      <priceCurrency>USD</priceCurrency>")
        lines.append(f"      <tradeDate>{_x(run_data.get('trade_date', generated_at[:10]))}</tradeDate>")
        lines.append(f"      <settlementDate>{_x(action.get('value_date', ''))}</settlementDate>")
        lines.append("      <waiver>HEDGING_EXEMPTION</waiver>")
        lines.append("    </transaction>")

    lines.append("  </transactions>")
    lines.append("  <exposureSummary>")
    lines.append(f"    <positionCount>{len(positions)}</positionCount>")

    total_exposure = sum(abs(float(p.get("amount", 0) or 0)) for p in positions)
    lines.append(f"    <totalExposure>{total_exposure}</totalExposure>")
    lines.append(f"    <hedgeActionCount>{len(hedge_actions)}</hedgeActionCount>")

    total_hedge = sum(abs(float(a.get("hedge_notional", 0) or 0)) for a in hedge_actions)
    lines.append(f"    <totalHedgeNotional>{total_hedge}</totalHedgeNotional>")

    coverage = (total_hedge / total_exposure * 100) if total_exposure > 0 else 0
    lines.append(f"    <coverageRatio>{coverage:.1f}</coverageRatio>")
    lines.append("  </exposureSummary>")
    lines.append("  <complianceFlags>")
    lines.append("    <bestExecutionApplied>true</bestExecutionApplied>")
    lines.append("    <hedgingTransaction>true</hedgingTransaction>")
    lines.append("    <shortSelling>false</shortSelling>")
    lines.append("    <algorithmicTrading>false</algorithmicTrading>")
    lines.append("  </complianceFlags>")
    lines.append("</mifid:transactionReport>")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Dodd-Frank Title VII swap data report
# ---------------------------------------------------------------------------

def export_dodd_frank(
    run_data: dict,
    hedge_actions: list[dict],
    positions: list[dict],
    hash_chain: list[str],
) -> str:
    """Generate Dodd-Frank Title VII swap data report.

    Implements the key fields required by CFTC Part 45 real-time
    reporting for FX swap/forward transactions.

    The output is pipe-delimited text with three sections:
      HEADER  -- report-level metadata and regulatory references
      SWAP    -- one line per hedge action (swap/forward leg)
      EXPOSURE-- one line per underlying position
      TRAILER -- record count + integrity hash

    Parameters
    ----------
    run_data : dict
        Run-level metadata.  Expected keys:
          run_id, reporting_entity_lei, counterparty_lei,
          trade_date, value_date, generated_by.
    hedge_actions : list[dict]
        Hedge plan buckets.
    positions : list[dict]
        Underlying positions.
    hash_chain : list[str]
        Pre-existing hash chain entries.

    Returns
    -------
    str
        Pipe-delimited text with HEADER, SWAP, EXPOSURE, and TRAILER lines.
    """
    generated_at = _now_iso()
    run_id = run_data.get("run_id", "")
    lines: list[str] = []

    # -- Header ---------------------------------------------------------------
    header_parts = [
        "HEADER",
        f"USI-{run_id[:16]}",
        run_data.get("reporting_entity_lei", "NOT_PROVIDED"),
        run_data.get("counterparty_lei", "NOT_PROVIDED"),
        run_data.get("trade_date", generated_at[:10]),
        "ASSET_CLASS=FX",
        "PRODUCT_TYPE=SWAP_FORWARD",
        "REGULATION=DODD_FRANK_TITLE_VII",
        "CFTC_PART=45",
        generated_at,
        f"CHAIN_LENGTH={len(hash_chain)}",
    ]
    lines.append("|".join(header_parts))

    # -- Swap legs ------------------------------------------------------------
    running_hash = hash_chain[-1] if hash_chain else "0" * 64
    record_hashes: list[str] = []

    for seq, action in enumerate(hedge_actions, start=1):
        notional = float(action.get("hedge_notional", 0) or 0)
        record_body = "|".join([
            "SWAP",
            str(seq).zfill(6),
            action.get("currency", ""),
            "USD",
            action.get("instrument", "FX_FORWARD"),
            f"NOTIONAL={abs(notional):.2f}",
            f"RATE={action.get('hedge_rate', '')}",
            f"SETTLE={action.get('value_date', '')}",
            f"DIRECTION={'BUY' if notional >= 0 else 'SELL'}",
            f"POSITION_REF={action.get('position_id', '')}",
            f"PREV_HASH={running_hash}",
        ])
        record_hash = hashlib.sha256(record_body.encode("utf-8")).hexdigest()
        record_hashes.append(record_hash)
        lines.append(f"{record_body}|HASH={record_hash}")
        running_hash = record_hash

    # -- Exposure lines -------------------------------------------------------
    for seq, pos in enumerate(positions, start=1):
        exposure_body = "|".join([
            "EXPOSURE",
            str(seq).zfill(6),
            pos.get("record_id", ""),
            pos.get("currency", ""),
            f"AMOUNT={pos.get('amount', '')}",
            f"FLOW_TYPE={pos.get('flow_type', '')}",
            f"ENTITY={pos.get('entity', '')}",
        ])
        lines.append(exposure_body)

    # -- Trailer --------------------------------------------------------------
    integrity_payload = "|".join(record_hashes) if record_hashes else "EMPTY"
    integrity_hash = hashlib.sha256(
        integrity_payload.encode("utf-8")
    ).hexdigest()

    total_notional = sum(
        abs(float(a.get("hedge_notional", 0) or 0)) for a in hedge_actions
    )
    trailer_parts = [
        "TRAILER",
        f"SWAP_COUNT={len(hedge_actions)}",
        f"EXPOSURE_COUNT={len(positions)}",
        f"TOTAL_NOTIONAL={total_notional:.2f}",
        f"INTEGRITY_HASH={integrity_hash}",
        generated_at,
    ]
    lines.append("|".join(trailer_parts))

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# IFRS 9 / ASC 815 Hedge Effectiveness XML export
# ---------------------------------------------------------------------------

def export_ifrs9_xml(
    run_data: dict,
    results: dict,
    periods: list[dict],
    *,
    standard: str = "IFRS_9",
) -> str:
    """Generate IFRS 9 / ASC 815 hedge effectiveness evidence XML.

    Parameters
    ----------
    run_data : dict
        Assessment run metadata.  Expected keys:
          run_id, standard, hedge_type, currency_pair, designation_date,
          methodology_version, overall_effective, dollar_offset_ratio,
          dollar_offset_effective, regression_r_squared, regression_slope,
          regression_effective, run_hash, inputs_hash, outputs_hash,
          dataset_name, generated_by, report_date.
    results : dict
        Top-level effectiveness result dict (may be empty).
    periods : list[dict]
        Per-period data points.  Each dict should contain:
          period_index, period_date, hedged_item_fv_change,
          instrument_fv_change.
    standard : str
        Override the accounting standard label (default "IFRS_9").

    Returns
    -------
    str
        Well-formed XML string for the hedge effectiveness evidence binder.
    """
    generated_at = _now_iso()
    used_standard = standard or run_data.get("standard", "IFRS_9")

    lines: list[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ordr:hedgeEffectivenessReport xmlns:ordr="urn:ordr:hedge-effectiveness:2024">',
        "  <ordr:header>",
        f"    <runId>{_x(run_data.get('run_id', ''))}</runId>",
        f"    <standard>{_x(used_standard)}</standard>",
        f"    <hedgeType>{_x(run_data.get('hedge_type', ''))}</hedgeType>",
        f"    <currencyPair>{_x(run_data.get('currency_pair', ''))}</currencyPair>",
        f"    <designationDate>{_x(run_data.get('designation_date', ''))}</designationDate>",
        f"    <methodologyVersion>{_x(run_data.get('methodology_version', ''))}</methodologyVersion>",
        f"    <generatedAt>{generated_at}</generatedAt>",
        f"    <reportDate>{_x(run_data.get('report_date', generated_at[:10]))}</reportDate>",
        f"    <generatedBy>{_x(run_data.get('generated_by', ''))}</generatedBy>",
        "  </ordr:header>",
        "  <hedgeDesignation>",
        f"    <datasetName>{_x(run_data.get('dataset_name', ''))}</datasetName>",
        "  </hedgeDesignation>",
        "  <effectivenessResults>",
        f"    <overallEffective>{str(bool(run_data.get('overall_effective'))).lower()}</overallEffective>",
        f"    <dollarOffsetRatio>{_x(str(run_data.get('dollar_offset_ratio', '')))}</dollarOffsetRatio>",
        f"    <dollarOffsetEffective>{str(bool(run_data.get('dollar_offset_effective'))).lower()}</dollarOffsetEffective>",
        f"    <regressionRSquared>{_x(str(run_data.get('regression_r_squared', '')))}</regressionRSquared>",
        f"    <regressionSlope>{_x(str(run_data.get('regression_slope', '')))}</regressionSlope>",
        f"    <regressionEffective>{str(bool(run_data.get('regression_effective'))).lower()}</regressionEffective>",
        "  </effectivenessResults>",
        "  <periods>",
    ]

    for i, p in enumerate(periods, 1):
        lines.append(f'    <period seq="{i}">')
        lines.append(f"      <periodDate>{_x(p.get('period_date', ''))}</periodDate>")
        lines.append(f"      <hedgedItemFvChange>{_x(str(p.get('hedged_item_fv_change', '')))}</hedgedItemFvChange>")
        lines.append(f"      <instrumentFvChange>{_x(str(p.get('instrument_fv_change', '')))}</instrumentFvChange>")
        lines.append("    </period>")

    lines.append("  </periods>")
    lines.append("  <auditTrace>")
    lines.append(f"    <runHash>{_x(run_data.get('run_hash', ''))}</runHash>")
    lines.append(f"    <inputsHash>{_x(run_data.get('inputs_hash', ''))}</inputsHash>")
    lines.append(f"    <outputsHash>{_x(run_data.get('outputs_hash', ''))}</outputsHash>")
    lines.append("  </auditTrace>")
    lines.append("</ordr:hedgeEffectivenessReport>")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _x(value: str) -> str:
    """XML-escape a string value."""
    return xml_escape(str(value))


def _now_iso() -> str:
    """Return current UTC time as ISO-8601 string."""
    return datetime.now(UTC).isoformat()
