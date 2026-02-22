"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

function CallbackContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const system = searchParams.get("system") ?? "ERP";
    const key    = `ordr_erp_oauth_${system.toLowerCase()}`;
    try {
      localStorage.setItem(key, "authorized");
    } catch {
      // localStorage unavailable (e.g. private browsing with strict settings)
    }

    // If opened as a popup, close it; otherwise stay on page
    if (window.opener) {
      window.close();
    }
  }, [searchParams]);

  const system = searchParams.get("system") ?? "ERP";

  return (
    <div
      style={{
        background:   "#111827",
        border:       "1px solid #1e293b",
        borderTop:    "2px solid #22d3ee",
        padding:      "36px 32px",
        maxWidth:     440,
        width:        "100%",
        textAlign:    "center",
      }}
    >
      <div style={{ fontSize: 9, letterSpacing: "0.1em", color: "#64748b", marginBottom: 14 }}>
        ORDR TERMINAL · OAUTH 2.0
      </div>

      <div style={{ fontSize: 32, marginBottom: 12, color: "#22d3ee", lineHeight: 1 }}>✓</div>

      <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 10 }}>
        Authorization Successful
      </div>

      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 24, lineHeight: 1.6 }}>
        <span style={{ color: "#22d3ee" }}>{system}</span> has been authorized.
        This window will close automatically.
      </div>

      <span
        style={{
          fontSize:      9,
          letterSpacing: "0.08em",
          fontWeight:    700,
          color:         "#22d3ee",
          background:    "color-mix(in srgb, #22d3ee 10%, transparent)",
          border:        "1px solid color-mix(in srgb, #22d3ee 25%, transparent)",
          padding:       "4px 14px",
          display:       "inline-block",
          borderRadius:  2,
        }}
      >
        AUTHORIZED
      </span>
    </div>
  );
}

export default function ErpOAuthCallbackPage() {
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
