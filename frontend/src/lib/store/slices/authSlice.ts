import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import Cookies from "js-cookie";
import api from "../../api";

interface AuthState {
  user: { id: string; email: string } | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  token: Cookies.get("access_token") ?? null,
  loading: false,
  error: null,
};

export const loadSessionThunk = createAsyncThunk(
  "auth/loadSession",
  async (_, { getState }) => {
    const state = getState() as { auth: AuthState };
    if (!state.auth.token) return null;
    // Token exists in cookie – we could validate it here
    return null;
  }
);

export const loginThunk = createAsyncThunk(
  "auth/login",
  async (credentials: { username: string; password: string }, { rejectWithValue }) => {
    try {
      // Hardcoded demo credentials for demo frontend
      if (credentials.username === "demo" && credentials.password === "demo") {
        // Generate a demo token
        const demoToken = "demo_token_" + Date.now();
        Cookies.set("access_token", demoToken, { sameSite: "Strict" });
        return {
          access_token: demoToken,
          user: { id: "demo", email: "demo@hedgecalc.com" }
        };
      } else {
        return rejectWithValue("Invalid credentials. Use demo/demo");
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Login failed";
      return rejectWithValue(msg);
    }
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      state.token = null;
      Cookies.remove("access_token");
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state, action: PayloadAction<{ access_token: string }>) => {
        state.loading = false;
        state.token = action.payload.access_token;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { logout, clearError } = authSlice.actions;
export default authSlice.reducer;
