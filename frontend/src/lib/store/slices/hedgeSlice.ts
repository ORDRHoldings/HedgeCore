import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { runHedge } from "../../api";
import type { HedgeRequest, HedgeRunResponse } from "../../types";

interface HedgeState {
  result: HedgeRunResponse | null;
  loading: boolean;
  error: string | null;
}

const initialState: HedgeState = {
  result: null,
  loading: false,
  error: null,
};

export const runHedgeThunk = createAsyncThunk(
  "hedge/run",
  async (request: HedgeRequest, { rejectWithValue }) => {
    try {
      return await runHedge(request);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { reason?: string; detail?: string } } })?.response?.data
          ?.reason ??
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Hedge calculation failed";
      return rejectWithValue(msg);
    }
  }
);

const hedgeSlice = createSlice({
  name: "hedge",
  initialState,
  reducers: {
    clearResult(state) {
      state.result = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runHedgeThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(runHedgeThunk.fulfilled, (state, action: PayloadAction<HedgeRunResponse>) => {
        state.loading = false;
        state.result = action.payload;
      })
      .addCase(runHedgeThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearResult } = hedgeSlice.actions;
export default hedgeSlice.reducer;
