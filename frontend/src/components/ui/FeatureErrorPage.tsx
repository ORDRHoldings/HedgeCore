"use client";

/**
 * FeatureErrorPage — shared fallback UI for Next.js `error.tsx` segments.
 *
 * Usage:
 *   // app/<feature>/error.tsx
 *   "use client";
 *   import FeatureErrorPage from "@/components/ui/FeatureErrorPage";
 *   export default function Error({ error, reset }: { error: Error; reset: () => void }) {
 *     return <FeatureErrorPage feature="counterparties" error={error} reset={reset} />;
 *   }
 *
 * On mount this emits a Sentry event tagged `feature=<name>` so crashes
 * are grouped per-feature in triage.
 */

import { useEffect } from "react";
import { logger } from "@/lib/logger";

interface Props {
  feature: string;
  error: Error & { digest?: string };
  reset: () => void;
}

export default function FeatureErrorPage({ feature, error, reset }: Props) {
  useEffect(() => {
    logger.error(`[${feature}] segment crashed:`, error);
    import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.withScope((scope) => {
          scope.setTag("feature", feature);
          if (error.digest) scope.setTag("digest", error.digest);
          Sentry.captureException(error);
        });
      })
      .catch(() => {
        // Sentry not configured — already logged locally.
      });
  }, [feature, error]);

  return (
    <div
      style={{
        minHeight: 400,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-panel)",
        border: "1px solid var(--border-rim)",
        fontFamily: "'IBM Plex Mono','JetBrains Mono',monospace",
        padding: 32,
        margin: 16,
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: "0.7rem",
          color: "var(--accent-red,#B91C1C)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        {feature.replace(/-/g, " ")} — Error
      </div>
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--text-secondary)",
          maxWidth: 520,
          textAlign: "center",
          lineHeight: 1.6,
          marginBottom: 18,
        }}
      >
        Something went wrong loading this section. The error has been reported.
        You can try again, or navigate elsewhere and come back.
      </div>
      {error?.message && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--text-tertiary)",
            fontFamily: "'JetBrains Mono',monospace",
            maxWidth: 600,
            textAlign: "center",
            marginBottom: 18,
            opacity: 0.7,
          }}
        >
          {error.message}
        </div>
      )}
      <button
        onClick={reset}
        style={{
          fontSize: "0.7rem",
          fontFamily: "'IBM Plex Mono',monospace",
          color: "var(--accent-cyan)",
          background: "transparent",
          border: "1px solid var(--accent-cyan)",
          padding: "6px 18px",
          cursor: "pointer",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Retry
      </button>
    </div>
  );
}
