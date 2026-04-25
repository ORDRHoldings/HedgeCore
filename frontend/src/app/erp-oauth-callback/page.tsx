"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

function CallbackContent() {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();

  const system    = searchParams.get("system") ?? "ERP";
  const error     = searchParams.get("error");
  const errorDesc = searchParams.get("error_description") ?? searchParams.get("error_message");

  useEffect(() => {
    const key = `ordr_erp_oauth_${system.toLowerCase()}`;
    try {
      if (error) {
        localStorage.setItem(key, `error:${error}`);
      } else {
        localStorage.setItem(key, "authorized");
      }
    } catch {
      // localStorage unavailable (e.g. private browsing with strict settings)
    }

    // If opened as a popup, close it after a delay so user can read error
    if (window.opener) {
      setTimeout(() => window.close(), error ? 3500 : 800);
    }
  }, [searchParams, system, error]);

  if (error) {
    return (
      <div
        style={{
          background:   "#111827",
          border:       "1px solid #1e293b",
          borderTop:    "2px solid #DC2626",
          padding:      isMobile ? "24px 16px" : "36px 32px",
          maxWidth:     440,
          width:        "100%",
          textAlign:    "center",
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#64748b", marginBottom: 14 }}>
          ORDR TERMINAL · OAUTH 2.0
        </div>

        <div style={{ fontSize: 32, marginBottom: 12, color: "#DC2626", lineHeight: 1 }}>✕</div>

        <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 10 }}>
          Authorization Failed
        </div>

        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8, lineHeight: 1.6 }}>
          <span style={{ color: "#DC2626" }}>{system}</span> could not be authorized.
        </div>

        <div style={{ fontSize: 12, color: "#e2e8f0", marginBottom: 24, lineHeight: 1.6 }}>
          {errorDesc ?? error}
        </div>

        {!window.opener && (
          <button
            onClick={() => { window.location.href = "/erp-integration"; }}
            style={{
              fontSize: 12,
              letterSpacing: "0.08em",
              fontWeight: 700,
              color: "#e2e8f0",
              background: "#1e293b",
              border: "1px solid #334155",
              padding: "6px 16px",
              borderRadius: 2,
              cursor: "pointer",
            }}
          >
            RETURN TO ORDR
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        background:   "#111827",
        border:       "1px solid #1e293b",
        borderTop:    "2px solid #22d3ee",
        padding:      isMobile ? "24px 16px" : "36px 32px",
        maxWidth:     440,
        width:        "100%",
        textAlign:    "center",
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#64748b", marginBottom: 14 }}>
        ORDR TERMINAL · OAUTH 2.0
      </div>

      <div style={{ fontSize: 32, marginBottom: 12, color: "#22d3ee", lineHeight: 1 }}>✓</div>

      <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 10 }}>
        Authorization Successful
      </div>

      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 24, lineHeight: 1.6 }}>
        <span style={{ color: "#22d3ee" }}>{system}</span> has been authorized.
        This window will close automatically.
      </div>

      <span
        style={{
          fontSize: 12,
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
        <div style={{ color: "#64748b", fontSize: 12, letterSpacing: "0.08em" }}>
          CONNECTING…
        </div>
      }>
        <CallbackContent />
      </Suspense>
    </div>
  );
}
