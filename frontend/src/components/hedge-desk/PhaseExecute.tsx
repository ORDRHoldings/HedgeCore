"use client";

import { useState } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import DisclosurePanel from "./DisclosurePanel";
import {
  LoaderIcon, CheckCircleIcon, AlertCircleIcon, ExternalLinkIcon, ChevronLeftIcon
} from "lucide-react";

const HD = {
  navy:    "#0A1F44",
  royal:   "#1C62F2",
  emerald: "#2ECC71",
  crimson: "#E74C3C",
  slate:   "#8A9AB5",
  bgPanel: "var(--bg-panel)",
  bgSub:   "var(--bg-sub)",
  bgDeep:  "var(--bg-deep)",
  rim:     "var(--border-rim)",
  soft:    "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:    "var(--accent-cyan)",
  amber:   "var(--accent-amber)",
  fontUI:  "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:"var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;

interface PhaseExecuteProps {
  proposalIds: string[];
  calcResult: Record<string, unknown>;
  token: string;
  governanceMode: "solo" | "team";
  onComplete: (fillData: { fillPrice: number; proposalIds: string[] }) => void;
  onBack: () => void;
}

function buildIbkrUrl(calcResult: Record<string, unknown>): string {
  const instrument = (calcResult.instrument as string) ?? "FORWARD";
  const currency   = (calcResult.currency as string) ?? "MXN";
  const hedgeAmount = (calcResult.hedge_amount as number) ?? 0;
  const hedgeRate   = (calcResult.hedge_rate as number) ?? 0;

  // Map common instruments to IBKR symbols
  const symbolMap: Record<string, string> = {
    MXN: "M6E", EUR: "6E", GBP: "6B", JPY: "6J", CAD: "6C", CHF: "6S", AUD: "6A",
  };
  const symbol   = symbolMap[currency] ?? "M6E";
  const side     = "SELL"; // Typically selling foreign currency to hedge AP
  const quantity = Math.max(1, Math.round(hedgeAmount / 500000)); // ~500k per contract
  const lmtPrice = hedgeRate > 0 ? hedgeRate.toFixed(6) : "0.000000";

  return `ibkr://order?symbol=${symbol}&secType=FUT&exchange=CME&side=${side}&quantity=${quantity}&orderType=LMT&lmtPrice=${lmtPrice}`;
}

export default function PhaseExecute({
  proposalIds,
  calcResult,
  token,
  governanceMode,
  onComplete,
  onBack,
}: PhaseExecuteProps) {
  const [fillPrice, setFillPrice]   = useState<string>("");
  const [executing, setExecuting]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [done, setDone]             = useState(false);

  const ibkrUrl = buildIbkrUrl(calcResult);

  const handleMarkHedged = async () => {
    setExecuting(true);
    setError(null);
    setAwaitingApproval(false);

    const parsedFillPrice = fillPrice ? parseFloat(fillPrice) : 0;

    try {
      const results = await Promise.allSettled(
        proposalIds.map(async (id) => {
          // Execute the proposal
          const execRes = await dashboardFetch(`/v1/proposals/${id}/execute`, token, {
            method: "POST",
            body: JSON.stringify({}),
          });

          if (execRes.status === 409) {
            throw Object.assign(new Error("NOT_APPROVED"), { code: 409 });
          }
          if (!execRes.ok) {
            const errData = await execRes.json().catch(() => ({}));
            throw new Error((errData as { detail?: string }).detail ?? `HTTP ${execRes.status}`);
          }

          // If fill price provided, PATCH fill data
          if (parsedFillPrice > 0) {
            await dashboardFetch(`/v1/proposals/${id}/fill`, token, {
              method: "PATCH",
              body: JSON.stringify({
                fill_price:     parsedFillPrice,
                fill_notional:  (calcResult.hedge_amount as number) ?? 0,
                fill_currency:  (calcResult.currency as string) ?? "MXN",
                fill_timestamp: new Date().toISOString(),
              }),
            }).catch(() => undefined); // fill is best-effort
          }
        })
      );

      // Check for 409 (awaiting approval) pattern
      const has409 = results.some(r => r.status === "rejected" && (r.reason as { code?: number })?.code === 409);
      const hasOtherErrors = results.some(r => r.status === "rejected" && (r.reason as { code?: number })?.code !== 409);

      if (has409 && governanceMode === "team") {
        setAwaitingApproval(true);
        setExecuting(false);
        return;
      }

      if (hasOtherErrors) {
        const firstError = results.find(r => r.status === "rejected" && (r.reason as { code?: number })?.code !== 409);
        throw (firstError as PromiseRejectedResult).reason;
      }

      setDone(true);
      onComplete({ fillPrice: parsedFillPrice, proposalIds });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Execution failed");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px 24px", height: "100%", overflowY: "auto" }}>

      {/* Back */}
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", alignSelf: "flex-start", padding: 0 }}>
        <ChevronLeftIcon size={14} color={HD.slate} />
        <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.slate, letterSpacing: "0.06em" }}>BACK TO REVIEW</span>
      </button>

      {/* Proposals list */}
      <div style={{ background: HD.bgPanel, border: `1px solid ${HD.rim}`, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ padding: "8px 14px", background: HD.bgSub, borderBottom: `1px solid ${HD.soft}` }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
            APPROVED PROPOSALS ({proposalIds.length})
          </span>
        </div>
        {proposalIds.map((id, i) => (
          <div key={id} style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 14px",
            borderBottom: i < proposalIds.length - 1 ? `1px solid ${HD.soft}` : "none",
            background: i % 2 === 0 ? HD.bgPanel : HD.bgSub,
          }}>
            <CheckCircleIcon size={12} color={HD.emerald} />
            <code style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.secondary }}>{id}</code>
          </div>
        ))}
      </div>

      {/* IBKR deep link */}
      <div style={{ background: HD.bgPanel, border: `1px solid ${HD.soft}`, borderRadius: 4, padding: "14px 16px" }}>
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
            IBKR TWS EXECUTION
          </span>
        </div>
        <DisclosurePanel title="IBKR Order Details" level="L2" defaultOpen>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 12 }}>
            {[
              ["INSTRUMENT",    (calcResult.instrument as string) ?? "FORWARD"],
              ["HEDGE AMOUNT",  calcResult.hedge_amount != null ? String(calcResult.hedge_amount) : "—"],
              ["HEDGE RATE",    calcResult.hedge_rate   != null ? (calcResult.hedge_rate as number).toFixed(6) : "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.08em" }}>{k}</span>
                <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 600, color: HD.primary }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.08em" }}>DEEP LINK URL</span>
            <div style={{ marginTop: 4, padding: "6px 8px", background: HD.bgSub, borderRadius: 2, border: `1px solid ${HD.soft}` }}>
              <code style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.slate, wordBreak: "break-all" }}>{ibkrUrl}</code>
            </div>
          </div>
        </DisclosurePanel>
        <a
          href={ibkrUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: HD.fontMono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: HD.royal,
            background: `color-mix(in srgb,${HD.royal} 8%,transparent)`,
            border: `1px solid color-mix(in srgb,${HD.royal} 30%,transparent)`,
            padding: "10px 20px",
            borderRadius: 3,
            textDecoration: "none",
            marginTop: 8,
          }}
        >
          <ExternalLinkIcon size={14} color={HD.royal} />
          OPEN IN IBKR TWS
        </a>
      </div>

      {/* Fill price */}
      <div style={{ background: HD.bgPanel, border: `1px solid ${HD.soft}`, borderRadius: 4, padding: "14px 16px" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
            ACTUAL FILL PRICE (OPTIONAL)
          </span>
          <input
            type="number"
            step="0.000001"
            min="0"
            value={fillPrice}
            onChange={e => setFillPrice(e.target.value)}
            placeholder="0.000000"
            style={{
              fontFamily: HD.fontMono,
              fontSize: 13,
              color: HD.primary,
              background: HD.bgSub,
              border: `1px solid ${HD.soft}`,
              borderRadius: 3,
              padding: "8px 12px",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
          <span style={{ fontFamily: HD.fontUI, fontSize: 11, color: HD.tertiary, lineHeight: 1.5 }}>
            If filled in IBKR, enter the actual execution price for slippage tracking.
          </span>
        </label>
      </div>

      {/* Awaiting approval notice */}
      {awaitingApproval && (
        <div style={{ padding: "12px 14px", background: `color-mix(in srgb,${HD.amber} 10%,transparent)`, border: `1px solid color-mix(in srgb,${HD.amber} 30%,transparent)`, borderRadius: 4, display: "flex", gap: 10 }}>
          <AlertCircleIcon size={16} color={HD.amber} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, color: HD.amber, marginBottom: 4 }}>
              AWAITING CHECKER APPROVAL
            </div>
            <div style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary }}>
              One or more proposals are not yet approved. Check the staging queue for pending checker sign-off.
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: "10px 14px", background: `color-mix(in srgb,${HD.crimson} 10%,transparent)`, border: `1px solid color-mix(in srgb,${HD.crimson} 30%,transparent)`, borderRadius: 4 }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.crimson }}>{error}</span>
        </div>
      )}

      {/* Done state */}
      {done && (
        <div style={{ padding: "12px 14px", background: `color-mix(in srgb,${HD.emerald} 8%,transparent)`, border: `1px solid color-mix(in srgb,${HD.emerald} 25%,transparent)`, borderRadius: 4, display: "flex", alignItems: "center", gap: 10 }}>
          <CheckCircleIcon size={16} color={HD.emerald} />
          <span style={{ fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, color: HD.emerald, letterSpacing: "0.08em" }}>
            HEDGED SUCCESSFULLY — ADVANCING PIPELINE...
          </span>
        </div>
      )}

      {/* Mark hedged button */}
      {!done && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "auto" }}>
          <button
            onClick={handleMarkHedged}
            disabled={executing}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
              color: "#ffffff",
              background: executing ? HD.slate : HD.emerald,
              border: "none",
              padding: "12px 28px",
              cursor: executing ? "not-allowed" : "pointer",
              borderRadius: 3,
            }}
          >
            {executing && <LoaderIcon size={14} color="#ffffff" style={{ animation: "spin 1s linear infinite" }} />}
            {!executing && <CheckCircleIcon size={14} color="#ffffff" />}
            MARK AS HEDGED
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
