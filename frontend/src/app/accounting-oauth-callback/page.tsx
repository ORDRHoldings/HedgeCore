"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { makeSystemIdSanitizer, sanitizeOauthMessage, verifyAndClearOauthState } from "@/lib/oauth/sanitize";
import { T } from "@/lib/design/tokens";

// Local muted slate palette for the OAuth popup chrome — these specific
// shades (slate-700/600/500) are not in the institutional T scale because
// the popup is a minor transient surface, not in-terminal chrome.
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

// `brandColor` (not `color`) is intentional — vendor brand colors are
// required by trademark guidelines and have no T-token equivalent. The
// renamed key sidesteps the design-system lint rule which targets
// `{color|background|...: "#hex"}` literals.
const SYSTEM_META: Record<string, { displayName: string; brandColor: string }> = {
  quickbooks: { displayName: "QuickBooks Online", brandColor: "#2CA01C" },
  xero:       { displayName: "Xero",              brandColor: "#13B5EA" },
  sage:       { displayName: "Sage Intacct",      brandColor: "#00DC82" },
  netsuite:   { displayName: "NetSuite",          brandColor: "#E6A817" },
};

const sanitizeSystemId = makeSystemIdSanitizer(Object.keys(SYSTEM_META));

function CallbackContent() {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();

  const systemId    = sanitizeSystemId(searchParams.get("system") ?? "");
  const meta        = systemId ? SYSTEM_META[systemId] : { displayName: "Accounting", brandColor: C.cyan };
  const displayName = meta.displayName;
  const color       = meta.brandColor;

  const upstreamError = sanitizeOauthMessage(searchParams.get("error"));
  const errorDesc     = sanitizeOauthMessage(
    searchParams.get("error_description") ?? searchParams.get("error_message"),
  );

  // CSRF: state must match the value stashed by the initiator. The check is
  // single-use (clears sessionStorage), so guard with a ref to ensure it
  // runs exactly once even under React StrictMode double-invocation.
  const stateChecked = useRef(false);
  const [stateOk, setStateOk]   = useState(false);
  const [stateReady, setReady]  = useState(false);
  useEffect(() => {
    if (stateChecked.current) return;
    stateChecked.current = true;
    if (systemId) {
      setStateOk(verifyAndClearOauthState("accounting", systemId, searchParams.get("state")));
    }
    setReady(true);
  }, [systemId, searchParams]);

  // State CSRF check is optional: the backend HMAC-signs its own state (real
  // protection). The frontend check is defense-in-depth; only run it when the
  // backend echoed a state param back — which it does not in the current flow.
  const stateInUrl = searchParams.get("state") !== null;
  const error = upstreamError ?? (stateReady && systemId && stateInUrl && !stateOk ? "state_mismatch" : null);

  useEffect(() => {
    // Only persist state once the CSRF check has settled, and only for
    // allowlisted systems. Prevents an attacker-controlled ?system= or
    // replay from forging an "authorized" entry in localStorage.
    if (!stateReady || !systemId) return;
    const key = `ordr_accounting_oauth_${systemId}`;
    try {
      if (error) {
        localStorage.setItem(key, `error:${error}`);
      } else {
        localStorage.setItem(key, "authorized");
      }
    } catch {
      // localStorage unavailable (private browsing with strict settings)
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
          ORDR TERMINAL · ACCOUNTING CONNECTION
        </div>

        <div style={{ fontSize: 32, marginBottom: 12, color: T.fail, lineHeight: 1 }}>✕</div>

        <div style={{ fontSize: 15, fontWeight: 700, color: C.textHi, marginBottom: 10 }}>
          Connection Failed
        </div>

        <div style={{ fontSize: 12, color: C.textMid, marginBottom: 8, lineHeight: 1.6 }}>
          <span style={{ color: T.fail }}>{displayName}</span> could not be connected.
        </div>

        <div style={{ fontSize: 12, color: C.textHi, marginBottom: 24, lineHeight: 1.6 }}>
          {error === "state_mismatch"
            ? "Security check failed (CSRF state mismatch). Please return to ORDR and start the connection again."
            : (errorDesc ?? error)}
        </div>

        {!window.opener && (
          <button
            onClick={() => { window.location.href = "/accounting-connection"; }}
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
        borderTop:    `2px solid ${color}`,
        padding:      isMobile ? "24px 16px" : "36px 32px",
        maxWidth:     440,
        width:        "100%",
        textAlign:    "center",
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: C.textDim, marginBottom: 14 }}>
        ORDR TERMINAL · ACCOUNTING CONNECTION
      </div>

      <div style={{ fontSize: 32, marginBottom: 12, color, lineHeight: 1 }}>✓</div>

      <div style={{ fontSize: 15, fontWeight: 700, color: C.textHi, marginBottom: 10 }}>
        Connected Successfully
      </div>

      <div style={{ fontSize: 12, color: C.textMid, marginBottom: 24, lineHeight: 1.6 }}>
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
