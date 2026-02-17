"""AuditPack.zip builder — bundles all JSON artifacts + PDF + Excel."""

from __future__ import annotations

import io
import json
import zipfile

from app.exports_v1.excel_builder import render_bank_pack_xlsx
from app.exports_v1.pdf_builder import render_bank_pack_pdf
from app.schemas_v1.results import CalculateResponse


def generate_exposure_ledger_csv(buckets: list) -> str:
    """Generate CSV from hedge plan buckets showing commercial exposure ledger."""
    rows = ["Bucket,Confirmed MXN,Forecast MXN,Commercial Exposure MXN,Existing Hedge MXN,Target Signed MXN"]

    for b in buckets:
        rows.append(
            f"{b.bucket},{b.confirmed_flow_mxn:.2f},{b.forecast_flow_mxn:.2f},"
            f"{b.commercial_exposure_mxn:.2f},{b.existing_hedges_mxn:.2f},{b.target_signed_mxn:.2f}"
        )

    return "\n".join(rows)


def generate_hedge_instruction_csv(buckets: list) -> str:
    """Generate execution instructions CSV."""
    rows = ["Bucket,Action MXN,Direction,Forward Rate,Friction USD,Suppressed"]

    for b in buckets:
        direction = b.action_direction if b.action_direction else "NONE"
        suppressed = "TRUE" if b.suppressed else "FALSE"
        rows.append(
            f"{b.bucket},{b.action_mxn:.2f},{direction},"
            f"{b.forward_rate:.6f},{b.friction_usd:.2f},{suppressed}"
        )

    return "\n".join(rows)


def build_audit_zip(result: CalculateResponse) -> bytes:
    buf = io.BytesIO()

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # JSON artifacts
        zf.writestr(
            "ValidationReport.json",
            json.dumps(result.validation_report.model_dump(mode="json"), indent=2, default=str),
        )
        zf.writestr(
            "HedgePlan.json",
            json.dumps(result.hedge_plan.model_dump(mode="json"), indent=2, default=str),
        )
        zf.writestr(
            "ScenarioResults.json",
            json.dumps(result.scenario_results.model_dump(mode="json"), indent=2, default=str),
        )
        zf.writestr(
            "RunEnvelope.json",
            json.dumps(result.run_envelope.model_dump(mode="json"), indent=2, default=str),
        )
        zf.writestr(
            "TraceLite.json",
            json.dumps(result.trace_lite.model_dump(mode="json"), indent=2, default=str),
        )

        # CSV exports
        zf.writestr("ExposureLedger.csv", generate_exposure_ledger_csv(result.hedge_plan.buckets))
        zf.writestr("HedgeInstruction.csv", generate_hedge_instruction_csv(result.hedge_plan.buckets))

        # PDF and Excel
        zf.writestr("BankPack.pdf", render_bank_pack_pdf(result))
        zf.writestr("BankPack.xlsx", render_bank_pack_xlsx(result))

        # ReadMe.txt with determinism statement
        readme_content = f"""HEDGECALC AUDIT PACK
Run ID: {result.run_id}
Timestamp: {result.run_envelope.timestamp}
Engine Version: {result.run_envelope.engine_version}

CONTENTS:
- HedgePlan.json: Complete hedge plan with bucket-level detail
- ScenarioResults.json: Scenario analysis outputs across sigma ranges
- ValidationReport.json: Input validation results and warnings
- RunEnvelope.json: Execution metadata and cryptographic hashes
- TraceLite.json: Execution trace log for auditability
- ExposureLedger.csv: Commercial exposure ledger by time bucket
- HedgeInstruction.csv: Execution instructions by bucket
- BankPack.pdf: Formatted hedge plan report (printable)
- BankPack.xlsx: Excel workbook with hedge plan and scenarios

DETERMINISM STATEMENT:
This audit pack represents a fully deterministic calculation. Given identical inputs
(trades, hedges, market, policy), the HedgeCalc engine will produce byte-identical outputs.
All data is cryptographically hashed and traceable via the RunEnvelope.

CRYPTOGRAPHIC HASHES:
Policy Hash:  {result.run_envelope.policy_hash}
Trades Hash:  {result.run_envelope.trades_hash}
Hedges Hash:  {result.run_envelope.hedges_hash}
Market Hash:  {result.run_envelope.market_hash}
Inputs Hash:  {result.run_envelope.inputs_hash}
Outputs Hash: {result.run_envelope.outputs_hash}

VERIFICATION:
To verify determinism, re-run the engine with the same inputs and compare output hashes.
The engine guarantees reproducibility across all versions with matching engine_version.

For questions or audit inquiries, contact: hedgecalc-support@synexiun.com
"""
        zf.writestr("ReadMe.txt", readme_content)

    return buf.getvalue()
