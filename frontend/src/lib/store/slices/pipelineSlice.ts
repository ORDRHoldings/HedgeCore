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
  selectedPair: string;

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
  selectedPair: "USDMXN",

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
    try {
      return await pipelineClient.sandboxCalculate(request, token);
    } catch (err: unknown) {
      return rejectWithValue(extractError(err));
    }
  },
);

export const sandboxCalculateMultiThunk = createAsyncThunk(
  "pipeline/sandboxCalculateMulti",
  async (
    { request, pair, token }: { request: SandboxCalculateRequest; pair: string; token?: string },
    { rejectWithValue },
  ) => {
    try {
      return await pipelineClient.sandboxCalculateMulti(request, pair, token);
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
    setSelectedPair: (state, action: PayloadAction<string>) => {
      state.selectedPair = action.payload;
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

    // ── Sandbox Calculate Multi ───────────────────────────────────────
    builder
      .addCase(sandboxCalculateMultiThunk.pending, (state) => {
        state.sandboxLoading = true;
        state.error = null;
      })
      .addCase(
        sandboxCalculateMultiThunk.fulfilled,
        (state, action: PayloadAction<SandboxCalculateResponse>) => {
          state.sandboxLoading = false;
          state.sandboxResult = action.payload;
          state.activeState = "SANDBOX";
        },
      )
      .addCase(sandboxCalculateMultiThunk.rejected, (state, action) => {
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
  setSelectedPair,
  clearError,
  clearSandboxResult,
} = pipelineSlice.actions;

export default pipelineSlice.reducer;
