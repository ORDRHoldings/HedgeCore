/**
 * positionSlice.ts — Redux slice for DB-backed FX exposure positions.
 *
 * Thunks wrap positionClient API calls.
 * State is updated from the server response after each API call — never
 * optimistically mutated. The DB is the source of truth.
 *
 * Phase 0 lifecycle thunks replace the old Redux-only markExecuted():
 *   assignPolicyThunk     → PATCH /v1/positions/{id}/assign-policy
 *   markReadyThunk        → PATCH /v1/positions/{id}/ready
 *   executePositionThunk  → PATCH /v1/positions/{id}/execute
 *   rejectPositionThunk   → PATCH /v1/positions/{id}/reject
 *   reopenPositionThunk   → PATCH /v1/positions/{id}/reopen
 */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as positionClient from "../../../api/positionClient";
import type { PositionRow, ExposureAggregation } from "../../../api/positionClient";
import type { TradeRow } from "../../../api/types";
import { extractErrorDetail } from "../../../lib/errors/extractDetail";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface PositionState {
  positions:       PositionRow[];
  loading:         boolean;
  error:           string | null;
  exposure:        ExposureAggregation[];
  exposureLoading: boolean;
  /** ID of the position currently undergoing a lifecycle transition */
  lifecycleLoading: string | null;
  lifecycleError:   string | null;
}

const initialState: PositionState = {
  positions:       [],
  loading:         false,
  error:           null,
  exposure:        [],
  exposureLoading: false,
  lifecycleLoading: null,
  lifecycleError:   null,
};

// ---------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------

export const listPositionsThunk = createAsyncThunk(
  "positions/list",
  async ({ token }: { token: string }, { rejectWithValue }) => {
    try {
      return await positionClient.listPositions(token);
    } catch (e: unknown) {
      return rejectWithValue((e as Error).message ?? "Failed to load positions");
    }
  },
);

export const createPositionThunk = createAsyncThunk(
  "positions/create",
  async (
    { trade, token }: { trade: TradeRow; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await positionClient.createPosition(trade, token);
    } catch (e: unknown) {
      return rejectWithValue(extractErrorDetail(e) || "Failed to create position");
    }
  },
);

export const updatePositionThunk = createAsyncThunk(
  "positions/update",
  async (
    { id, trade, token }: { id: string; trade: Partial<TradeRow>; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await positionClient.updatePosition(id, trade, token);
    } catch (e: unknown) {
      return rejectWithValue(extractErrorDetail(e) || "Failed to update position");
    }
  },
);

export const deletePositionThunk = createAsyncThunk(
  "positions/delete",
  async ({ id, token }: { id: string; token: string }, { rejectWithValue }) => {
    try {
      await positionClient.deletePosition(id, token);
      return id;
    } catch (e: unknown) {
      return rejectWithValue((e as Error).message ?? "Failed to delete position");
    }
  },
);

export const fetchExposureThunk = createAsyncThunk(
  "positions/exposure",
  async ({ token }: { token: string }, { rejectWithValue }) => {
    try {
      return await positionClient.getExposureAggregation(token);
    } catch (e: unknown) {
      return rejectWithValue((e as Error).message ?? "Failed to load exposure");
    }
  },
);

// ---------------------------------------------------------------------------
// Lifecycle thunks (Phase 0 — DB-backed, replaces Redux-only markExecuted)
// ---------------------------------------------------------------------------

function lifecycleErrorMsg(e: unknown, fallback: string): string {
  // Try nested { detail: { detail: "..." } } shape first (some endpoints
  // wrap twice); fall back to the standard extractor.
  if (typeof e === "object" && e !== null && "response" in e) {
    const r = (e as { response?: { data?: { detail?: unknown } } }).response;
    const d = r?.data?.detail;
    if (d && typeof d === "object" && "detail" in d && typeof (d as { detail: unknown }).detail === "string") {
      return (d as { detail: string }).detail;
    }
  }
  return extractErrorDetail(e) || fallback;
}

export const assignPolicyThunk = createAsyncThunk(
  "positions/assignPolicy",
  async (
    { id, policyInstanceId, token }: { id: string; policyInstanceId: string; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await positionClient.assignPolicy(id, policyInstanceId, token);
    } catch (e: unknown) {
      return rejectWithValue(lifecycleErrorMsg(e, "Failed to assign policy"));
    }
  },
);

export const markReadyThunk = createAsyncThunk(
  "positions/markReady",
  async (
    { id, runId, hedgeAmount, hedgeRate, token }: {
      id: string; runId: string;
      hedgeAmount?: number; hedgeRate?: number; token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await positionClient.markReadyToExecute(id, runId, hedgeAmount, hedgeRate, token);
    } catch (e: unknown) {
      return rejectWithValue(lifecycleErrorMsg(e, "Failed to mark ready"));
    }
  },
);

export const executePositionThunk = createAsyncThunk(
  "positions/execute",
  async (
    { id, executionRef, hedgeAmount, hedgeRate, token }: {
      id: string; executionRef: string;
      hedgeAmount?: number; hedgeRate?: number; token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await positionClient.executePosition(id, executionRef, hedgeAmount, hedgeRate, token);
    } catch (e: unknown) {
      return rejectWithValue(lifecycleErrorMsg(e, "Failed to execute position"));
    }
  },
);

export const rejectPositionThunk = createAsyncThunk(
  "positions/reject",
  async (
    { id, reason, token }: { id: string; reason: string; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await positionClient.rejectPosition(id, reason, token);
    } catch (e: unknown) {
      return rejectWithValue(lifecycleErrorMsg(e, "Failed to reject position"));
    }
  },
);

export const reopenPositionThunk = createAsyncThunk(
  "positions/reopen",
  async (
    { id, token }: { id: string; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await positionClient.reopenPosition(id, token);
    } catch (e: unknown) {
      return rejectWithValue(lifecycleErrorMsg(e, "Failed to reopen position"));
    }
  },
);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const positionSlice = createSlice({
  name: "positions",
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
    clearLifecycleError(state) {
      state.lifecycleError = null;
    },
    resetPositions(state) {
      state.positions       = [];
      state.exposure        = [];
      state.error           = null;
      state.lifecycleError  = null;
      state.lifecycleLoading = null;
    },
    /** Demo-mode only: add a position directly to local state without an API call */
    addLocalPosition(state, action: { payload: PositionRow }) {
      state.positions.unshift(action.payload);
      state.error = null;
    },
  },
  extraReducers(builder) {
    // ── List ──
    builder
      .addCase(listPositionsThunk.pending,   (s) => { s.loading = true;  s.error = null; })
      .addCase(listPositionsThunk.fulfilled, (s, a) => {
        s.loading   = false;
        s.positions = a.payload.items;
      })
      .addCase(listPositionsThunk.rejected,  (s, a) => {
        s.loading = false;
        s.error   = a.payload as string;
      });

    // ── Create ──
    builder
      .addCase(createPositionThunk.fulfilled, (s, a) => {
        s.positions.unshift(a.payload);
        s.error = null;
      })
      .addCase(createPositionThunk.rejected, (s, a) => {
        s.error = a.payload as string;
      });

    // ── Update ──
    builder
      .addCase(updatePositionThunk.fulfilled, (s, a) => {
        const idx = s.positions.findIndex((p) => p.id === a.payload.id);
        if (idx >= 0) s.positions[idx] = a.payload;
        s.error = null;
      })
      .addCase(updatePositionThunk.rejected, (s, a) => {
        s.error = a.payload as string;
      });

    // ── Delete ──
    builder
      .addCase(deletePositionThunk.fulfilled, (s, a) => {
        s.positions = s.positions.filter((p) => p.id !== a.payload);
        s.error = null;
      })
      .addCase(deletePositionThunk.rejected, (s, a) => {
        s.error = a.payload as string;
      });

    // ── Exposure ──
    builder
      .addCase(fetchExposureThunk.pending,   (s) => { s.exposureLoading = true; })
      .addCase(fetchExposureThunk.fulfilled, (s, a) => {
        s.exposureLoading = false;
        s.exposure        = a.payload;
      })
      .addCase(fetchExposureThunk.rejected,  (s) => {
        s.exposureLoading = false;
      });

    // ── Lifecycle transitions (Phase 0) ──
    // Helper: update a single position in the array from the API response
    const upsertPosition = (s: PositionState, updated: PositionRow) => {
      const idx = s.positions.findIndex((p) => p.id === updated.id);
      if (idx >= 0) s.positions[idx] = updated;
      s.lifecycleLoading = null;
      s.lifecycleError   = null;
    };
    const lifecyclePending = (s: PositionState, action: { meta: { arg: { id: string } } }) => {
      s.lifecycleLoading = action.meta.arg.id;
      s.lifecycleError   = null;
    };
    const lifecycleRejected = (s: PositionState, action: { payload: unknown }) => {
      s.lifecycleLoading = null;
      s.lifecycleError   = action.payload as string;
    };

    builder
      .addCase(assignPolicyThunk.pending,   lifecyclePending)
      .addCase(assignPolicyThunk.fulfilled, (s, a) => upsertPosition(s, a.payload))
      .addCase(assignPolicyThunk.rejected,  lifecycleRejected);

    builder
      .addCase(markReadyThunk.pending,   lifecyclePending)
      .addCase(markReadyThunk.fulfilled, (s, a) => upsertPosition(s, a.payload))
      .addCase(markReadyThunk.rejected,  lifecycleRejected);

    builder
      .addCase(executePositionThunk.pending,   lifecyclePending)
      .addCase(executePositionThunk.fulfilled, (s, a) => upsertPosition(s, a.payload))
      .addCase(executePositionThunk.rejected,  lifecycleRejected);

    builder
      .addCase(rejectPositionThunk.pending,   lifecyclePending)
      .addCase(rejectPositionThunk.fulfilled, (s, a) => upsertPosition(s, a.payload))
      .addCase(rejectPositionThunk.rejected,  lifecycleRejected);

    builder
      .addCase(reopenPositionThunk.pending,   lifecyclePending)
      .addCase(reopenPositionThunk.fulfilled, (s, a) => upsertPosition(s, a.payload))
      .addCase(reopenPositionThunk.rejected,  lifecycleRejected);
  },
});

export const {
  clearError, clearLifecycleError, resetPositions, addLocalPosition,
} = positionSlice.actions;

// markExecuted is intentionally removed — use executePositionThunk instead.
// Any component that imported markExecuted must be updated to use executePositionThunk.
export default positionSlice.reducer;
