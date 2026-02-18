"use client";

/**
 * authContext.tsx
 *
 * Standalone auth context for the FXDemo frontend.
 * Manages demo authentication via cookie-backed state.
 * No Redux dependency — fully self-contained React Context.
 *
 * Usage:
 *   <AuthProvider>
 *     <App />
 *   </AuthProvider>
 *
 *   const { isAuthenticated, token, login, logout } = useAuth();
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import Cookies from "js-cookie";

// ── Cookie key (must match what authSlice.ts uses) ──────────────────────────
const COOKIE_KEY = "access_token";

// ── Context shape ───────────────────────────────────────────────────────────
interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  login: (
    username: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  token: null,
  login: async () => ({ success: false, error: "AuthProvider not mounted" }),
  logout: () => {},
});

// ── Provider ────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialise from cookie so refreshes restore session
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return Cookies.get(COOKIE_KEY) ?? null;
  });

  // Re-check cookie on mount (handles SSR → client hydration)
  useEffect(() => {
    const stored = Cookies.get(COOKIE_KEY) ?? null;
    if (stored !== token) setToken(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (
      username: string,
      password: string,
    ): Promise<{ success: boolean; error?: string }> => {
      // Hardcoded demo credentials — same as authSlice.ts
      if (username === "demo" && password === "demo") {
        const demoToken = "demo_token_" + Date.now();
        Cookies.set(COOKIE_KEY, demoToken, { sameSite: "Strict" });
        setToken(demoToken);
        return { success: true };
      }
      return { success: false, error: "Invalid credentials. Use demo/demo" };
    },
    [],
  );

  const logout = useCallback(() => {
    Cookies.remove(COOKIE_KEY);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!token,
        token,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}

export default AuthContext;
