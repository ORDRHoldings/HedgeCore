import type { GuideDoc } from "@/lib/help/guides/types";

export const FAQ: GuideDoc = {
  id: "faq",
  title: "FAQ",
  summary:
    "Frequently asked questions about ORDR Treasury: pipeline states, data quality indicators, governance controls, hedge math, and operational procedures.",
  path: "/faq",
  icon: "?",
  lastReviewed: "2026-02-28",
  relatedIds: ["getting-started", "governance", "troubleshooting", "api-reference"],
  sections: [
    // ── FAQ 1 ────────────────────────────────────────────────────────────────
    {
      id: "faq-tri-state-pipeline",
      heading: "What is the Tri-State Pipeline?",
      level: "L1",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "The Tri-State Pipeline is ORDR Treasury's governed workflow for moving a hedge plan from simulation to an immutable ledger record. It has three states:\n\n1. SANDBOX — Engine calculations run in simulation mode. Nothing is committed, no governance artifact is created, and the analyst can iterate freely. Sandbox runs are WORM-logged as calculation_runs but have no legal or operational effect.\n\n2. STAGING — The analyst promotes a sandbox result to a staging artifact (execution proposal). The artifact is immutable at this point. A different actor (checker) must approve or reject it under the 4-eyes principle. This state triggers the formal approval workflow.\n\n3. LEDGER — On approval and authorization, a ledger_entry is appended. This is a WORM record protected by a PostgreSQL trigger. The position transitions to HEDGED. The daily Merkle root is updated to include this entry.\n\nThe pipeline enforces that every executed hedge passes through a full governance cycle. Bypassing any state is not possible at the system level. [Unverified for exact staging transition rules and state machine edge cases — consult backend/app/models/staging.py for full state machine.]",
        },
      ],
    },

    // ── FAQ 2 ────────────────────────────────────────────────────────────────
    {
      id: "faq-sim-data",
      heading: "Why does FX data show SIM DATA?",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/api/market/fx/rates/route.ts", endpoint: "GET /api/market/fx/rates" },
        { file: "frontend/src/lib/market/transforms.ts", symbol: "buildFallbackRates" },
      ],
      blocks: [
        {
          type: "text",
          body: "The SIM DATA badge appears on FX rate displays when the system is serving fallback reference rates instead of live Finnhub data. This occurs in two situations:\n\n1. FINNHUB_API_KEY environment variable is not configured — The route immediately falls back without attempting a Finnhub call. Resolution: set FINNHUB_API_KEY in your Vercel environment variables (or .env.local for local development).\n\n2. Finnhub API call failed — Either the API returned an error (e.g., 429 rate limit, 403 invalid key) or the request timed out after 8 seconds. The system falls back to BIS-calibrated reference rates.\n\nThe fallback rates served during SIM DATA mode are static reference values calibrated to approximate market levels. They should not be used for execution pricing, position marking, or regulatory reporting. They allow the platform to remain operational for analysis and workflow purposes when live data is unavailable.",
        },
      ],
    },

    // ── FAQ 3 ────────────────────────────────────────────────────────────────
    {
      id: "faq-four-eyes",
      heading: "What is the 4-Eyes Principle?",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/execution_proposal.py", symbol: "ExecutionProposal" },
      ],
      blocks: [
        {
          type: "text",
          body: "The 4-Eyes Principle (also called two-person integrity or segregation of duties) requires that no single person can both propose and authorize a material transaction. In ORDR Treasury:\n\n- The MAKER creates an execution proposal (pipeline.create_proposal permission required).\n- A different CHECKER must approve it (pipeline.approve permission required).\n- The DB-level constraint CHECK(approved_by IS NULL OR approved_by != proposed_by) on the execution_proposals table makes this physically impossible to bypass — even the admin role cannot approve their own proposal.\n- The service layer additionally validates this as a second defense layer.\n\nThis is distinct from permission-based access control. It is a workflow-sequenced control: even a user who holds both pipeline.create_proposal and pipeline.approve cannot use both permissions on the same proposal.",
        },
      ],
    },

    // ── FAQ 4 ────────────────────────────────────────────────────────────────
    {
      id: "faq-worm",
      heading: "What does WORM mean?",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/audit_event.py", symbol: "AuditEvent" },
        { file: "backend/app/models/calculation_run.py" },
        { file: "backend/app/models/policy_revision.py" },
        { file: "backend/app/models/ledger.py", symbol: "LedgerEntry" },
      ],
      blocks: [
        {
          type: "text",
          body: "WORM stands for Write Once Read Many. It describes a data storage policy where records can be created but never modified or deleted after creation.\n\nIn ORDR Treasury, four tables carry WORM semantics:\n\n- audit_events — Every action in the system. Application-layer enforced: no ORM update/delete path exists.\n- calculation_runs — Engine output records. Written once at completion; never modified.\n- policy_revisions — Each policy change creates a new row; the previous revision remains immutable.\n- ledger_entries — Committed hedge executions. Protected by a PostgreSQL BEFORE UPDATE OR DELETE trigger that raises an exception at the database level.\n\nWORM semantics support regulatory tamper-evidence requirements. Any attempt to alter a historical record is detectable via the SHA-256 hash chain (for audit_events) or the daily Merkle root anchors (for ledger_entries).",
        },
      ],
    },

    // ── FAQ 5 ────────────────────────────────────────────────────────────────
    {
      id: "faq-ndf",
      heading: "What is an NDF?",
      level: "L1",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "An NDF (Non-Deliverable Forward) is a cash-settled FX forward contract. Unlike a deliverable forward, which involves the actual exchange of two currencies at maturity, an NDF settles in a third currency (typically USD) based on the difference between the agreed forward rate (strike) and the official fixing rate at maturity.\n\nSettlement formula: Settlement = Notional × (Fixing Rate − Strike Rate)\n\nNDFs are used for currencies with capital controls or restricted convertibility where physical delivery is impractical or legally constrained. ORDR Treasury's 8 supported pairs include two NDF-eligible currencies: USDMXN (Mexican Peso) and USDCNH (Chinese Renminbi offshore). Standard EM NDF pairs also include BRL, INR, KRW, and TWD, though these are not in the current pair set.\n\nFor regulatory purposes, NDFs are classified as OTC derivative contracts. Under EMIR, they may be subject to trade reporting and clearing obligations depending on jurisdiction and counterparty classification. [General Reference — standard FX definition. ORDR Treasury NDF instrument support details: Unverified — consult policy template configuration.]",
        },
      ],
    },

    // ── FAQ 6 ────────────────────────────────────────────────────────────────
    {
      id: "faq-ifrs9-effectiveness",
      heading: "How is hedge effectiveness measured?",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "frontend/src/lib/mathEngine.ts", symbol: "ifrs9EffectivenessTest" },
      ],
      blocks: [
        {
          type: "text",
          body: "ORDR Treasury measures hedge effectiveness using the dollar-offset method, aligned with IFRS 9 §6.4.1.\n\nEffectiveness ratio = hedge_notional / exposure_notional\n\nIFRS 9 requires the ratio to fall within the 80%–125% bright-line range:\n- < 80%: Under-hedging (INEFFECTIVE)\n- 70%–79.9%: BORDERLINE\n- 80%–125%: EFFECTIVE (passes)\n- > 125%: OVER_HEDGED\n\nA GBM-based prospective test is also computed: the system simulates a 1-standard-deviation adverse spot shock over the remaining tenor and measures the ratio of hedged vs. unhedged P&L.\n\nEffectiveness is tested quarterly under IFRS 9. A designation that repeatedly fails the 80%–125% test must be dedesignated — the hedging relationship is terminated and hedge accounting ceases. All policy_revision records that document the original hedge designation are WORM-preserved for audit purposes.",
        },
      ],
    },

    // ── FAQ 7 ────────────────────────────────────────────────────────────────
    {
      id: "faq-r1-r8",
      heading: "What is R1-R8 risk taxonomy?",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "backend/app/engine/risk_classifier.py", symbol: "RISK_BUCKETS" },
        { file: "backend/app/engine/risk_classifier.py", symbol: "classify_risk" },
      ],
      blocks: [
        {
          type: "text",
          body: "ORDR Treasury classifies FX exposure into eight risk buckets (R1–R8). In v1, only R1–R4 are actively computed; R5–R8 are reserved for future implementation.\n\nR1 — Delta (Directional): Primary FX spot rate sensitivity. The dominant risk for most corporate FX exposures — the position loses value when the spot rate moves adversely.\n\nR2 — Vega (Volatility): Sensitivity to changes in implied volatility. Relevant when the position includes options or option-like instruments.\n\nR3 — Gamma (Convexity): Rate of change of delta; measures the acceleration of P&L relative to spot moves. Uses a gamma_proxy in v1 (indicative convexity estimate, not dollar gamma).\n\nR4 — Theta (Time Decay): Erosion of option time value over the holding period.\n\nR5–R8 — Correlation, Credit, Liquidity, Tail: Reserved in v1 classifier. Forced to 0.0.\n\nThe risk vector is normalized using the Euclidean-like sum (R1_abs + R2_abs + R3_abs + R4_abs = total), with each bucket expressed as its share of total exposure. R4 is adjusted to ensure the sum equals 1.0 deterministically.",
        },
      ],
    },

    // ── FAQ 8 ────────────────────────────────────────────────────────────────
    {
      id: "faq-decision-gate",
      heading: "What is the Decision Gate?",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "backend/app/engine/decision_gate.py", symbol: "decision_gate" },
      ],
      blocks: [
        {
          type: "text",
          body: "The Decision Gate is the final stage of the hedge engine. It applies a set of hard rejection rules to the engine's output before returning a verdict. There are three possible verdicts:\n\n- APPROVE: All checks passed; no conditions.\n- APPROVE_WITH_CONDITIONS: All hard checks passed, but soft conditions apply (e.g., effectiveness not computable).\n- REJECT: One or more hard rules failed. The proposal cannot proceed to staging.\n\nThe 8 hard rejection conditions (with default thresholds) are:\n\n1. cost_too_high (bps): total cost > 75 bps of notional\n2. cost_too_high (absolute): total cost > $25,000 USD when notional is unknown\n3. worst_case_too_low: worst-case scenario net PnL < -$50,000 USD\n4. effectiveness_too_low: minimum hedge effectiveness < 25%\n5. empty_hedge_plan: no non-zero contract positions in the hedge plan\n6. too_many_rejections: any hedge legs rejected by upstream engine stages\n7. missing_required_input: required plan fields absent (costs.total or summary.worst_case.net_pnl_usd)\n8. unhedged_material_risk: risk classifier output contains explicitly uncovered material risks (score ≥ 0.50)\n\nThe decision hash is a deterministic SHA-256 over the verdict, reasons, conditions, and policy parameters — making the gate output fully auditable and replayable.",
        },
      ],
    },

    // ── FAQ 9 ────────────────────────────────────────────────────────────────
    {
      id: "faq-reset-dashboard",
      heading: "How do I reset my dashboard layout?",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/dashboard/page.tsx" },
        { file: "frontend/src/lib/widgets/widgetRegistry.ts" },
      ],
      blocks: [
        {
          type: "text",
          body: "Dashboard layouts are saved per-user in browser localStorage under the key dashboard_layout_{userId}.\n\nTo reset to the role-default layout:\n1. Click the Reset Layout button in the dashboard toolbar (top-right area of the dashboard page).\n2. The layout will reset to the default layout for your primary role, as defined in widgetRegistry.ts.\n3. The new layout is immediately saved to localStorage.\n\nIf the Reset button does not work (e.g., localStorage is corrupted or quota-exceeded), you can manually clear the key:\n1. Open browser DevTools → Application → Local Storage.\n2. Find and delete the key dashboard_layout_{your_user_id}.\n3. Refresh the page — the role-default layout will be applied.\n\nNote: layout resets affect only your browser. Other users' layouts are stored in their own browsers and are unaffected.",
        },
      ],
    },

    // ── FAQ 10 ────────────────────────────────────────────────────────────────
    {
      id: "faq-instruments",
      heading: "What instruments does ORDR support?",
      level: "L1",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "ORDR Treasury v1 supports three FX hedging instruments. The available instruments for a given position are determined by the policy template's instrument_type field:\n\n1. NDF (Non-Deliverable Forward): Cash-settled FX forward. Used for EM currencies with capital controls (USDMXN, USDCNH). Settlement based on official fixing rate at maturity.\n\n2. FX Forward (Deliverable): Standard OTC FX forward contract. Physical delivery of the two currencies at the agreed future date and rate. Used for G10 pairs (EURUSD, GBPUSD, USDJPY, USDCAD, USDCHF, AUDUSD).\n\n3. FX Futures: Exchange-traded standardized FX futures contracts. Listed on CME. Cash or physical settlement depending on contract specification. Provides credit risk mitigation through central clearing.\n\n[Unverified for complete instrument list and all instrument-specific configurations — consult backend/app/engine/instrument_mapper.py for the authoritative mapping.]",
        },
      ],
    },

    // ── FAQ 11 ────────────────────────────────────────────────────────────────
    {
      id: "faq-hash-chain",
      heading: "What is a hash chain and why does it matter?",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/audit_event.py", symbol: "compute_event_hash" },
        { file: "backend/app/models/audit_event.py", symbol: "GENESIS_HASH" },
      ],
      blocks: [
        {
          type: "text",
          body: "A hash chain is a sequence of records where each record's cryptographic hash includes the hash of the previous record. This creates an unbreakable chain of custody:\n\n- The first event (GENESIS) has a prev_event_hash of 64 zeroes — a known sentinel value.\n- Each subsequent event computes: event_hash = SHA256(canonical_json(event_content + prev_event_hash)).\n- If any historical event is altered — even a single character in the payload — its hash changes. This makes all subsequent hashes in the chain incorrect, because they each include the previous (now-wrong) hash.\n\nThis matters because:\n1. Tamper detection: any external auditor can re-download all events and recompute the chain. Any modification to any record is immediately detectable.\n2. Ordering proof: the chain proves the sequence of events — you cannot insert a record between two existing records without breaking the chain.\n3. Non-repudiation: once an event is in the chain, it cannot be denied, altered, or removed without detection.\n\nThe GENESIS event is identifiable by its all-zeros prev_event_hash. Independent examiners can verify the entire tenant's audit history starting from GENESIS.",
        },
      ],
    },

    // ── FAQ 12 ────────────────────────────────────────────────────────────────
    {
      id: "faq-permissions",
      heading: "How are permissions assigned?",
      level: "L2",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/permission.py", symbol: "SEED_PERMISSIONS" },
        { file: "backend/app/models/permission.py", symbol: "DEFAULT_ROLE_PERMISSIONS" },
      ],
      blocks: [
        {
          type: "text",
          body: "Permissions in ORDR Treasury are assigned through roles, not directly to users. The permission model works as follows:\n\n1. Atomic permissions: 41 permissions across 11 modules, each identified by a codename in the format module.action (e.g., pipeline.approve, calculate.run_sandbox).\n\n2. Roles: 9 predefined roles (admin, ceo, cfo, head_of_risk, branch_manager, supervisor, senior_analyst, risk_analyst, junior_analyst) each with a predefined set of permissions. Admin has all 41 permissions.\n\n3. Role assignment: Admin-level users (users.assign_roles permission required) assign one or more roles to each user.\n\n4. Effective permissions: A user's effective permissions are the union of all permissions from all their assigned roles.\n\n5. Hierarchy: hierarchy_level (0–15) prevents privilege escalation. A user cannot be assigned a role with a higher hierarchy_level than their own.\n\nCustom roles are not supported in v1 — only the predefined 9 roles are available.",
        },
      ],
    },

    // ── FAQ 13 ────────────────────────────────────────────────────────────────
    {
      id: "faq-backend-offline",
      heading: "What happens if the backend is offline?",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "When the ORDR Treasury backend is offline or unreachable, the following behaviors occur:\n\n- Dashboard widgets that fetch from backend endpoints (positions, runs, pending approvals, team activity) display a BACKEND OFFLINE indicator and show the last-fetched data where available from the component's local state.\n- Position desk shows a connection error with a retry button. No new positions can be created or updated.\n- Sandbox engine runs cannot be submitted. The Calculate button is disabled when backend connectivity is lost.\n- Audit trail page is read-only (it fetches from the backend). No new audit events are generated while offline.\n- Polisophic (macro data, geo-news) continues to function normally — these routes are served by Next.js API routes on Vercel and are independent of the backend.\n- FX Rates continue to function while Finnhub is available.\n\nThe backend typically auto-restarts within 60–90 seconds after a cold start on Render.com. No data is lost during a backend outage — the PostgreSQL database remains online independently.",
        },
      ],
    },

    // ── FAQ 14 ────────────────────────────────────────────────────────────────
    {
      id: "faq-export-report",
      heading: "How do I export a report?",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "To export a report from ORDR Treasury:\n\n1. Navigate to /reports from the sidebar navigation. You need reports.view_own_branch (minimum) or reports.view_all_branches permission to access this page.\n\n2. Select a report template from the available templates (e.g., Hedge Summary, Exposure Analysis, Audit Trail Export, Policy Compliance).\n\n3. Configure the report parameters: date range, branch scope (if you have multi-branch access), and any filter criteria.\n\n4. Click Generate to run the report. Large date ranges may take several seconds.\n\n5. Once generated, click Export. The export drawer opens allowing selection of output format.\n\n6. Select the desired format and click Download.\n\nRequired permissions: reports.view_own_branch or reports.view_all_branches for generating; reports.export_pdf for PDF; reports.export_excel for Excel/XLSX output.\n\n[Unverified for exact export format options (PDF/XLSX/PPT/ZIP) — consult the Reports page UI for available formats in the current deployment.]",
        },
      ],
    },
  ],
};
