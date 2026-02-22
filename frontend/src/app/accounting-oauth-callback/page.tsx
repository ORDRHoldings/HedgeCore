"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

const SYSTEM_COLORS: Record<string, string> = {
  QuickBooks: "#2CA01C",
  Xero:       "#13B5EA",
  Sage:       "#00DC82",
  NetSuite:   "#E6A817",
};

function CallbackContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const system = searchParams.get("system") ?? "accounting";
    const key    = `ordr_accounting_oauth_${system.toLowerCase()}`;
    try {
      localStorage.setItem(key, "authorized");
    } catch {
      // localStorage unavailable
    }

    // If opened as popup, close it automatically
    if (window.opener) {
      window.close();
    }
  }, [searchParams]);

  const system = searchParams.get("system") ?? "Accounting";
  const color  = SYSTEM_COLORS[system] ?? "#22d3ee";

  return (
    <div
      style={{
        background:   "#111827",
        border:       "1px solid #1e293b",
        borderTop:    `2px solid ${color}`,
        padding:      "36px 32px",
        maxWidth:     440,
        width:        "100%",
        textAlign:    "center",
      }}
    >
      <div style={{ fontSize: 9, letterSpacing: "0.1em", color: "#64748b", marginBottom: 14 }}>
        ORDR TERMINAL · ACCOUNTING CONNECTION
      </div>

      <div style={{ fontSize: 32, marginBottom: 12, color, lineHeight: 1 }}>✓</div>

      <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 10 }}>
        Connected Successfully
      </div>

      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 24, lineHeight: 1.6 }}>
        <span style={{ color }}>{system}</span> has been connected to ORDR.
        This window will close automatically.
      </div>

      <span
        style={{
          fontSize:      9,
          letterSpacing: "0.08em",
          fontWeight:    700,
          color,
          background:    `color-mix(in srgb, ${color} 10%, transparent)`,
          border:        `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
          padding:       "4px 14px",
          display:       "inline-block",
          borderRadius:  2,
        }}
      >
        CONNECTED
      </span>
    </div>
  );
}

export default function AccountingOAuthCallbackPage() {
  return (
    <div
      style={{
        background:     "#0a0e14",
        minHeight:      "100vh",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontFamily:     "'IBM Plex Mono', monospace",
      }}
    >
      <Suspense fallback={
        <div style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.08em" }}>
          CONNECTING…
        </div>
      }>
        <CallbackContent />
      </Suspense>
    </div>
  );
}
