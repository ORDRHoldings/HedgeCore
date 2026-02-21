/**
 * authSlice.ts — Redux slice for authentication state.
 *
 * Design:
 *  - authContext.tsx remains the authoritative source of truth for auth logic
 *    (login, logout, token refresh, /auth/me hydration).
 *  - This slice is a Redux *mirror* of that state, kept in sync so that any
 *    component that prefers useSelector over useAuth() gets the same data.
 *  - The `setAuthState` action is dispatched by authContext after every
 *    successful login, session restore, token refresh, or logout.
 *  - `loginThunk` delegates to the real backend and can be used by any
 *    component that wants to trigger login via Redux (e.g. a saga, middleware).
 */
import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import Cookies from "js-cookie";
import type { UserContext } from "../../authContext";

// ── Config ─────────────────────────────────────────────────────────────────────
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const _PROD_HOSTNAMES = ["hedgecore.vercel.app", "ordr-terminal.vercel.app"];
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" &&
  _PROD_HOSTNAMES.includes(window.location.hostname)
    ? "https://hedgecore.onrender.com/api"
    : "/api");

const ACCESS_TOKEN_KEY  = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

// ── State shape ────────────────────────────────────────────────────────────────
export interface AuthState {
  /** Full user context hydrated from /auth/me */
  user:    UserContext | null;
  /** JWT access token (mirrors cookie) */
  token:   string | null;
  loading: boolean;
  error:   string | null;
}

const initialState: AuthState = {
  user:    null,
  token:   typeof window !== "undefined" ? (Cookies.get(ACCESS_TOKEN_KEY) ?? null) : null,
  loading: false,
  error:   null,
};

// ── Helpers ────────────────────────────────────────────────────────────────────
async function _fetchMe(accessToken: string): Promise<UserContext | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Thunks ─────────────────────────────────────────────────────────────────────

/**
 * loginThunk — calls the real backend /auth/login (OAuth2 form),
 * stores cookies, and hydrates user context from /auth/me.
 *
 * Returns { token, user } on success or rejectWithValue(errorMsg) on failure.
 *
 * Note: authContext.tsx has its own login() that does the same thing — this
 * thunk is the Redux-native equivalent for components that prefer dispatch().
 */
export const loginThunk = createAsyncThunk(
  "auth/login",
  async (
    credentials: { username: string; password: string },
    { rejectWithValue },
  ) => {
    // ── Demo bypass (username=demo, password=demo) ──────────────────────────
    // Kept here so the thunk can be used stand-alone, but the primary login
    // path goes through authContext.login() which also handles this case.
    const DEMO_USER: UserContext = {
      id:              "00000000-0000-0000-0000-000000000000",
      email:           "demo@hedgecore.app",
      full_name:       "Demo User",
      job_title:       "Risk Analyst",
      is_active:       true,
      is_superuser:    false,
      company:         { id: "00000000-0000-0000-0000-000000000001", name: "Demo Corp", slug: "demo-corp" },
      branch:          { id: "00000000-0000-0000-0000-000000000002", name: "Headquarters", code: "HQ" },
      department:      null,
      roles:           ["risk_analyst"],
      permissions: [
        "trades.view", "trades.create", "trades.edit", "trades.import_csv",
        "hedges.view", "hedges.create", "hedges.edit",
        "calculate.run_sandbox",
        "pipeline.create_proposal",
        "policy.view",
        "market.view", "market.autofill",
        "reports.view_own_branch", "reports.export_pdf",
        "audit.view_own",
      ],
      hierarchy_level: 10,
    };

    if (DEMO_MODE && credentials.username === "demo" && credentials.password === "demo") {
      const demoToken = "demo_token_" + Date.now();
      Cookies.set(ACCESS_TOKEN_KEY, demoToken, { sameSite: "Strict", expires: 30 });
      return { token: demoToken, user: DEMO_USER };
    }

    // ── Real JWT login ─────────────────────────────────────────────────────
    try {
      const formData = new URLSearchParams();
      formData.append("username", credentials.username);
      formData.append("password", credentials.password);

      // 30-second timeout for Render free-tier cold starts
      const controller  = new AbortController();
      const timeoutId   = setTimeout(() => controller.abort(), 30_000);

      let res: Response;
      try {
        res = await fetch(`${API_BASE}/auth/login`, {
          method:  "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body:    formData.toString(),
          signal:  controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return rejectWithValue(
          (err as { detail?: string }).detail || "Authentication failed",
        );
      }

      const data = await res.json();
      Cookies.set(ACCESS_TOKEN_KEY,  data.access_token,  { sameSite: "Strict" });
      Cookies.set(REFRESH_TOKEN_KEY, data.refresh_token, { sameSite: "Strict" });

      // Hydrate user context
      const me = await _fetchMe(data.access_token);
      return { token: data.access_token as string, user: me };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return rejectWithValue("Server is waking up — please try again in a moment.");
      }
      const message = err instanceof Error ? err.message : "Network error";
      return rejectWithValue(message);
    }
  },
);

/**
 * logoutThunk — fires the backend logout (fire-and-forget), clears cookies.
 */
export const logoutThunk = createAsyncThunk("auth/logout", async (_, { getState }) => {
  const state = getState() as { auth: AuthState };
  const accessToken = state.auth.token;
  if (accessToken && !accessToken.startsWith("demo_token_")) {
    fetch(`${API_BASE}/auth/logout`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
  }
  Cookies.remove(ACCESS_TOKEN_KEY);
  Cookies.remove(REFRESH_TOKEN_KEY);
});

// ── Slice ──────────────────────────────────────────────────────────────────────
const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    /**
     * setAuthState — called by authContext after any auth state change
     * (login, session restore, token refresh, logout).
     * Keeps Redux mirror in sync without duplicating logic.
     */
    setAuthState(
      state,
      action: PayloadAction<{ token: string | null; user: UserContext | null }>,
    ) {
      state.token = action.payload.token;
      state.user  = action.payload.user;
      state.error = null;
    },

    /** clearError — reset the error field without touching auth state. */
    clearError(state) {
      state.error = null;
    },

    /**
     * logout — synchronous logout (clears local Redux state).
     * Use logoutThunk for the full flow (backend call + cookies + state).
     */
    logout(state) {
      state.user  = null;
      state.token = null;
      state.error = null;
      Cookies.remove(ACCESS_TOKEN_KEY);
      Cookies.remove(REFRESH_TOKEN_KEY);
    },
  },
  extraReducers: (builder) => {
    // ── loginThunk ──
    builder
      .addCase(loginThunk.pending, (state) => {
        state.loading = true;
        state.error   = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.token   = action.payload.token;
        state.user    = action.payload.user;
        state.error   = null;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.loading = false;
        state.error   = action.payload as string;
      });

    // ── logoutThunk ──
    builder
      .addCase(logoutThunk.fulfilled, (state) => {
        state.user  = null;
        state.token = null;
        state.error = null;
      });
  },
});

export const { setAuthState, clearError, logout } = authSlice.actions;
export default authSlice.reducer;
