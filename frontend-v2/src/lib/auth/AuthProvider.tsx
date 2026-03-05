"use client";
/**
 * lib/auth/AuthProvider.tsx
 * Wraps the app — silently restores session on load, schedules token refresh.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "./store";
import { bindAuthStore, api } from "@/lib/api/client";
import type { UserContext } from "@/types/api";

const REFRESH_INTERVAL_MS = 25 * 60 * 1000; // refresh 5 min before expiry

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setToken, setUser, setLoading, logout, token } = useAuthStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Bind auth store to API client
  useEffect(() => {
    bindAuthStore(
      () => useAuthStore.getState().token,
      (t) => useAuthStore.getState().setToken(t),
      () => {
        useAuthStore.getState().logout();
      },
    );
  }, []);

  // Restore session on mount
  useEffect(() => {
    (async () => {
      try {
        // Try to refresh to restore session from httpOnly cookie
        const res = await fetch(`${api.base}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        if (res.ok) {
          const data = await res.json();
          setToken(data.access_token);

          // Fetch user context
          const user = await api.get<UserContext>("/auth/me");
          setUser(user);
        }
      } catch {
        // No valid session — user stays logged out
      } finally {
        setLoading(false);
      }
    })();
  }, [setToken, setUser, setLoading]);

  // Schedule periodic refresh
  useEffect(() => {
    if (!token) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${api.base}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          const data = await res.json();
          setToken(data.access_token);
        } else {
          logout();
        }
      } catch {
        logout();
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [token, setToken, logout]);

  return <>{children}</>;
}

// Hook for convenient access
export { useAuthStore };
