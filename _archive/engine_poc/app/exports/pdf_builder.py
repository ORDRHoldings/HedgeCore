"""Bank Pack PDF generator using fpdf2."""

from __future__ import annotations

from fpdf import FPDF

from app.schemas.results import CalculateResponse


def render_bank_pack_pdf(result: CalculateResponse) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)

    # --- Title Page ---
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 24)
    pdf.cell(0, 20, "HedgeCalc Bank Pack", ln=True, align="C")
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(0, 10, f"Run ID: {result.run_id}", ln=True, align="C")
    pdf.cell(
        0, 10,
        f"Generated: {result.run_envelope.timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}",
        ln=True, align="C",
    )
    pdf.cell(0, 10, f"Engine: v{result.run_envelope.engine_version}", ln=True, align="C")
    pdf.ln(10)

    # --- Audit Hashes ---
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "Audit Trail", ln=True)
    pdf.set_font("Courier", "", 8)
    pdf.cell(0, 6, f"Inputs Hash:  {result.run_envelope.inputs_hash}", ln=True)
    pdf.cell(0, 6, f"Outputs Hash: {result.run_envelope.outputs_hash}", ln=True)
    pdf.ln(10)

    # --- Hedge Plan Table ---
    pdf.add_page("L")  # landscape for wide table
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "Hedge Plan by Bucket", ln=True)

    headers = [
        "Bucket", "Confirmed", "Forecast", "Commercial",
        "Existing", "Target", "Action", "Direction",
        "Fwd Rate", "Action USD", "Friction", "Suppressed",
        "Hedge Pos", "Residual",
    ]
    col_w = [18, 20, 20, 22, 20, 20, 20, 24, 16, 20, 16, 14, 20, 20]

    pdf.set_font("Helvetica", "B", 6)
    for i, h in enumerate(headers):
        pdf.cell(col_w[i], 6, h, border=1, align="C")
    pdf.ln()

    pdf.set_font("Helvetica", "", 6)
    for b in result.hedge_plan.buckets:
        vals = [
            b.bucket,
            f"{b.confirmed_flow_mxn:,.0f}",
            f"{b.forecast_flow_mxn:,.0f}",
            f"{b.commercial_exposure_mxn:,.0f}",
            f"{b.existing_hedges_mxn:,.0f}",
            f"{b.target_signed_mxn:,.0f}",
            f"{b.action_mxn:,.0f}",
            b.action_direction or "-",
            f"{b.forward_rate:.4f}",
            f"{b.action_usd:,.0f}",
            f"{b.friction_usd:,.2f}",
            "Y" if b.suppressed else "N",
            f"{b.hedge_position_mxn:,.0f}",
            f"{b.residual_mxn:,.0f}",
        ]
        for i, v in enumerate(vals):
            pdf.cell(col_w[i], 5, v, border=1, align="R" if i > 0 else "C")
        pdf.ln()

    # Summary row
    s = result.hedge_plan.summary
    pdf.set_font("Helvetica", "B", 6)
    summary_vals = [
        "TOTAL", "", "", f"{s.total_commercial_exposure_mxn:,.0f}",
        f"{s.total_existing_hedges_mxn:,.0f}", "",
        f"{s.total_action_mxn:,.0f}", "",
        "", f"{s.total_action_usd:,.0f}",
        f"{s.total_friction_usd:,.2f}", "",
        f"{s.total_hedge_position_mxn:,.0f}",
        f"{s.total_residual_mxn:,.0f}",
    ]
    for i, v in enumerate(summary_vals):
        pdf.cell(col_w[i], 5, v, border=1, align="R" if i > 0 else "C")
    pdf.ln(10)

    # --- Scenario Results ---
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "Scenario Analysis", ln=True)

    scen_headers = ["Sigma", "Shocked Spot", "Unhedged USD", "Hedged USD", "Benefit USD"]
    scen_w = [25, 30, 35, 35, 35]

    pdf.set_font("Helvetica", "B", 8)
    for i, h in enumerate(scen_headers):
        pdf.cell(scen_w[i], 7, h, border=1, align="C")
    pdf.ln()

    pdf.set_font("Helvetica", "", 8)
    for t in result.scenario_results.totals:
        vals = [
            f"{t.sigma:+.0%}",
            f"{t.shocked_spot:.4f}",
            f"{t.total_unhedged_usd:,.2f}",
            f"{t.total_hedged_usd:,.2f}",
            f"{t.total_hedge_benefit_usd:,.2f}",
        ]
        for i, v in enumerate(vals):
            pdf.cell(scen_w[i], 6, v, border=1, align="R")
        pdf.ln()

    return bytes(pdf.output())
