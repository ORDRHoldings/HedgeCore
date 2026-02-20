"use client";

/**
 * authContext.tsx
 *
 * Authentication context for HedgeCalc / ORDR Terminal.
 *
 * Supports two modes:
 *   1. Real JWT auth — POST /auth/login → JWT tokens, GET /auth/me → user context
 *   2. Demo mode — NEXT_PUBLIC_DEMO_MODE=true keeps demo/demo working
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

// ── Config ────────────────────────────────────────────────────────────────────
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" &&
  window.location.hostname === "hedgecore.vercel.app"
    ? "https://hedgecore.onrender.com/api"
    : "/api");

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

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
  isDemoMode: boolean;
}

// ── Demo user stub ────────────────────────────────────────────────────────────
const DEMO_USER: UserContext = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "demo@hedgecore.app",
  full_name: "Demo User",
  job_title: "Risk Analyst",
  is_active: true,
  is_superuser: false,
  company: { id: "00000000-0000-0000-0000-000000000001", name: "Demo Corp", slug: "demo-corp" },
  branch: { id: "00000000-0000-0000-0000-000000000002", name: "Headquarters", code: "HQ" },
  department: null,
  roles: ["risk_analyst"],
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

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  token: null,
  user: null,
  login: async () => ({ success: false, error: "AuthProvider not mounted" }),
  logout: () => {},
  hasPermission: () => false,
  hasAnyPermission: () => false,
  isDemoMode: DEMO_MODE,
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

  // ── Fetch /auth/me to hydrate user context ──
  const fetchMe = useCallback(async (accessToken: string): Promise<UserContext | null> => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  // ── Refresh token flow ──
  const refreshTokens = useCallback(async (): Promise<string | null> => {
    const refreshToken = Cookies.get(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

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
      return data.access_token;
    } catch {
      return null;
    }
  }, []);

  // ── Schedule silent refresh (5 minutes before 30-min expiry) ──
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    // Refresh 5 minutes before expiry (25 min)
    refreshTimerRef.current = setTimeout(async () => {
      const newToken = await refreshTokens();
      if (newToken) {
        setToken(newToken);
        scheduleRefresh();
      }
    }, 25 * 60 * 1000);
  }, [refreshTokens]);

  // ── Initialize session on mount ──
  useEffect(() => {
    const init = async () => {
      // Demo mode: instant auth
      if (DEMO_MODE) {
        const demoToken = Cookies.get(ACCESS_TOKEN_KEY);
        if (demoToken?.startsWith("demo_token_")) {
          setToken(demoToken);
          setUser(DEMO_USER);
        }
        setIsLoading(false);
        return;
      }

      // Real auth: try stored access token
      const storedToken = Cookies.get(ACCESS_TOKEN_KEY);
      if (storedToken && !storedToken.startsWith("demo_token_")) {
        const me = await fetchMe(storedToken);
        if (me) {
          setToken(storedToken);
          setUser(me);
          scheduleRefresh();
          setIsLoading(false);
          return;
        }

        // Access token expired — try refresh
        const newToken = await refreshTokens();
        if (newToken) {
          const me2 = await fetchMe(newToken);
          if (me2) {
            setToken(newToken);
            setUser(me2);
            scheduleRefresh();
            setIsLoading(false);
            return;
          }
        }
      }

      // No valid session
      setToken(null);
      setUser(null);
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
      // Demo mode fallback
      if (DEMO_MODE && username === "demo" && password === "demo") {
        const demoToken = "demo_token_" + Date.now();
        Cookies.set(ACCESS_TOKEN_KEY, demoToken, { sameSite: "Strict" });
        setToken(demoToken);
        setUser(DEMO_USER);
        return { success: true };
      }

      // Real JWT login (username field is treated as email by backend OAuth2 form)
      try {
        const formData = new URLSearchParams();
        formData.append("username", username);
        formData.append("password", password);

        const res = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        });

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

        return { success: true };
      } catch (err: unknown) {
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
    if (accessToken && !accessToken.startsWith("demo_token_")) {
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
        isDemoMode: DEMO_MODE,
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
