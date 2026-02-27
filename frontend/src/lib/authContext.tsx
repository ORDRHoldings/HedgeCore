"use client";

/**
 * authContext.tsx
 *
 * Authentication context for HedgeCalc / ORDR Terminal.
 *
 * JWT auth — POST /auth/login → JWT tokens, GET /auth/me → user context.
 * Supports silent token refresh (25-min schedule for 30-min tokens).
 *
 * Usage:
 *   <AuthProvider>
 *     <App />
 *   </AuthProvider>
 *
 *   const { user, isAuthenticated, login, logout, hasPermission } = useAuth();
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
import Cookies from "js-cookie";
import { store } from "./store";
import { setAuthState } from "./store/slices/authSlice";
import { API_BASE } from "@/lib/api/apiBase";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

// ── Token expiry helpers ───────────────────────────────────────────────────────
function _parseJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Returns true if the token is expired or will expire within the next 60 seconds. */
function _isTokenExpired(token: string): boolean {
  const exp = _parseJwtExp(token);
  if (exp === null) return true;
  return Date.now() / 1000 >= exp - 60;
}

// ── Types ─────────────────────────────────────────────────────────────────────
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
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  user: UserContext | null;
  login: (
    username: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  hasPermission: (codename: string) => boolean;
  hasAnyPermission: (...codenames: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  token: null,
  user: null,
  login: async () => ({ success: false, error: "AuthProvider not mounted" }),
  logout: () => {},
  hasPermission: () => false,
  hasAnyPermission: () => false,
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return Cookies.get(ACCESS_TOKEN_KEY) ?? null;
  });
  const [user, setUser] = useState<UserContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dedup: if a refresh is already in-flight, reuse the same promise
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  // ── Fetch /auth/me to hydrate user context ──
  const fetchMe = useCallback(async (accessToken: string): Promise<UserContext | null> => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-API-Key": (typeof window !== "undefined" && localStorage.getItem("hc_api_key")) || "HC_DEV_KEY_001",
        },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  // ── Refresh token flow (deduplicated) ──
  const refreshTokens = useCallback(async (): Promise<string | null> => {
    // Return in-flight promise if one already exists (prevents race conditions)
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const refreshToken = Cookies.get(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    const promise = (async (): Promise<string | null> => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return null;

        const data = await res.json();
        Cookies.set(ACCESS_TOKEN_KEY, data.access_token, { sameSite: "Strict" });
        Cookies.set(REFRESH_TOKEN_KEY, data.refresh_token, { sameSite: "Strict" });
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
    // Refresh 5 minutes before expiry (25 min)
    refreshTimerRef.current = setTimeout(async () => {
      const newToken = await refreshTokens();
      if (newToken) {
        setToken(newToken);
        // Re-fetch user context after token refresh to keep Redux mirror fresh
        const me = await fetchMe(newToken);
        if (me) setUser(me);
        store.dispatch(setAuthState({ token: newToken, user: me ?? null }));
        scheduleRefresh();
      }
    }, 25 * 60 * 1000);
  }, [refreshTokens, fetchMe]);

  // ── Initialize session on mount ──
  useEffect(() => {
    const init = async () => {
      // Try stored access token — check expiry locally before making a round-trip
      const storedToken = Cookies.get(ACCESS_TOKEN_KEY);
      if (storedToken && !_isTokenExpired(storedToken)) {
        const me = await fetchMe(storedToken);
        if (me) {
          setToken(storedToken);
          setUser(me);
          store.dispatch(setAuthState({ token: storedToken, user: me }));
          scheduleRefresh();
          setIsLoading(false);
          return;
        }
      }

      // Access token missing or expired — try refresh
      if (storedToken || Cookies.get(REFRESH_TOKEN_KEY)) {
        const newToken = await refreshTokens();
        if (newToken) {
          const me2 = await fetchMe(newToken);
          if (me2) {
            setToken(newToken);
            setUser(me2);
            store.dispatch(setAuthState({ token: newToken, user: me2 }));
            scheduleRefresh();
            setIsLoading(false);
            return;
          }
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
    ): Promise<{ success: boolean; error?: string }> => {
      // Real JWT login (username field is treated as email by backend OAuth2 form)
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
        Cookies.set(ACCESS_TOKEN_KEY, data.access_token, { sameSite: "Strict" });
        Cookies.set(REFRESH_TOKEN_KEY, data.refresh_token, { sameSite: "Strict" });
        setToken(data.access_token);

        // Fetch user context
        const me = await fetchMe(data.access_token);
        if (me) {
          setUser(me);
          scheduleRefresh();
        }
        store.dispatch(setAuthState({ token: data.access_token as string, user: me ?? null }));

        return { success: true };
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

  // ── Logout ──
  const logout = useCallback(() => {
    // Fire-and-forget backend logout
    const accessToken = Cookies.get(ACCESS_TOKEN_KEY);
    if (accessToken) {
      fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {});
    }

    Cookies.remove(ACCESS_TOKEN_KEY);
    Cookies.remove(REFRESH_TOKEN_KEY);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setToken(null);
    setUser(null);
    store.dispatch(setAuthState({ token: null, user: null }));
  }, []);

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
        hasPermission,
        hasAnyPermission,
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
