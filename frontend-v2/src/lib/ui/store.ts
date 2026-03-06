"use client";
/**
 * lib/ui/store.ts
 * Shared UI state — sidebar collapsed width so layout can track it.
 */

import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  setSidebarCollapsed: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  sidebarWidth: 232,
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v, sidebarWidth: v ? 56 : 232 }),
}));
