"use client";
/**
 * useSearchParamsState — sync URL search params ↔ component state.
 * Critical for deep-linkable slide-overs and modals.
 *
 * Usage:
 *   const [positionId, setPositionId] = useSearchParamsState("position");
 *   // URL: /exposures?position=P-123 → positionId = "P-123"
 *   setPositionId("P-456"); // → /exposures?position=P-456
 *   setPositionId(null);    // → /exposures (removes param)
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

export function useSearchParamsState(
  key: string,
): [string | null, (value: string | null) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const value = searchParams.get(key);

  const setValue = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next == null || next === "") {
        params.delete(key);
      } else {
        params.set(key, next);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [key, pathname, router, searchParams],
  );

  return [value, setValue];
}

/** Manage multiple URL params at once */
export function useSearchParamsStateMap(
  keys: string[],
): [Record<string, string | null>, (updates: Record<string, string | null>) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const values: Record<string, string | null> = {};
  for (const k of keys) values[k] = searchParams.get(k);

  const setValues = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === "") params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return [values, setValues];
}
