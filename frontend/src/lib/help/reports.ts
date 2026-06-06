import type { ModuleHelp } from "@/lib/help/types";

export const REPORTS_HELP: ModuleHelp = {
  moduleId: "reports",
  pageTitle: "Reports",
  pageSubtitle: "TREASURY REPORTING · IFRS 9 · AUDIT READY",
  sections: [
    {
      id: "reports-overview",
      anchor: "reports-overview",
      title: "Reports Overview",
      icon: "FileText",
      level: 1,
      type: "text",
      verified: true,
      codeRefs: [{ file: "frontend/src/app/reports/page.tsx" }],
      content:
        "The Reports module provides 30 preset report templates spanning hedge effectiveness, exposure summaries, policy compliance, and counterparty concentration analysis. " +
        "Each template is pre-configured with the correct calculation methodology and data joins so that treasury teams can generate audit-ready output in seconds rather than hours.\n\n" +
        "An AI-assisted narrative layer synthesises key metrics into plain-language commentary suitable for board packs and committee submissions. Narrative generation does not modify underlying data — it is a read-only summarisation pass over the already-computed figures.\n\n" +
        "Supported output formats are PDF (formatted for print), XLSX (with formula-linked cells), and CSV (raw data for downstream systems). All report runs are logged in the immutable audit trail, preserving the parameters used so that any output can be reproduced identically at a future date.",
    },
    {
      id: "reports-generate-workflow",
      anchor: "reports-generate-workflow",
      title: "Generating a Report",
      icon: "Play",
      level: 2,
      type: "workflow",
      verified: true,
      codeRefs: [{ file: "frontend/src/app/reports/page.tsx" }],
      steps: [
        {
          step: 1,
          label: "Select Template",
          description:
            "Choose one of the 30 preset templates from the template gallery. Templates are grouped by category: Hedge Effectiveness, Exposure, Policy Compliance, Counterparty, and Regulatory. Hover a template card to see a description of its scope and required permissions.",
        },
        {
          step: 2,
          label: "Set Date Range",
          description:
            "Define the reporting period using the date-range picker. The from-date and to-date are inclusive. For period-end reports, align the to-date with the accounting period close. Some templates enforce a maximum date range (e.g. effectiveness reports: 365 days).",
        },
        {
          step: 3,
          label: "Apply Filters",
          description:
            "Optionally filter by branch, currency pair, or counterparty. Users without reports.view_all_branches permission are restricted to their own branch's data. Leave filters blank to include all data within your permission scope.",
        },
        {
          step: 4,
          label: "Generate",
          description:
            "Click Generate. The server computes the report from live database state. For large date ranges or high-volume data, generation may take 5–30 seconds. A progress indicator is displayed; do not navigate away.",
        },
        {
          step: 5,
          label: "Download PDF / XLSX",
          description:
            "Once generated, the report preview appears inline. Use the Download button to save in your chosen format (PDF, XLSX, or CSV). The download action is logged separately in audit_events with the same report parameters.",
        },
      ],
    },
    {
      id: "reports-variables",
      anchor: "reports-variables",
      title: "Report Variables",
      icon: "SlidersHorizontal",
      level: 2,
      type: "variables",
      verified: true,
      codeRefs: [{ file: "frontend/src/app/reports/page.tsx" }],
      variables: [
        {
          name: "report_type",
          type: "string (enum)",
          description:
            "Identifies which of the 30 preset templates to run. Determines the query plan, aggregation logic, and output schema.",
          example: "hedge_effectiveness_summary",
          source: "Template gallery selection",
        },
        {
          name: "date_from",
          type: "ISO 8601 date",
          description:
            "Inclusive start of the reporting period. Filters positions, calculation runs, and ledger entries by their effective date.",
          example: "2025-01-01",
          source: "Date-range picker",
        },
        {
          name: "date_to",
          type: "ISO 8601 date",
          description:
            "Inclusive end of the reporting period. Must be ≥ date_from. For month-end reports, use the last calendar day of the month.",
          example: "2025-03-31",
          source: "Date-range picker",
        },
        {
          name: "branch_filter",
          type: "UUID | null",
          description:
            "Restricts report data to a single branch. Requires reports.view_all_branches permission to select a branch other than the requesting user's own branch. Null = all accessible branches.",
          example: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          source: "Branch filter dropdown",
        },
        {
          name: "currency_filter",
          type: "string (ISO 4217) | null",
          description:
            "Limits output to a specific currency pair (e.g. EURUSD). Null includes all currency pairs within scope.",
          example: "EURUSD",
          source: "Currency filter dropdown",
        },
        {
          name: "format",
          type: "\"PDF\" | \"XLSX\" | \"CSV\"",
          description:
            "Output format for the downloaded report. PDF is formatted for print and board packs. XLSX includes formula-linked cells. CSV is raw data for import into external systems.",
          example: "PDF",
          source: "Format selector",
        },
        {
          name: "include_unrealised_flag",
          type: "boolean",
          description:
            "When true, unrealised mark-to-market gains and losses on open hedging instruments are included in effectiveness calculations and P&L summaries. Defaults to false (realised only).",
          example: "true",
          source: "Report options panel",
        },
      ],
    },
    {
      id: "reports-effectiveness-formula",
      anchor: "reports-effectiveness-formula",
      title: "Effectiveness Calculation",
      icon: "Calculator",
      level: 3,
      type: "formula",
      verified: true,
      codeRefs: [{ file: "frontend/src/lib/mathEngine.ts" }],
      formulas: [
        {
          label: "Hedge Effectiveness Ratio",
          latex:
            "E = \\frac{\\text{hedge\\_pnl\\_offset}}{|\\text{portfolio\\_pnl}|}",
          explanation:
            "Effectiveness E is the ratio of the hedging instrument's P&L offset to the absolute P&L of the hedged item. A perfect hedge yields E = 1.0 (100%). Values below 0.80 or above 1.25 fall outside the IFRS 9 bright-line and trigger a compliance alert.",
          source: "IFRS 9 §6.4.1, Appendix B6.4",
          codeRef: { file: "frontend/src/lib/mathEngine.ts" },
        },
        {
          label: "Effectiveness Clamp",
          latex: "E_{\\text{clamped}} = \\min(\\max(E,\\, 0),\\, 2.0)",
          explanation:
            "Raw effectiveness is clamped to [0, 2.0] before display and storage to prevent division-by-near-zero artefacts from distorting dashboards. A clamped value above 1.25 still triggers the IFRS 9 bright-line warning.",
          source: "Internal implementation",
          codeRef: { file: "frontend/src/lib/mathEngine.ts" },
        },
        {
          label: "IFRS 9 Bright-Line Test",
          latex: "0.80 \\leq E \\leq 1.25 \\implies \\text{PASS}",
          explanation:
            "Per IFRS 9 §B6.4.12, a hedge relationship is considered highly effective if the offset ratio lies within 80%–125%. Failure does not automatically discontinue the hedge but must be documented and escalated per the entity's hedging policy.",
          source: "IFRS 9 §B6.4.12",
          codeRef: { file: "frontend/src/lib/mathEngine.ts" },
        },
      ],
    },
    {
      id: "reports-blackscholes-formula",
      anchor: "reports-blackscholes-formula",
      title: "Black-Scholes Option Pricing",
      icon: "TrendingUp",
      level: 3,
      type: "formula",
      verified: true,
      codeRefs: [{ file: "frontend/src/lib/mathEngine.ts" }],
      callout: {
        type: "info",
        text:
          "The ORDR Treasury uses the Garman-Kohlhagen extension of Black-Scholes for FX options, incorporating domestic and foreign risk-free rates. The equations below show the canonical Black-Scholes form; the GK extension replaces S with S·e^(−r_f·T).",
      },
      formulas: [
        {
          label: "d1",
          latex:
            "d_1 = \\frac{\\ln(S/K) + \\left(r + \\tfrac{\\sigma^2}{2}\\right)T}{\\sigma\\sqrt{T}}",
          explanation:
            "d1 is the standardised distance of the current spot price S from the strike K, adjusted for drift (r) and diffusion (σ) over time horizon T (in years). A higher d1 implies greater probability of expiring in-the-money.",
          source: "Black & Scholes (1973)",
          codeRef: { file: "frontend/src/lib/mathEngine.ts" },
        },
        {
          label: "d2",
          latex: "d_2 = d_1 - \\sigma\\sqrt{T}",
          explanation:
            "d2 is the risk-neutral probability that the option expires in-the-money, expressed in standard-normal units.",
          source: "Black & Scholes (1973)",
          codeRef: { file: "frontend/src/lib/mathEngine.ts" },
        },
        {
          label: "European Call Price",
          latex:
            "C = S \\cdot N(d_1) - K \\cdot e^{-rT} \\cdot N(d_2)",
          explanation:
            "C is the fair value of a European call option. N(·) is the standard normal CDF. The first term is the probability-weighted present value of receiving the asset; the second is the probability-weighted present value of paying the strike.",
          source: "Black & Scholes (1973)",
          codeRef: { file: "frontend/src/lib/mathEngine.ts" },
        },
        {
          label: "Garman-Kohlhagen FX Extension",
          latex:
            "C_{\\text{GK}} = S \\cdot e^{-r_f T} \\cdot N(d_1) - K \\cdot e^{-r_d T} \\cdot N(d_2)",
          explanation:
            "The Garman-Kohlhagen model adjusts for the foreign risk-free rate r_f by discounting spot. r_d is the domestic risk-free rate. This is the model used for FX vanilla option pricing throughout the platform.",
          source: "Garman & Kohlhagen (1983)",
          codeRef: { file: "frontend/src/lib/mathEngine.ts" },
        },
      ],
    },
    {
      id: "reports-permissions",
      anchor: "reports-permissions",
      title: "Report Permissions",
      icon: "ShieldCheck",
      level: 4,
      type: "text",
      verified: true,
      codeRefs: [{ file: "backend/app/models/permission.py" }],
      content:
        "Access to reporting functionality is controlled by the platform's 41-permission RBAC system.\n\n" +
        "**reports.view** — Required to access the Reports module at all. Granted to senior_analyst, risk_analyst, supervisor, branch_manager, head_of_risk, cfo, ceo, and admin roles.\n\n" +
        "**reports.view_all_branches** — Required to generate reports spanning multiple branches or to select a branch other than the user's own. Granted to head_of_risk, cfo, ceo, and admin.\n\n" +
        "**reports.export** — Required to download report output (PDF, XLSX, CSV). Without this permission, the user can view the inline preview but the Download button is disabled. Granted to senior_analyst and above.\n\n" +
        "**auditor role** — The auditor role has read-only access to all reports across all branches, regardless of branch_filter, without requiring reports.view_all_branches. Auditors cannot generate new reports that modify system state.\n\n" +
        "Attempts to access reports or download data without the required permissions return HTTP 403 and are recorded in audit_events as a failed authorisation attempt.",
    },
    {
      id: "reports-audit-ready",
      anchor: "reports-audit-ready",
      title: "Audit-Ready Output",
      icon: "BookLock",
      level: 5,
      type: "text",
      verified: false,
      callout: {
        type: "regulatory",
        text:
          "IFRS 9.B6.4 compliance note: Hedge effectiveness reports generated by this platform reference calculation_run_id to link each effectiveness figure back to its source engine run. External auditors can verify the chain from the printed report to the WORM calculation_runs table and the SHA-256 hash chain without any intermediary.",
      },
      content:
        "Every report generation event is logged in audit_events with the requesting user_id, UTC timestamp, report_type, and full parameter set (date_from, date_to, filters, format). This means the exact inputs used to produce any historical output can be reconstructed and rerun to confirm reproducibility.\n\n" +
        "Hedge effectiveness reports embed the calculation_run_id of each contributing engine run directly in the output. This creates a direct, machine-verifiable traceability chain: printed report → calculation_run_id → WORM calculation_runs row → position → policy_instance → policy_revision → hash chain.\n\n" +
        "For IFRS 9 hedge documentation purposes, the platform's effectiveness reports are designed to satisfy §B6.4.1 through §B6.4.15 disclosure requirements. The numeric output should be reviewed by the entity's qualified accounting team before inclusion in financial statements.\n\n" +
        "Download events are logged separately so that both the generation and the distribution of sensitive treasury reports can be independently audited. Report data is never cached in the browser beyond the current session.",
    },
  ],
};
