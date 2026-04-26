"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { makeSystemIdSanitizer, sanitizeOauthMessage, verifyAndClearOauthState } from "@/lib/oauth/sanitize";
import { T } from "@/lib/design/tokens";

// OAuth popup chrome — same muted slate palette used across the OAuth
// callback popups. Not in T because the popup is a transient minor
// surface, not in-terminal chrome. ERP cyan is a popup brand accent.
const C = {
  bgDeep:   "#0a0e14",
  bgPanel:  "#111827",
  border:   "#1e293b",
  borderHi: "#334155",
  textHi:   "#e2e8f0",
  textMid:  "#94a3b8",
  textDim:  "#64748b",
  cyan:     "#22d3ee",
} as const;

// Must match the ERPTab union in app/erp-integration/page.tsx exactly —
// the initiator polls `localStorage.ordr_erp_oauth_${ERPTab}` with the
// cased name, so we can NOT lowercase here.
const ERP_ALLOWLIST = ["SAP", "Oracle", "NetSuite", "Microsoft Dynamics"] as const;
const sanitizeSystemId = makeSystemIdSanitizer(ERP_ALLOWLIST, /* caseInsensitive */ false);

function CallbackContent() {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();

  const systemId  = sanitizeSystemId(searchParams.get("system") ?? "");
  const system    = systemId ?? "ERP";

  const upstreamError = sanitizeOauthMessage(searchParams.get("error"));
  const errorDesc     = sanitizeOauthMessage(
    searchParams.get("error_description") ?? searchParams.get("error_message"),
  );

  // CSRF: state must match the value stashed by the initiator. Single-use,
  // so guard with a ref to ensure exactly one invocation under StrictMode.
  const stateChecked = useRef(false);
  const [stateOk, setStateOk]  = useState(false);
  const [stateReady, setReady] = useState(false);
  useEffect(() => {
    if (stateChecked.current) return;
    stateChecked.current = true;
    if (systemId) {
      setStateOk(verifyAndClearOauthState("erp", systemId, searchParams.get("state")));
    }
    setReady(true);
  }, [systemId, searchParams]);

  const error = upstreamError ?? (stateReady && systemId && !stateOk ? "state_mismatch" : null);

  useEffect(() => {
    // Only persist after the CSRF check has settled, and only for allowlisted
    // systems — prevents replays / forged callbacks from forging an
    // "authorized" entry in localStorage.
    if (!stateReady || !systemId) return;
    const key = `ordr_erp_oauth_${systemId}`;
    try {
      if (error) {
        localStorage.setItem(key, `error:${error}`);
      } else {
        localStorage.setItem(key, "authorized");
      }
    } catch {
      // localStorage unavailable (e.g. private browsing with strict settings)
    }

    if (window.opener) {
      setTimeout(() => window.close(), error ? 3500 : 800);
    }
  }, [stateReady, systemId, error]);

  if (error) {
    return (
      <div
        style={{
          background:   C.bgPanel,
          border:       `1px solid ${C.border}`,
          borderTop:    `2px solid ${T.fail}`,
          padding:      isMobile ? "24px 16px" : "36px 32px",
          maxWidth:     440,
          width:        "100%",
          textAlign:    "center",
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: "0.1em", color: C.textDim, marginBottom: 14 }}>
          ORDR TERMINAL · OAUTH 2.0
        </div>

        <div style={{ fontSize: 32, marginBottom: 12, color: T.fail, lineHeight: 1 }}>✕</div>

        <div style={{ fontSize: 15, fontWeight: 700, color: C.textHi, marginBottom: 10 }}>
          Authorization Failed
        </div>

        <div style={{ fontSize: 12, color: C.textMid, marginBottom: 8, lineHeight: 1.6 }}>
          <span style={{ color: T.fail }}>{system}</span> could not be authorized.
        </div>

        <div style={{ fontSize: 12, color: C.textHi, marginBottom: 24, lineHeight: 1.6 }}>
          {error === "state_mismatch"
            ? "Security check failed (CSRF state mismatch). Please return to ORDR and start the authorization again."
            : (errorDesc ?? error)}
        </div>

        {!window.opener && (
          <button
            onClick={() => { window.location.href = "/erp-integration"; }}
            style={{
              fontSize: 12,
              letterSpacing: "0.08em",
              fontWeight: 700,
              color: C.textHi,
              background: C.border,
              border: `1px solid ${C.borderHi}`,
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
        background:   C.bgPanel,
        border:       `1px solid ${C.border}`,
        borderTop:    `2px solid ${C.cyan}`,
        padding:      isMobile ? "24px 16px" : "36px 32px",
        maxWidth:     440,
        width:        "100%",
        textAlign:    "center",
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: C.textDim, marginBottom: 14 }}>
        ORDR TERMINAL · OAUTH 2.0
      </div>

      <div style={{ fontSize: 32, marginBottom: 12, color: C.cyan, lineHeight: 1 }}>✓</div>

      <div style={{ fontSize: 15, fontWeight: 700, color: C.textHi, marginBottom: 10 }}>
        Authorization Successful
      </div>

      <div style={{ fontSize: 12, color: C.textMid, marginBottom: 24, lineHeight: 1.6 }}>
        <span style={{ color: C.cyan }}>{system}</span> has been authorized.
        This window will close automatically.
      </div>

      <span
        style={{
          fontSize: 12,
          letterSpacing: "0.08em",
          fontWeight:    700,
          color:         C.cyan,
          background:    `color-mix(in srgb, ${C.cyan} 10%, transparent)`,
          border:        `1px solid color-mix(in srgb, ${C.cyan} 25%, transparent)`,
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
        background:     C.bgDeep,
        minHeight:      "100vh",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontFamily:     "'IBM Plex Mono', monospace",
      }}
    >
      <Suspense fallback={
        <div style={{ color: C.textDim, fontSize: 12, letterSpacing: "0.08em" }}>
          CONNECTING…
        </div>
      }>
        <CallbackContent />
      </Suspense>
    </div>
  );
}
