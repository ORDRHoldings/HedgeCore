"use client";

/**
 * /natural-hedging — Natural Hedging Optimizer.
 *
 * "Analyze" pulls tenant positions, aggregates AR-AP per currency, feeds the
 * `currency_netting_matrix` engine, and shows how much hedge notional can be
 * eliminated via internal offsets + synthetic crosses.
 */

import { useState } from "react";
import { useAuth } from "@/lib/authContext";
import {
  analyzeFromPositions,
  type FromPositionsResponse,
} from "@/lib/api/naturalHedgingClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  textPri: "var(--text-primary)",
  textSec: "var(--text-secondary)",
} as const;

const fmtNum = (n: number, digits = 0) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export default function NaturalHedgingPage() {
  const { token } = useAuth();
  const [reporting, setReporting] = useState("USD");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "CONFIRMED" | "FORECAST">("CONFIRMED");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FromPositionsResponse | null>(null);

  const run = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const statuses = statusFilter === "ALL" ? undefined : [statusFilter];
      const r = await analyzeFromPositions(token, reporting, undefined, statuses);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "analyze failed");
    } finally {
      setLoading(false);
    }
  };

  const n = result?.netting;
  const reduction =
    n && n.gross_notional_before > 0
      ? ((n.gross_notional_before - n.gross_notional_after) / n.gross_notional_before) * 100
      : 0;

  return (
    <div style={{ padding: 20, fontFamily: S.fontUI, color: S.textPri }}>
      {error && (
        <div
          style={{
            background: "rgba(229,62,62,0.1)",
            border: "1px solid var(--danger, #e53e3e)",
            padding: "10px 14px",
            marginBottom: 16,
            fontFamily: S.fontMono,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          padding: 14,
          display: "flex",
          gap: 12,
          alignItems: "end",
          marginBottom: 16,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: S.textSec, textTransform: "uppercase" }}>Reporting CCY</span>
          <input
            type="text"
            value={reporting}
            onChange={(e) => setReporting(e.target.value.toUpperCase().slice(0, 3))}
            maxLength={3}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: S.textSec, textTransform: "uppercase" }}>Status filter</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | "CONFIRMED" | "FORECAST")}
            style={inputStyle}
          >
            <option value="ALL">All active</option>
            <option value="CONFIRMED">CONFIRMED only</option>
            <option value="FORECAST">FORECAST only</option>
          </select>
        </label>
        <div style={{ flex: 1 }} />
        <button
          onClick={run}
          disabled={loading}
          style={{
            background: "var(--accent-cyan, #3b82f6)",
            color: "#fff",
            border: "none",
            padding: "8px 20px",
            fontFamily: S.fontMono,
            fontSize: 12,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Computing…" : "Analyze tenant positions"}
        </button>
      </div>

      {!result && !loading && (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: S.textSec,
            fontFamily: S.fontMono,
            fontSize: 13,
          }}
        >
          Run analysis to see how much hedge notional can be eliminated via natural offsets.
        </div>
      )}

      {n && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
            <KpiCard label="Gross before" value={fmtUsd(n.gross_notional_before)} />
            <KpiCard label="Gross after" value={fmtUsd(n.gross_notional_after)} />
            <KpiCard
              label="Notional reduction"
              value={fmtPct(reduction)}
              color="var(--success, #38a169)"
            />
            <KpiCard
              label="Est. margin savings"
              value={fmtUsd(n.total_savings_usd)}
              color="var(--success, #38a169)"
            />
            <KpiCard
              label="Legs eliminated"
              value={String(n.redundant_legs_eliminated)}
              color="var(--accent-cyan, #3b82f6)"
            />
          </div>

          {n.triangulation_warnings > 0 && (
            <div
              style={{
                background: "rgba(221,107,32,0.1)",
                border: "1px solid var(--warning, #dd6b20)",
                padding: "10px 14px",
                marginBottom: 16,
                fontFamily: S.fontMono,
                fontSize: 12,
              }}
            >
              {n.triangulation_warnings} triangulation warning(s) — review synthetic rates below.
            </div>
          )}

          <Section title="Recommended nettings">
            {n.netting_pairs.length === 0 ? (
              <EmptyRow text="No offsetting pairs found in current exposures." />
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr style={{ background: S.bgDeep, color: S.textSec }}>
                    <th style={thStyle}>Pair 1</th>
                    <th style={thStyle}>Pair 2</th>
                    <th style={thStyle}>Synthetic</th>
                    <th style={thStyleRight}>Notional 1</th>
                    <th style={thStyleRight}>Notional 2</th>
                    <th style={thStyleRight}>Netted</th>
                    <th style={thStyleRight}>Savings (est.)</th>
                  </tr>
                </thead>
                <tbody>
                  {n.netting_pairs.map((p, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${S.rim}` }}>
                      <td style={tdStyle}>{p.original_pair_1}</td>
                      <td style={tdStyle}>{p.original_pair_2}</td>
                      <td style={{ ...tdStyle, color: "var(--accent-cyan, #3b82f6)" }}>{p.synthetic_pair}</td>
                      <td style={tdStyleRight}>{fmtUsd(p.original_notional_1)}</td>
                      <td style={tdStyleRight}>{fmtUsd(p.original_notional_2)}</td>
                      <td style={tdStyleRight}>{fmtUsd(p.netted_notional)}</td>
                      <td style={{ ...tdStyleRight, color: "var(--success, #38a169)" }}>{fmtUsd(p.savings_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Per-currency breakdown">
            {result?.source?.per_currency_breakdown &&
            Object.keys(result.source.per_currency_breakdown).length > 0 ? (
              <table style={tableStyle}>
                <thead>
                  <tr style={{ background: S.bgDeep, color: S.textSec }}>
                    <th style={thStyle}>Currency</th>
                    <th style={thStyleRight}>AR (receivable)</th>
                    <th style={thStyleRight}>AP (payable)</th>
                    <th style={thStyleRight}>Net exposure</th>
                    <th style={thStyle}>Direction</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.source.per_currency_breakdown).map(([ccy, b]) => (
                    <tr key={ccy} style={{ borderTop: `1px solid ${S.rim}` }}>
                      <td style={tdStyle}>{ccy}</td>
                      <td style={tdStyleRight}>{fmtNum(b.ar, 0)}</td>
                      <td style={tdStyleRight}>{fmtNum(b.ap, 0)}</td>
                      <td
                        style={{
                          ...tdStyleRight,
                          color: b.net >= 0 ? "var(--success, #38a169)" : "var(--danger, #e53e3e)",
                        }}
                      >
                        {fmtNum(b.net, 0)}
                      </td>
                      <td style={tdStyle}>{b.net > 0 ? "LONG" : b.net < 0 ? "SHORT" : "FLAT"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyRow text="No non-reporting-currency positions found." />
            )}
          </Section>

          <Section title="Net currency positions (post-aggregation)">
            {n.currency_exposures.length === 0 ? (
              <EmptyRow text="No currency exposures." />
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr style={{ background: S.bgDeep, color: S.textSec }}>
                    <th style={thStyle}>Currency</th>
                    <th style={thStyleRight}>Gross</th>
                    <th style={thStyleRight}>Net</th>
                    <th style={thStyleRight}>Offset amount</th>
                    <th style={thStyleRight}>Offset %</th>
                  </tr>
                </thead>
                <tbody>
                  {n.currency_exposures.map((c) => {
                    const pct = c.gross_exposure > 0 ? (c.offset_amount / c.gross_exposure) * 100 : 0;
                    return (
                      <tr key={c.currency} style={{ borderTop: `1px solid ${S.rim}` }}>
                        <td style={tdStyle}>{c.currency}</td>
                        <td style={tdStyleRight}>{fmtUsd(c.gross_exposure)}</td>
                        <td style={tdStyleRight}>{fmtUsd(c.net_exposure)}</td>
                        <td style={tdStyleRight}>{fmtUsd(c.offset_amount)}</td>
                        <td style={tdStyleRight}>{fmtPct(pct)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        padding: "12px 14px",
        fontFamily: S.fontMono,
      }}
    >
      <div style={{ fontSize: 11, color: S.textSec, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, color: color ?? S.textPri, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 11,
          color: S.textSec,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 8,
          fontFamily: S.fontMono,
        }}
      >
        {title}
      </div>
      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, overflowX: "auto" }}>
        {children}
      </div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{ padding: 20, textAlign: "center", color: S.textSec, fontFamily: S.fontMono, fontSize: 12 }}>
      {text}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-sub)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-rim)",
  padding: "6px 10px",
  fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontSize: 12,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  fontWeight: 500,
};

const thStyleRight: React.CSSProperties = { ...thStyle, textAlign: "right" };

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  verticalAlign: "middle",
};

const tdStyleRight: React.CSSProperties = { ...tdStyle, textAlign: "right" };
