"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

// Keyed by lowercase system ID
const SYSTEM_META: Record<string, { displayName: string; color: string }> = {
  quickbooks: { displayName: "QuickBooks Online", color: "#2CA01C" },
  xero:       { displayName: "Xero",              color: "#13B5EA" },
  sage:       { displayName: "Sage Intacct",       color: "#00DC82" },
  netsuite:   { displayName: "NetSuite",           color: "#E6A817" },
};

function CallbackContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const systemId = (searchParams.get("system") ?? "accounting").toLowerCase();
    const key      = `ordr_accounting_oauth_${systemId}`;
    try {
      localStorage.setItem(key, "authorized");
    } catch {
      // localStorage unavailable (private browsing with strict settings)
    }

    // If opened as popup, close it automatically
    if (window.opener) {
      window.close();
    }
  }, [searchParams]);

  const systemId    = (searchParams.get("system") ?? "").toLowerCase();
  const meta        = SYSTEM_META[systemId] ?? { displayName: systemId || "Accounting", color: "#22d3ee" };
  const displayName = meta.displayName;
  const color       = meta.color;

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
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#64748b", marginBottom: 14 }}>
        ORDR TERMINAL · ACCOUNTING CONNECTION
      </div>

      <div style={{ fontSize: 32, marginBottom: 12, color, lineHeight: 1 }}>✓</div>

      <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 10 }}>
        Connected Successfully
      </div>

      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 24, lineHeight: 1.6 }}>
        <span style={{ color }}>{displayName}</span> has been connected to ORDR.
        This window will close automatically.
      </div>

      <span
        style={{
          fontSize: 12,
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
        <div style={{ color: "#64748b", fontSize: 12, letterSpacing: "0.08em" }}>
          CONNECTING…
        </div>
      }>
        <CallbackContent />
      </Suspense>
    </div>
  );
}
