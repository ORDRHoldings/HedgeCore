/**
 * /api/report-ai — AI Report Builder
 *
 * Deterministic, governed AI assistance for Report Studio.
 * Governance rules:
 * - NEVER invents numbers or metrics
 * - ONLY composes sections, narrative scaffolding, and section selection
 * - All AI output is labeled ai_assisted: true
 * - Must cite internal artifact IDs (run_id, policy_id, snapshot_id)
 * - Auto-appends DISCLOSURES and ASSUMPTIONS_REGISTRY sections
 * - Output is an editable proposal — never auto-applied
 */

import { NextRequest, NextResponse } from "next/server";
import type { AIReportGoal, AIReportPlan, ReportModule, SectionType } from "../../../types/reportTypes";

// Simple UUID v4 — no external dep
function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Goal → default section mapping ───────────────────────────────────────────

const GOAL_SECTIONS: Record<AIReportGoal, SectionType[]> = {
  BOARD_UPDATE:         ["COVER_PAGE","TABLE_OF_CONTENTS","EXECUTIVE_SUMMARY","EXPOSURE_DECOMPOSITION","HEDGE_PLAN_TABLE","SCENARIO_SENSITIVITY","POLICY_COMPLIANCE","DISCLOSURES"],
  AUDIT_PACK:           ["COVER_PAGE","TABLE_OF_CONTENTS","AUDIT_EVENTS","APPROVAL_CHAIN","POLICY_RATIONALE","DATA_QUALITY","ASSUMPTIONS_REGISTRY","DISCLOSURES"],
  FX_HEDGE_RATIONALE:   ["COVER_PAGE","EXECUTIVE_SUMMARY","EXPOSURE_DECOMPOSITION","HEDGE_PLAN_TABLE","FORWARD_CURVE","POLICY_COMPLIANCE","HEDGE_EFFICIENCY","DISCLOSURES"],
  STRESS_SUMMARY:       ["EXECUTIVE_SUMMARY","STRESS_TEST_RESULTS","SCENARIO_SENSITIVITY","HEDGE_EFFICIENCY","ASSUMPTIONS_REGISTRY","DISCLOSURES"],
  POLICY_REVIEW:        ["COVER_PAGE","POLICY_RATIONALE","POLICY_COMPLIANCE","APPROVAL_CHAIN","ASSUMPTIONS_REGISTRY","DISCLOSURES"],
  EXECUTION_SUMMARY:    ["EXECUTIVE_SUMMARY","EXECUTION_LOG","APPROVAL_CHAIN","AUDIT_EVENTS","DISCLOSURES"],
  RISK_COMMITTEE_PACK:  ["COVER_PAGE","TABLE_OF_CONTENTS","EXECUTIVE_SUMMARY","SCENARIO_SENSITIVITY","STRESS_TEST_RESULTS","POLICY_COMPLIANCE","HEDGE_EFFICIENCY","MACRO_OVERLAY","DISCLOSURES"],
  QUARTERLY_TREASURY:   ["COVER_PAGE","TABLE_OF_CONTENTS","EXECUTIVE_SUMMARY","EXPOSURE_DECOMPOSITION","HEDGE_PLAN_TABLE","FORWARD_CURVE","HEDGE_EFFICIENCY","SCENARIO_SENSITIVITY","POLICY_COMPLIANCE","DISCLOSURES"],
  CUSTOM:               ["EXECUTIVE_SUMMARY","DISCLOSURES"],
};

const SECTION_TITLES: Record<SectionType, string> = {
  EXECUTIVE_SUMMARY:     "Executive Summary",
  HEDGE_PLAN_TABLE:      "Hedge Plan",
  EXPOSURE_DECOMPOSITION:"Exposure Decomposition",
  SCENARIO_SENSITIVITY:  "Scenario Sensitivity",
  POLICY_COMPLIANCE:     "Policy Compliance",
  HEDGE_EFFICIENCY:      "Hedge Effectiveness",
  FORWARD_CURVE:         "Forward Curve & Carry",
  CONNECTOR_HEALTH:      "Connector Health",
  DATA_QUALITY:          "Data Quality",
  POSITION_REGISTER:     "Position Register",
  EXECUTION_LOG:         "Execution Log",
  APPROVAL_CHAIN:        "Approval Chain",
  POLICY_RATIONALE:      "Policy Rationale",
  STRESS_TEST_RESULTS:   "Stress Test Results",
  MACRO_OVERLAY:         "Macro & Geopolitical Overlay",
  AUDIT_EVENTS:          "Audit Events",
  DISCLOSURES:           "Disclosures & Assumptions",
  ASSUMPTIONS_REGISTRY:  "Assumptions Registry",
  COVER_PAGE:            "Cover Page",
  TABLE_OF_CONTENTS:     "Table of Contents",
  CUSTOM_NARRATIVE:      "Custom Narrative",
};

// ─── System prompt — governance-constrained ────────────────────────────────────

const SYSTEM_PROMPT = `You are the ORDR Report Studio AI assistant.

HARD CONSTRAINTS — you MUST follow these absolutely:
1. You NEVER invent, estimate, or approximate numeric data (rates, exposures, P&L, hedge ratios, VaR, etc.).
2. You NEVER modify calculated results. You only compose narrative scaffolding around data that will be injected at render time.
3. Every narrative you write uses placeholder tokens like [TOTAL_EXPOSURE], [HEDGE_RATIO], [RUN_ID] — never hardcoded numbers.
4. Every AI-generated narrative block must begin with "AI-ASSISTED NARRATIVE:" so the UI can label it.
5. You always cite internal artifact IDs provided by the user (run_id, policy_id, snapshot_id, connector_run_ids).
6. You always propose to include a DISCLOSURES section and ASSUMPTIONS_REGISTRY section.
7. Your output is a PROPOSAL — the user edits it before finalising.
8. If the user asks you to invent data, politely decline and explain the governance rule.

STYLE:
- Institutional, precise, bank-grade English.
- No marketing language. No hedging ("may", "might"). Use definitive factual framing.
- Tables and bullet points preferred over prose paragraphs.
- Maximum one paragraph per section narrative scaffold.

OUTPUT FORMAT (JSON only):
Return a JSON object matching this schema exactly:
{
  "goal": string,
  "goal_description": string,
  "selected_modules": string[],
  "proposed_sections": [
    {
      "type": string,
      "title": string,
      "order": number,
      "status": "INCLUDED",
      "params": [],
      "ai_assisted": boolean,
      "citations": string[],
      "page_break_before": boolean,
      "narrative": string  // only for sections where ai_assisted = true
    }
  ],
  "narrative_scaffolds": { [section_type]: string },
  "disclosures_generated": string[],
  "citations": string[]
}`;

// ─── Request shape ─────────────────────────────────────────────────────────────

interface AIReportRequest {
  goal: AIReportGoal;
  goal_description: string;
  selected_modules: ReportModule[];
  bindings: {
    run_envelope_id?: string;
    policy_id?: string;
    policy_version?: number;
    market_snapshot_id?: string;
    portfolio_snapshot_id?: string;
    connector_run_ids?: string[];
    as_of_date?: string;
    reporting_currency?: string;
    period_start?: string;
    period_end?: string;
  };
  extra_instructions?: string;
}

// ─── Fallback — deterministic plan without AI ──────────────────────────────────

function buildFallbackPlan(req: AIReportRequest): AIReportPlan {
  const sections = (GOAL_SECTIONS[req.goal] ?? GOAL_SECTIONS.CUSTOM).map((type, i) => ({
    type,
    title: SECTION_TITLES[type],
    order: i,
    status: "INCLUDED" as const,
    params: [],
    ai_assisted: type === "EXECUTIVE_SUMMARY" || type === "MACRO_OVERLAY",
    citations: [
      req.bindings.run_envelope_id ? `run_id:${req.bindings.run_envelope_id}` : null,
      req.bindings.policy_id ? `policy_id:${req.bindings.policy_id}` : null,
      req.bindings.market_snapshot_id ? `market_snapshot_id:${req.bindings.market_snapshot_id}` : null,
    ].filter(Boolean) as string[],
    page_break_before: i > 0 && ["EXECUTIVE_SUMMARY", "EXPOSURE_DECOMPOSITION", "SCENARIO_SENSITIVITY", "DISCLOSURES"].includes(type),
  }));

  return {
    plan_id: uuidv4(),
    goal: req.goal,
    goal_description: req.goal_description,
    selected_modules: req.selected_modules,
    proposed_sections: sections,
    narrative_scaffolds: {
      EXECUTIVE_SUMMARY: "AI-ASSISTED NARRATIVE: This report covers the FX hedge position as of [AS_OF_DATE]. Total commercial exposure stands at [TOTAL_EXPOSURE_MXN] MXN. The hedge plan targets [HEDGE_RATIO_TARGET]% coverage of confirmed flows and [FORECAST_RATIO]% of forecast flows per Policy [POLICY_ID] v[POLICY_VERSION]. See Section 3 for detailed hedge plan and Section 5 for stress scenario results.",
      MACRO_OVERLAY: "AI-ASSISTED NARRATIVE: Macro context as of [AS_OF_DATE]. Geopolitical and central bank risk factors affecting [CURRENCY_PAIRS] are summarised below. This overlay is informational and does not constitute a forecast.",
    },
    disclosures_generated: [
      "This report is generated by ORDR and is intended for internal use only. It does not constitute financial, legal, or regulatory advice.",
      "All FX rates and forward points are sourced from [MARKET_SOURCE] as of [AS_OF_DATE]. Live rates are marked LIVE; fallback rates are marked INDICATIVE.",
      "Hedge effectiveness analysis references IFRS 9.6.4.1 criteria. Compliance with hedge accounting standards must be confirmed by qualified accountants.",
      "Stress scenarios are calibrated to historical crisis events for illustrative purposes. Past events do not guarantee future outcomes.",
      "This report references Run ID [RUN_ID] and is reproducible from the same inputs snapshot. Output hash: [OUTPUTS_HASH].",
    ],
    citations: [
      req.bindings.run_envelope_id ? `run_id:${req.bindings.run_envelope_id}` : "run_id:UNBOUND",
      req.bindings.policy_id ? `policy_id:${req.bindings.policy_id}` : "policy_id:UNBOUND",
      req.bindings.market_snapshot_id ? `market_snapshot_id:${req.bindings.market_snapshot_id}` : "market_snapshot_id:UNBOUND",
    ],
    model_version: "fallback-deterministic-v1",
    generated_at: new Date().toISOString(),
    is_ai_assisted: true,
  };
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: AIReportRequest = await req.json();

    if (!body.goal || !body.selected_modules || body.selected_modules.length === 0) {
      return NextResponse.json(
        { error: "goal and selected_modules are required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // No API key — return deterministic fallback plan
      return NextResponse.json({ plan: buildFallbackPlan(body), source: "fallback" });
    }

    // Build artifact citations string for the prompt
    const artifactCitations = [
      body.bindings.run_envelope_id ? `Run ID: ${body.bindings.run_envelope_id}` : null,
      body.bindings.policy_id ? `Policy ID: ${body.bindings.policy_id} v${body.bindings.policy_version ?? "latest"}` : null,
      body.bindings.market_snapshot_id ? `Market Snapshot: ${body.bindings.market_snapshot_id}` : null,
      body.bindings.portfolio_snapshot_id ? `Portfolio Snapshot: ${body.bindings.portfolio_snapshot_id}` : null,
      body.bindings.connector_run_ids?.length ? `Connector Runs: ${body.bindings.connector_run_ids.join(", ")}` : null,
      body.bindings.as_of_date ? `As-of Date: ${body.bindings.as_of_date}` : null,
      body.bindings.reporting_currency ? `Reporting Currency: ${body.bindings.reporting_currency}` : null,
    ].filter(Boolean).join("\n");

    const suggestedSections = (GOAL_SECTIONS[body.goal] ?? GOAL_SECTIONS.CUSTOM)
      .map(s => SECTION_TITLES[s]).join(", ");

    const userPrompt = `Build an institutional report plan.

GOAL: ${body.goal}
INTENT: ${body.goal_description || "Not specified"}
MODULES SELECTED: ${body.selected_modules.join(", ")}
EXTRA INSTRUCTIONS: ${body.extra_instructions ?? "None"}

ARTIFACT BINDINGS (cite these — do not invent any others):
${artifactCitations || "No bindings provided — flag as UNBOUND in citations."}

SUGGESTED SECTIONS (use as starting point, add/remove as appropriate for the goal):
${suggestedSections}

Return the JSON plan object. All AI-generated narrative must use [PLACEHOLDER] tokens, not real numbers.`;

    // Dynamic import to avoid build-time module resolution issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Anthropic = require("@anthropic-ai/sdk").default;
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model:      "claude-opus-4-6",
      max_tokens: 3000,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: userPrompt }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ plan: buildFallbackPlan(body), source: "fallback-parse-error" });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const plan: AIReportPlan = {
      plan_id:               uuidv4(),
      goal:                  body.goal,
      goal_description:      body.goal_description,
      selected_modules:      body.selected_modules,
      proposed_sections:     parsed.proposed_sections ?? buildFallbackPlan(body).proposed_sections,
      narrative_scaffolds:   parsed.narrative_scaffolds ?? {},
      disclosures_generated: parsed.disclosures_generated ?? [],
      citations:             parsed.citations ?? [],
      model_version:         "claude-opus-4-6",
      generated_at:          new Date().toISOString(),
      is_ai_assisted:        true,
    };

    return NextResponse.json({ plan, source: "claude-opus-4-6" });

  } catch (err: unknown) {
    console.error("[report-ai] error:", err);
    return NextResponse.json({ error: "Report AI service unavailable", detail: String(err) }, { status: 500 });
  }
}
