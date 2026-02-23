/**
 * positionSlice.ts — Redux slice for DB-backed FX exposure positions.
 *
 * Thunks wrap positionClient API calls.
 * State is updated optimistically after each successful API response.
 */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as positionClient from "../../../api/positionClient";
import type { PositionRow, ExposureAggregation } from "../../../api/positionClient";
import type { TradeRow } from "../../../api/types";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface PositionState {
  positions:      PositionRow[];
  loading:        boolean;
  error:          string | null;
  exposure:       ExposureAggregation[];
  exposureLoading: boolean;
  /** Frontend-only: IDs of positions marked as executed (persists in session) */
  executedIds:    string[];
  /** Frontend-only: map of position id → IBKR reference string */
  ibkrRefs:       Record<string, string>;
}

const initialState: PositionState = {
  positions:       [],
  loading:         false,
  error:           null,
  exposure:        [],
  exposureLoading: false,
  executedIds:     [],
  ibkrRefs:        {},
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
      const msg =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e as any)?.response?.data?.detail ??
        (e as Error).message ??
        "Failed to create position";
      return rejectWithValue(msg as string);
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
      const msg =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e as any)?.response?.data?.detail ??
        (e as Error).message ??
        "Failed to update position";
      return rejectWithValue(msg as string);
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
// Slice
// ---------------------------------------------------------------------------

const positionSlice = createSlice({
  name: "positions",
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
    resetPositions(state) {
      state.positions  = [];
      state.exposure   = [];
      state.error      = null;
      state.executedIds = [];
      state.ibkrRefs    = {};
    },
    /** Demo-mode only: add a position directly to local state without an API call */
    addLocalPosition(state, action: { payload: PositionRow }) {
      state.positions.unshift(action.payload);
      state.error = null;
    },
    /** Frontend-only: mark a CONFIRMED position as executed (IBKR workflow) */
    markExecuted(state, action: { payload: { id: string; ibkr_ref?: string } }) {
      const { id, ibkr_ref } = action.payload;
      if (!state.executedIds.includes(id)) {
        state.executedIds.push(id);
      }
      if (ibkr_ref) {
        state.ibkrRefs[id] = ibkr_ref;
      }
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
  },
});

export const { clearError, resetPositions, markExecuted, addLocalPosition } = positionSlice.actions;
export default positionSlice.reducer;
