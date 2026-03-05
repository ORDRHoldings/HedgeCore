"use client";
/**
 * lib/auth/store.ts
 * Zustand store for auth state (client UI state only).
 * access_token lives in memory — never localStorage.
 */

import { create } from "zustand";
import type { UserContext } from "@/types/api";

interface AuthState {
  token: string | null;
  user: UserContext | null;
  isLoading: boolean;
  setToken: (token: string) => void;
  setUser: (user: UserContext) => void;
  setLoading: (v: boolean) => void;
  logout: () => void;
  hasPermission: (codename: string) => boolean;
  hasAnyPermission: (...codenames: string[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isLoading: true,

  setToken: (token) => set({ token }),
  setUser: (user) => set({ user }),
  setLoading: (v) => set({ isLoading: v }),

  logout: () => {
    set({ token: null, user: null, isLoading: false });
    // Clear CSRF cookie (if accessible)
    try {
      document.cookie =
        "csrf_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    } catch {
      /* ignore */
    }
  },

  hasPermission: (codename) => {
    const { user } = get();
    if (!user) return false;
    if (user.is_superuser) return true;
    return user.permissions.includes(codename);
  },

  hasAnyPermission: (...codenames) => {
    const { user } = get();
    if (!user) return false;
    if (user.is_superuser) return true;
    return codenames.some((c) => user.permissions.includes(c));
  },
}));
