"use client";

import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../../lib/store";

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export default function StaleSnapshotBanner() {
  const { sandboxResult } = useSelector((s: RootState) => s.pipeline);
  const [isStale, setIsStale] = useState(false);
  const [ageMinutes, setAgeMinutes] = useState(0);

  useEffect(() => {
    const asOf = (sandboxResult?.frozen_inputs?.market as any)?.as_of as string | undefined;
    if (!asOf) {
      setIsStale(false);
      return;
    }

    const check = () => {
      const age = Date.now() - new Date(asOf).getTime();
      setAgeMinutes(Math.floor(age / 60000));
      setIsStale(age > STALE_THRESHOLD_MS);
    };

    check();
    const timer = setInterval(check, 30000); // check every 30s
    return () => clearInterval(timer);
  }, [sandboxResult]);

  if (!isStale) return null;

  return (
    <div className="h-7 bg-[var(--accent-amber)]/10 border-b border-[var(--accent-amber)]/25 flex items-center justify-center gap-2 text-[0.6875rem] font-medium text-[var(--accent-amber)] shrink-0">
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        className="shrink-0"
      >
        <path
          d="M7 1L13 12H1L7 1z"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <path
          d="M7 5v3"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <circle cx="7" cy="10" r="0.5" fill="currentColor" />
      </svg>
      <span>
        Market snapshot is {ageMinutes}m old — API will block proposal creation
        and authorization
      </span>
    </div>
  );
}
