"""AuditPack.zip builder — bundles all JSON artifacts + PDF + Excel."""

from __future__ import annotations

import io
import json
import zipfile

from app.exports.excel_builder import render_bank_pack_xlsx
from app.exports.pdf_builder import render_bank_pack_pdf
from app.schemas.results import CalculateResponse


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

        # PDF and Excel
        zf.writestr("BankPack.pdf", render_bank_pack_pdf(result))
        zf.writestr("BankPack.xlsx", render_bank_pack_xlsx(result))

    return buf.getvalue()
