"use client";

/**
 * authContext.tsx
 *
 * Authentication context for HedgeCalc / ORDR Terminal.
 *
 * Token storage strategy (XSS-hardened):
 *   access_token  — in-memory React state only (cleared on tab close)
 *   refresh_token — httpOnly cookie set by backend (JS cannot read)
 *
 * Refresh flow: POST /auth/refresh with credentials:'include'
 * (browser sends rt httpOnly cookie automatically — no token in JS body)
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { store } from "./store";
import { setAuthState } from "./store/slices/authSlice";
import { API_BASE } from "@/lib/api/apiBase";

// ── Types ─────────────────────────────────────────────────────────────────────
export type PlanTier = "lite" | "smb" | "professional" | "enterprise" | "intelligence";

export interface UserContext {
  id: string;
  email: string;
  full_name: string | null;
  job_title: string | null;
  is_active: boolean;
  is_superuser: boolean;
  company: { id: string; name: string; slug: string } | null;
  branch: { id: string; name: string; code: string } | null;
  department: { id: string; name: string; code: string } | null;
  roles: string[];
  permissions: string[];
  hierarchy_level: number | null;
  plan_tier: PlanTier;
}

type LoginResult = { success: boolean; error?: string; accessToken?: string };

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  user: UserContext | null;
  login: (
    username: string,
    password: string,
  ) => Promise<LoginResult>;
  logout: () => void;
  completeMfa: (accessToken: string) => Promise<boolean>;
  hasPermission: (codename: string) => boolean;
  hasAnyPermission: (...codenames: string[]) => boolean;
  /** Attempt a silent token refresh. Returns new access token or null. */
  refreshTokens: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  token: null,
  user: null,
  login: async () => ({ success: false, error: "AuthProvider not mounted" }),
  logout: () => {},
  completeMfa: async () => false,
  hasPermission: () => false,
  hasAnyPermission: () => false,
  refreshTokens: async () => null,
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  // access_token lives only in memory — never persisted to JS-readable storage
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dedup: if a refresh is already in-flight, reuse the same promise
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  // ── Fetch /auth/me to hydrate user context ──
  const fetchMe = useCallback(async (accessToken: string): Promise<UserContext | null> => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      // Ensure plan_tier always has a default — use most restrictive tier
      if (!data.plan_tier) data.plan_tier = "lite";
      return data;
    } catch {
      return null;
    }
  }, []);

  // ── Refresh token flow (deduplicated) ──
  // refresh_token is in httpOnly cookie — browser sends it automatically via credentials:'include'
  const refreshTokens = useCallback(async (): Promise<string | null> => {
    // Return in-flight promise if one already exists (prevents race conditions)
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const promise = (async (): Promise<string | null> => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",   // sends httpOnly rt cookie
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}), // no refresh_token in body (cookie-first)
        });
        if (!res.ok) return null;

        const data = await res.json();
        return data.access_token as string;
      } catch {
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = promise;
    return promise;
  }, []);

  // ── Schedule silent refresh (5 minutes before 30-min expiry) ──
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(async () => {
      const newToken = await refreshTokens();
      if (newToken) {
        setToken(newToken);
        const me = await fetchMe(newToken);
        if (me) setUser(me);
        store.dispatch(setAuthState({ token: newToken, user: me ?? null }));
        scheduleRefresh();
      }
    }, 25 * 60 * 1000);
  }, [refreshTokens, fetchMe]);

  // ── Initialize session on mount ──
  // Since access_token is in-memory only, attempt a silent refresh on mount.
  // The backend will use the httpOnly rt cookie if present.
  useEffect(() => {
    const init = async () => {
      const newToken = await refreshTokens();
      if (newToken) {
        const me = await fetchMe(newToken);
        if (me) {
          setToken(newToken);
          setUser(me);
          store.dispatch(setAuthState({ token: newToken, user: me }));
          scheduleRefresh();
          setIsLoading(false);
          return;
        }
      }

      // No valid session
      setToken(null);
      setUser(null);
      store.dispatch(setAuthState({ token: null, user: null }));
      setIsLoading(false);
    };

    init();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Login ──
  const login = useCallback(
    async (
      username: string,
      password: string,
    ): Promise<LoginResult> => {
      try {
        const formData = new URLSearchParams();
        formData.append("username", username);
        formData.append("password", password);

        // 30-second timeout — Render free tier cold-starts can take ~20 s
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);

        let res: Response;
        try {
          res = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            credentials: "include",  // receive httpOnly rt cookie from response
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString(),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return {
            success: false,
            error: err.detail || "Authentication failed",
          };
        }

        const data = await res.json();
        // access_token stored in memory only — not in any JS-readable cookie
        setToken(data.access_token);

        const me = await fetchMe(data.access_token);
        if (me) {
          setUser(me);
          scheduleRefresh();
        }
        store.dispatch(setAuthState({ token: data.access_token as string, user: me ?? null }));

        return { success: true, accessToken: data.access_token as string };
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return {
            success: false,
            error: "Server is waking up — please try again in a moment.",
          };
        }
        const message = err instanceof Error ? err.message : "Network error";
        return { success: false, error: message };
      }
    },
    [fetchMe, scheduleRefresh],
  );

  const completeMfa = useCallback(async (accessToken: string): Promise<boolean> => {
    setToken(accessToken);
    const me = await fetchMe(accessToken);
    if (!me) return false;
    setUser(me);
    store.dispatch(setAuthState({ token: accessToken, user: me }));
    scheduleRefresh();
    return true;
  }, [fetchMe, scheduleRefresh]);

  // ── Logout ──
  const logout = useCallback(() => {
    if (token) {
      fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }

    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setToken(null);
    setUser(null);
    store.dispatch(setAuthState({ token: null, user: null }));
  }, [token]);

  // ── Permission helpers ──
  const hasPermission = useCallback(
    (codename: string): boolean => {
      if (!user) return false;
      if (user.is_superuser) return true;
      return user.permissions.includes(codename);
    },
    [user],
  );

  const hasAnyPermission = useCallback(
    (...codenames: string[]): boolean => {
      if (!user) return false;
      if (user.is_superuser) return true;
      return codenames.some((c) => user.permissions.includes(c));
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!token,
        isLoading,
        token,
        user,
        login,
        logout,
        completeMfa,
        hasPermission,
        hasAnyPermission,
        refreshTokens,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}

export default AuthContext;
