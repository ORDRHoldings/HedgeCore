import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import * as pipelineClient from "../../../api/pipelineClient";
import type {
  SandboxCalculateRequest,
  SandboxCalculateResponse,
  CreateProposalRequest,
  Proposal,
  StagedArtifact,
  LedgerEntry,
  ReplayResult,
  TimelineEvent,
  SubmitToStagingRequest,
  AuthorizeRequest,
  ReplayLedgerRequest,
} from "../../../api/pipelineTypes";

// ---------------------------------------------------------------------------
// Demo-mode flag (baked in at build time by Next.js)
// ---------------------------------------------------------------------------
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// ---------------------------------------------------------------------------
// Client-side demo engine — produces a realistic SandboxCalculateResponse
// from the raw request without any backend call.
// Used whenever DEMO_MODE=true and token starts with "demo_token_"
// ---------------------------------------------------------------------------
function buildDemoSandboxResult(req: SandboxCalculateRequest): SandboxCalculateResponse {
  const spot = req.market.spot_usdmxn;
  const fwdPts = req.market.forward_points_by_month;
  const policy = req.policy;

  // Group trades by calendar month bucket
  const bucketMap: Record<string, { confirmed: number; forecast: number }> = {};
  for (const t of req.trades) {
    const month = t.value_date.slice(0, 7); // "YYYY-MM"
    if (!bucketMap[month]) bucketMap[month] = { confirmed: 0, forecast: 0 };
    const sign = t.type === "AP" ? 1 : -1;
    if (t.status === "CONFIRMED") bucketMap[month].confirmed += sign * t.amount;
    else bucketMap[month].forecast += sign * t.amount;
  }

  // Group existing hedges by month
  const hedgeMap: Record<string, number> = {};
  for (const h of req.hedges) {
    const month = h.value_date.slice(0, 7);
    const sign = h.direction === "SELL_MXN_BUY_USD" ? 1 : -1;
    hedgeMap[month] = (hedgeMap[month] ?? 0) + sign * h.notional_mxn;
  }

  const months = Object.keys(bucketMap).sort();
  let totalExposure = 0, totalExistingHedges = 0, totalAction = 0, totalActionUsd = 0, totalFriction = 0, totalHedgePos = 0, totalResidual = 0;

  const buckets = months.map((month) => {
    const { confirmed, forecast } = bucketMap[month];
    const commercial = confirmed + forecast;
    const existing = hedgeMap[month] ?? 0;
    const target = confirmed * policy.hedge_ratios.confirmed + forecast * policy.hedge_ratios.forecast;
    const action = Math.max(0, target - existing);
    const fwdKey = `${month}-15`.slice(0, 7); // match forward key
    const fwdPt = fwdPts[Object.keys(fwdPts).find(k => k.startsWith(month)) ?? ""] ?? 0;
    const forwardRate = spot + fwdPt;
    const actionUsd = action / forwardRate;
    const friction = actionUsd * (policy.cost_assumptions.spread_bps / 10000);
    const hedgePos = existing + action;
    const residual = commercial - hedgePos;

    totalExposure += commercial;
    totalExistingHedges += existing;
    totalAction += action;
    totalActionUsd += actionUsd;
    totalFriction += friction;
    totalHedgePos += hedgePos;
    totalResidual += residual;

    return {
      bucket: month,
      confirmed_flow_mxn: confirmed,
      forecast_flow_mxn: forecast,
      commercial_exposure_mxn: commercial,
      existing_hedges_mxn: existing,
      target_signed_mxn: target,
      action_mxn: action,
      action_direction: action > 0 ? "SELL_MXN_BUY_USD" : null,
      forward_rate: forwardRate,
      carry_note: fwdPt > 0 ? `+${(fwdPt * 100 / spot).toFixed(2)}% carry` : "flat",
      action_usd: actionUsd,
      friction_usd: friction,
      suppressed: action < (policy.min_trade_size_usd * spot),
      hedge_position_mxn: hedgePos,
      residual_mxn: residual,
    };
  });

  // Scenario analysis (3 sigmas: -2, 0, +2)
  const sigmas = [-2, -1, 0, 1, 2];
  const scenarioTotals = sigmas.map((sigma) => {
    const shockedSpot = spot * (1 + sigma * 0.05);
    const unhedgedUsd = totalExposure / shockedSpot - totalExposure / spot;
    const hedgedUsd = (totalExposure - totalHedgePos) / shockedSpot - (totalExposure - totalHedgePos) / spot;
    return {
      sigma,
      shocked_spot: shockedSpot,
      total_unhedged_usd: unhedgedUsd,
      total_hedged_usd: hedgedUsd,
      total_hedge_benefit_usd: hedgedUsd - unhedgedUsd,
    };
  });

  const runId = `DEMO-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();
  const integrityScore = Math.min(100, Math.round(60 + (totalHedgePos / Math.max(totalExposure, 1)) * 40));

  return {
    run_id: runId,
    calculate_response: {
      run_id: runId,
      validation_report: { status: "PASS", errors: [], warnings: [] },
      hedge_plan: {
        buckets,
        summary: {
          total_commercial_exposure_mxn: totalExposure,
          total_existing_hedges_mxn: totalExistingHedges,
          total_action_mxn: totalAction,
          total_action_usd: totalActionUsd,
          total_friction_usd: totalFriction,
          total_hedge_position_mxn: totalHedgePos,
          total_residual_mxn: totalResidual,
        },
      },
      scenario_results: {
        sigmas,
        per_bucket: [],
        totals: scenarioTotals,
      },
      run_envelope: {
        run_id: runId,
        timestamp: now,
        engine_version: "demo-1.0.0",
        inputs_hash: "DEMO",
        outputs_hash: "DEMO",
        trades_hash: "DEMO",
        hedges_hash: "DEMO",
        market_hash: "DEMO",
        policy_hash: "DEMO",
      },
      trace_lite: { run_id: runId, events: [] },
    },
    waterfall_result: {
      rules: [
        { rule_id: "EXP-001", name: "Exposure Data Completeness", status: "PASS", v_codes: [], details: ["All buckets populated"], threshold: null, result_summary: "All positions loaded" },
        { rule_id: "POL-001", name: "Policy Compliance", status: "PASS", v_codes: [], details: ["Hedge ratios within policy bounds"], threshold: 0.80, result_summary: `${(totalHedgePos / Math.max(totalExposure, 1) * 100).toFixed(1)}% hedged` },
        { rule_id: "EXE-001", name: "Execution Readiness", status: totalAction > 0 ? "PASS" : "WARN", v_codes: [], details: [totalAction > 0 ? "Actions generated" : "No new actions required"], threshold: null, result_summary: totalAction > 0 ? `${buckets.filter(b => b.action_mxn > 0).length} tickets` : "Portfolio already hedged" },
        { rule_id: "MKT-001", name: "Market Data Freshness", status: "PASS", v_codes: [], details: ["Forward curve loaded"], threshold: null, result_summary: `Spot ${spot.toFixed(4)} USD/MXN` },
      ],
      overall_status: "PASS",
      integrity_score: integrityScore,
    },
    validation_report: { status: "PASS", errors: [], warnings: [] },
    hedge_plan: {
      buckets,
      summary: {
        total_commercial_exposure_mxn: totalExposure,
        total_existing_hedges_mxn: totalExistingHedges,
        total_action_mxn: totalAction,
        total_action_usd: totalActionUsd,
        total_friction_usd: totalFriction,
        total_hedge_position_mxn: totalHedgePos,
        total_residual_mxn: totalResidual,
      },
    },
    scenario_results: {
      sigmas,
      per_bucket: [],
      totals: scenarioTotals,
    },
    trace_events: [],
    frozen_inputs: { trades: req.trades, hedges: req.hedges, market: req.market, policy: req.policy },
    run_envelope: {
      run_id: runId,
      timestamp: now,
      engine_version: "demo-1.0.0",
      inputs_hash: "DEMO",
      outputs_hash: "DEMO",
      trades_hash: "DEMO",
      hedges_hash: "DEMO",
      market_hash: "DEMO",
      policy_hash: "DEMO",
    },
    v2_results: {
      allocator_result: {
        total_exposure_mxn: totalExposure,
        hedge_coverage_pct: totalHedgePos / Math.max(totalExposure, 1),
        residual_mxn: totalResidual,
        action_count: buckets.filter(b => b.action_mxn > 0).length,
      },
      liquidity_result: {
        regime: "NORMAL",
        bid_ask_spread_bps: policy.cost_assumptions.spread_bps,
        market_depth: "DEEP",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type ActiveState = "SANDBOX" | "STAGING" | "LEDGER";

interface PipelineError {
  code: string;
  message: string;
}

export interface PipelineState {
  activeState: ActiveState;

  sandboxResult: SandboxCalculateResponse | null;
  sandboxLoading: boolean;

  proposals: Proposal[];
  currentProposal: Proposal | null;
  proposalsLoading: boolean;

  stagingArtifacts: StagedArtifact[];
  currentStaging: StagedArtifact | null;
  stagingLoading: boolean;

  ledgerEntries: LedgerEntry[];
  currentLedger: LedgerEntry | null;
  ledgerLoading: boolean;

  replayResult: ReplayResult | null;
  replayLoading: boolean;

  timeline: TimelineEvent[];

  xrayOpen: boolean;
  xrayContext: Record<string, unknown> | null;

  decisionPacketMode: boolean;

  error: PipelineError | null;
}

const initialState: PipelineState = {
  activeState: "SANDBOX",

  sandboxResult: null,
  sandboxLoading: false,

  proposals: [],
  currentProposal: null,
  proposalsLoading: false,

  stagingArtifacts: [],
  currentStaging: null,
  stagingLoading: false,

  ledgerEntries: [],
  currentLedger: null,
  ledgerLoading: false,

  replayResult: null,
  replayLoading: false,

  timeline: [],

  xrayOpen: false,
  xrayContext: null,

  decisionPacketMode: false,

  error: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractError(err: unknown): PipelineError {
  const axiosErr = err as {
    response?: { data?: { detail?: string; error?: string }; status?: number };
    message?: string;
  };

  const detail = axiosErr?.response?.data?.detail;
  const errorField = axiosErr?.response?.data?.error;
  const status = axiosErr?.response?.status;

  const message =
    detail ?? errorField ?? (err as Error)?.message ?? "Unknown pipeline error";
  const code = status ? `HTTP_${status}` : "UNKNOWN";

  return { code, message };
}

// ---------------------------------------------------------------------------
// Async Thunks — all accept { ..., token } to pass JWT through
// ---------------------------------------------------------------------------

export const sandboxCalculateThunk = createAsyncThunk(
  "pipeline/sandboxCalculate",
  async (
    { request, token }: { request: SandboxCalculateRequest; token: string },
    { rejectWithValue },
  ) => {
    // Demo-mode short-circuit: compute result client-side without any backend call.
    // Triggers when NEXT_PUBLIC_DEMO_MODE=true AND token is a demo token.
    if (DEMO_MODE && token?.startsWith("demo_token_")) {
      // Simulate a brief engine "run" delay for realistic UX
      await new Promise((r) => setTimeout(r, 420));
      return buildDemoSandboxResult(request);
    }
    try {
      return await pipelineClient.sandboxCalculate(request, token);
    } catch (err: unknown) {
      return rejectWithValue(extractError(err));
    }
  },
);

export const createProposalThunk = createAsyncThunk(
  "pipeline/createProposal",
  async (
    { request, token }: { request: CreateProposalRequest; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await pipelineClient.createProposal(request, token);
    } catch (err: unknown) {
      return rejectWithValue(extractError(err));
    }
  },
);

export const listProposalsThunk = createAsyncThunk(
  "pipeline/listProposals",
  async ({ token }: { token: string }, { rejectWithValue }) => {
    try {
      return await pipelineClient.listProposals(token);
    } catch (err: unknown) {
      return rejectWithValue(extractError(err));
    }
  },
);

export const getProposalThunk = createAsyncThunk(
  "pipeline/getProposal",
  async (
    { proposalId, token }: { proposalId: string; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await pipelineClient.getProposal(proposalId, token);
    } catch (err: unknown) {
      return rejectWithValue(extractError(err));
    }
  },
);

export const submitToStagingThunk = createAsyncThunk(
  "pipeline/submitToStaging",
  async (
    { request, token }: { request: SubmitToStagingRequest; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await pipelineClient.submitToStaging(request, token);
    } catch (err: unknown) {
      return rejectWithValue(extractError(err));
    }
  },
);

export const listStagingThunk = createAsyncThunk(
  "pipeline/listStaging",
  async ({ token }: { token: string }, { rejectWithValue }) => {
    try {
      return await pipelineClient.listStaging(token);
    } catch (err: unknown) {
      return rejectWithValue(extractError(err));
    }
  },
);

export const getStagingThunk = createAsyncThunk(
  "pipeline/getStaging",
  async (
    { stagingId, token }: { stagingId: string; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await pipelineClient.getStaging(stagingId, token);
    } catch (err: unknown) {
      return rejectWithValue(extractError(err));
    }
  },
);

export const authorizeStagedThunk = createAsyncThunk(
  "pipeline/authorizeStaged",
  async (
    { request, token }: { request: AuthorizeRequest; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await pipelineClient.authorizeStaged(request, token);
    } catch (err: unknown) {
      return rejectWithValue(extractError(err));
    }
  },
);

export const listLedgerThunk = createAsyncThunk(
  "pipeline/listLedger",
  async ({ token }: { token: string }, { rejectWithValue }) => {
    try {
      return await pipelineClient.listLedger(token);
    } catch (err: unknown) {
      return rejectWithValue(extractError(err));
    }
  },
);

export const getLedgerThunk = createAsyncThunk(
  "pipeline/getLedger",
  async (
    { ledgerId, token }: { ledgerId: string; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await pipelineClient.getLedger(ledgerId, token);
    } catch (err: unknown) {
      return rejectWithValue(extractError(err));
    }
  },
);

export const replayLedgerThunk = createAsyncThunk(
  "pipeline/replayLedger",
  async (
    { request, token }: { request: ReplayLedgerRequest; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await pipelineClient.replayLedger(request, token);
    } catch (err: unknown) {
      return rejectWithValue(extractError(err));
    }
  },
);

export const getTimelineThunk = createAsyncThunk(
  "pipeline/getTimeline",
  async (
    { ledgerId, token }: { ledgerId: string; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await pipelineClient.getLedgerTimeline(ledgerId, token);
    } catch (err: unknown) {
      return rejectWithValue(extractError(err));
    }
  },
);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const pipelineSlice = createSlice({
  name: "pipeline",
  initialState,
  reducers: {
    setActiveState(state, action: PayloadAction<ActiveState>) {
      state.activeState = action.payload;
    },
    setXRayOpen(state, action: PayloadAction<boolean>) {
      state.xrayOpen = action.payload;
    },
    setXRayContext(state, action: PayloadAction<Record<string, unknown> | null>) {
      state.xrayContext = action.payload;
    },
    setDecisionPacketMode(state, action: PayloadAction<boolean>) {
      state.decisionPacketMode = action.payload;
    },
    clearError(state) {
      state.error = null;
    },
    clearSandboxResult(state) {
      state.sandboxResult = null;
    },
  },
  extraReducers: (builder) => {
    // ── Sandbox Calculate ─────────────────────────────────────────────
    builder
      .addCase(sandboxCalculateThunk.pending, (state) => {
        state.sandboxLoading = true;
        state.error = null;
      })
      .addCase(
        sandboxCalculateThunk.fulfilled,
        (state, action: PayloadAction<SandboxCalculateResponse>) => {
          state.sandboxLoading = false;
          state.sandboxResult = action.payload;
          state.activeState = "SANDBOX";
        },
      )
      .addCase(sandboxCalculateThunk.rejected, (state, action) => {
        state.sandboxLoading = false;
        state.error = action.payload as PipelineError;
      });

    // ── Create Proposal ───────────────────────────────────────────────
    builder
      .addCase(createProposalThunk.pending, (state) => {
        state.proposalsLoading = true;
        state.error = null;
      })
      .addCase(
        createProposalThunk.fulfilled,
        (state, action: PayloadAction<Proposal>) => {
          state.proposalsLoading = false;
          state.currentProposal = action.payload;
          state.proposals.push(action.payload);
        },
      )
      .addCase(createProposalThunk.rejected, (state, action) => {
        state.proposalsLoading = false;
        state.error = action.payload as PipelineError;
      });

    // ── List Proposals ────────────────────────────────────────────────
    builder
      .addCase(listProposalsThunk.pending, (state) => {
        state.proposalsLoading = true;
        state.error = null;
      })
      .addCase(
        listProposalsThunk.fulfilled,
        (state, action: PayloadAction<Proposal[]>) => {
          state.proposalsLoading = false;
          state.proposals = action.payload;
        },
      )
      .addCase(listProposalsThunk.rejected, (state, action) => {
        state.proposalsLoading = false;
        state.error = action.payload as PipelineError;
      });

    // ── Get Proposal ──────────────────────────────────────────────────
    builder
      .addCase(getProposalThunk.pending, (state) => {
        state.proposalsLoading = true;
        state.error = null;
      })
      .addCase(
        getProposalThunk.fulfilled,
        (state, action: PayloadAction<Proposal>) => {
          state.proposalsLoading = false;
          state.currentProposal = action.payload;
        },
      )
      .addCase(getProposalThunk.rejected, (state, action) => {
        state.proposalsLoading = false;
        state.error = action.payload as PipelineError;
      });

    // ── Submit to Staging ─────────────────────────────────────────────
    builder
      .addCase(submitToStagingThunk.pending, (state) => {
        state.stagingLoading = true;
        state.error = null;
      })
      .addCase(
        submitToStagingThunk.fulfilled,
        (state, action: PayloadAction<StagedArtifact>) => {
          state.stagingLoading = false;
          state.currentStaging = action.payload;
          state.stagingArtifacts.push(action.payload);
          state.activeState = "STAGING";
        },
      )
      .addCase(submitToStagingThunk.rejected, (state, action) => {
        state.stagingLoading = false;
        state.error = action.payload as PipelineError;
      });

    // ── List Staging ──────────────────────────────────────────────────
    builder
      .addCase(listStagingThunk.pending, (state) => {
        state.stagingLoading = true;
        state.error = null;
      })
      .addCase(
        listStagingThunk.fulfilled,
        (state, action: PayloadAction<StagedArtifact[]>) => {
          state.stagingLoading = false;
          state.stagingArtifacts = action.payload;
        },
      )
      .addCase(listStagingThunk.rejected, (state, action) => {
        state.stagingLoading = false;
        state.error = action.payload as PipelineError;
      });

    // ── Get Staging ───────────────────────────────────────────────────
    builder
      .addCase(getStagingThunk.pending, (state) => {
        state.stagingLoading = true;
        state.error = null;
      })
      .addCase(
        getStagingThunk.fulfilled,
        (state, action: PayloadAction<StagedArtifact>) => {
          state.stagingLoading = false;
          state.currentStaging = action.payload;
        },
      )
      .addCase(getStagingThunk.rejected, (state, action) => {
        state.stagingLoading = false;
        state.error = action.payload as PipelineError;
      });

    // ── Authorize Staged ──────────────────────────────────────────────
    builder
      .addCase(authorizeStagedThunk.pending, (state) => {
        state.stagingLoading = true;
        state.error = null;
      })
      .addCase(
        authorizeStagedThunk.fulfilled,
        (state, action: PayloadAction<LedgerEntry>) => {
          state.stagingLoading = false;
          state.currentLedger = action.payload;
          state.ledgerEntries.push(action.payload);
          state.activeState = "LEDGER";
        },
      )
      .addCase(authorizeStagedThunk.rejected, (state, action) => {
        state.stagingLoading = false;
        state.error = action.payload as PipelineError;
      });

    // ── List Ledger ───────────────────────────────────────────────────
    builder
      .addCase(listLedgerThunk.pending, (state) => {
        state.ledgerLoading = true;
        state.error = null;
      })
      .addCase(
        listLedgerThunk.fulfilled,
        (state, action: PayloadAction<LedgerEntry[]>) => {
          state.ledgerLoading = false;
          state.ledgerEntries = action.payload;
        },
      )
      .addCase(listLedgerThunk.rejected, (state, action) => {
        state.ledgerLoading = false;
        state.error = action.payload as PipelineError;
      });

    // ── Get Ledger ────────────────────────────────────────────────────
    builder
      .addCase(getLedgerThunk.pending, (state) => {
        state.ledgerLoading = true;
        state.error = null;
      })
      .addCase(
        getLedgerThunk.fulfilled,
        (state, action: PayloadAction<LedgerEntry>) => {
          state.ledgerLoading = false;
          state.currentLedger = action.payload;
        },
      )
      .addCase(getLedgerThunk.rejected, (state, action) => {
        state.ledgerLoading = false;
        state.error = action.payload as PipelineError;
      });

    // ── Replay Ledger ─────────────────────────────────────────────────
    builder
      .addCase(replayLedgerThunk.pending, (state) => {
        state.replayLoading = true;
        state.error = null;
      })
      .addCase(
        replayLedgerThunk.fulfilled,
        (state, action: PayloadAction<ReplayResult>) => {
          state.replayLoading = false;
          state.replayResult = action.payload;
        },
      )
      .addCase(replayLedgerThunk.rejected, (state, action) => {
        state.replayLoading = false;
        state.error = action.payload as PipelineError;
      });

    // ── Get Timeline ──────────────────────────────────────────────────
    builder
      .addCase(getTimelineThunk.pending, (state) => {
        state.error = null;
      })
      .addCase(
        getTimelineThunk.fulfilled,
        (state, action: PayloadAction<TimelineEvent[]>) => {
          state.timeline = action.payload;
        },
      )
      .addCase(getTimelineThunk.rejected, (state, action) => {
        state.error = action.payload as PipelineError;
      });
  },
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const {
  setActiveState,
  setXRayOpen,
  setXRayContext,
  setDecisionPacketMode,
  clearError,
  clearSandboxResult,
} = pipelineSlice.actions;

export default pipelineSlice.reducer;
