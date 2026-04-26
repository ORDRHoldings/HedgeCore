"use client";

/**
 * /counterparties/[id] — Counterparty detail page.
 *
 * Shows counterparty metadata, credit limits (list + create),
 * and on-demand exposure computation with breach flags.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import {
  computeExposure,
  createCreditLimit,
  deactivateCreditLimit,
  getCounterparty,
  listCreditLimits,
  type Counterparty,
  type CreditLimit,
  type CreditLimitCreateRequest,
  type ExposurePosition,
  type ExposureResponse,
  type LimitType,
  type RiskLevel,
} from "@/lib/api/counterpartyClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  textPri: "var(--text-primary)",
  textSec: "var(--text-secondary)",
  white: "#fff",
} as const;

const fmtUsd = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(n);

const riskColor = (level: RiskLevel | null | undefined): string => {
  switch (level) {
    case "CRITICAL":
      return "var(--danger, #e53e3e)";
    case "HIGH":
      return "var(--warning, #dd6b20)";
    case "MEDIUM":
      return "var(--accent-cyan, #3b82f6)";
    case "LOW":
      return "var(--success, #38a169)";
    default:
      return S.textSec;
  }
};

const LIMIT_TYPES: LimitType[] = ["notional", "pfe", "settlement", "isda_threshold"];

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, marginBottom: 20 }}>
    <div
      style={{
        padding: "10px 14px",
        background: S.bgSub,
        fontFamily: S.fontUI,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: S.textSec,
        borderBottom: `1px solid ${S.rim}`,
      }}
    >
      {title}
    </div>
    <div style={{ padding: 14 }}>{children}</div>
  </div>
);

const kv = (label: string, value: React.ReactNode) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "6px 0",
      borderBottom: `1px dashed ${S.rim}`,
    }}
  >
    <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSec }}>{label}</span>
    <span style={{ fontFamily: S.fontMono, fontSize: 13, color: S.textPri }}>{value}</span>
  </div>
);

export default function CounterpartyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const { token } = useAuth();

  const [cp, setCp] = useState<Counterparty | null>(null);
  const [limits, setLimits] = useState<CreditLimit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Omit<CreditLimitCreateRequest, "counterparty_id">>({
    limit_type: "notional",
    limit_amount_usd: 10_000_000,
    currency: "USD",
    effective_date: new Date().toISOString().split("T")[0],
    expiry_date: null,
  });
  const [creatingLimit, setCreatingLimit] = useState(false);

  const [positionsJson, setPositionsJson] = useState<string>(
    JSON.stringify(
      [
        { notional_usd: 5_000_000, mtm_usd: 150_000, isda_threshold_usd: 1_000_000 },
      ],
      null,
      2,
    ),
  );
  const [exposure, setExposure] = useState<ExposureResponse | null>(null);
  const [exposureLoading, setExposureLoading] = useState(false);
  const [exposureError, setExposureError] = useState<string | null>(null);

  const refresh = async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const [cpRow, limitRows] = await Promise.all([
        getCounterparty(token, id),
        listCreditLimits(token, id),
      ]);
      setCp(cpRow);
      setLimits(limitRows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  const onCreateLimit = async () => {
    if (!token || !id) return;
    setCreatingLimit(true);
    try {
      await createCreditLimit(token, id, {
        counterparty_id: id,
        limit_type: draft.limit_type,
        limit_amount_usd: Number(draft.limit_amount_usd),
        currency: (draft.currency || "USD").toUpperCase(),
        effective_date: new Date(draft.effective_date).toISOString(),
        expiry_date: draft.expiry_date ? new Date(draft.expiry_date).toISOString() : null,
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "limit create failed");
    } finally {
      setCreatingLimit(false);
    }
  };

  const onDeactivate = async (limitId: string) => {
    if (!token || !id) return;
    try {
      await deactivateCreditLimit(token, id, limitId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "deactivate failed");
    }
  };

  const onComputeExposure = async () => {
    if (!token || !id) return;
    setExposureLoading(true);
    setExposureError(null);
    try {
      const parsed = JSON.parse(positionsJson) as ExposurePosition[];
      if (!Array.isArray(parsed)) throw new Error("positions must be an array");
      const r = await computeExposure(token, id, parsed);
      setExposure(r);
      await refresh();
    } catch (e) {
      setExposureError(e instanceof Error ? e.message : "compute failed");
    } finally {
      setExposureLoading(false);
    }
  };

  const activeLimits = useMemo(() => limits.filter((l) => l.active), [limits]);

  if (loading) {
    return (
      <div style={{ padding: 24, color: S.textSec, fontFamily: S.fontUI }}>Loading…</div>
    );
  }

  if (error || !cp) {
    return (
      <div style={{ padding: 24, fontFamily: S.fontUI }}>
        <Link
          href="/counterparties"
          style={{ color: "var(--accent-cyan, #3b82f6)", textDecoration: "none" }}
        >
          <ArrowLeft size={14} style={{ verticalAlign: "middle" }} /> Back to Hub
        </Link>
        <div style={{ color: "var(--danger, #e53e3e)", marginTop: 12 }}>
          {error ?? "counterparty not found"}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/counterparties"
          style={{
            color: "var(--accent-cyan, #3b82f6)",
            textDecoration: "none",
            fontFamily: S.fontUI,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          <ArrowLeft size={14} style={{ verticalAlign: "middle" }} /> Back to Hub
        </Link>
      </div>

      <h1
        style={{
          fontFamily: S.fontUI,
          fontSize: 22,
          color: S.textPri,
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {cp.name}
      </h1>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.textSec, marginBottom: 20 }}>
        {cp.legal_entity_name ?? "—"} · LEI {cp.lei ?? "—"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Panel title="Metadata">
          {kv("Internal Code", cp.internal_code ?? "—")}
          {kv(
            "Credit Rating",
            cp.credit_rating
              ? `${cp.credit_rating}${cp.rating_agency ? ` (${cp.rating_agency})` : ""}`
              : "—",
          )}
          {kv("Country", cp.country_iso ?? "—")}
          {kv("Active", cp.active ? "YES" : "NO")}
          {kv("Created", new Date(cp.created_at).toLocaleString())}
        </Panel>

        <Panel title="Last Computed Exposure">
          {kv("Net Exposure", fmtUsd(cp.last_exposure_usd))}
          {kv("PFE 97.5%", fmtUsd(cp.last_pfe_usd))}
          {kv(
            "Risk Level",
            <span style={{ color: riskColor(cp.risk_level_cached), fontWeight: 600 }}>
              {cp.risk_level_cached ?? "—"}
            </span>,
          )}
          {kv(
            "Last Scored",
            cp.last_scored_at ? new Date(cp.last_scored_at).toLocaleString() : "—",
          )}
        </Panel>
      </div>

      <Panel title={`Credit Limits (${activeLimits.length} active)`}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr) auto",
            gap: 10,
            marginBottom: 14,
            alignItems: "end",
          }}
        >
          <label>
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.textSec, marginBottom: 4 }}>
              Type
            </div>
            <select
              value={draft.limit_type}
              onChange={(e) =>
                setDraft({ ...draft, limit_type: e.target.value as LimitType })
              }
              style={{
                width: "100%",
                padding: 8,
                background: S.bgDeep,
                color: S.textPri,
                border: `1px solid ${S.rim}`,
                fontFamily: S.fontMono,
                fontSize: 12,
              }}
            >
              {LIMIT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.textSec, marginBottom: 4 }}>
              Amount USD
            </div>
            <input
              type="number"
              value={draft.limit_amount_usd}
              onChange={(e) =>
                setDraft({ ...draft, limit_amount_usd: Number(e.target.value) })
              }
              style={{
                width: "100%",
                padding: 8,
                background: S.bgDeep,
                color: S.textPri,
                border: `1px solid ${S.rim}`,
                fontFamily: S.fontMono,
                fontSize: 12,
              }}
            />
          </label>
          <label>
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.textSec, marginBottom: 4 }}>
              Currency
            </div>
            <input
              type="text"
              value={draft.currency}
              maxLength={3}
              onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
              style={{
                width: "100%",
                padding: 8,
                background: S.bgDeep,
                color: S.textPri,
                border: `1px solid ${S.rim}`,
                fontFamily: S.fontMono,
                fontSize: 12,
              }}
            />
          </label>
          <label>
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.textSec, marginBottom: 4 }}>
              Effective
            </div>
            <input
              type="date"
              value={draft.effective_date}
              onChange={(e) => setDraft({ ...draft, effective_date: e.target.value })}
              style={{
                width: "100%",
                padding: 8,
                background: S.bgDeep,
                color: S.textPri,
                border: `1px solid ${S.rim}`,
                fontFamily: S.fontMono,
                fontSize: 12,
              }}
            />
          </label>
          <label>
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.textSec, marginBottom: 4 }}>
              Expiry (opt)
            </div>
            <input
              type="date"
              value={draft.expiry_date ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, expiry_date: e.target.value || null })
              }
              style={{
                width: "100%",
                padding: 8,
                background: S.bgDeep,
                color: S.textPri,
                border: `1px solid ${S.rim}`,
                fontFamily: S.fontMono,
                fontSize: 12,
              }}
            />
          </label>
          <button
            type="button"
            onClick={onCreateLimit}
            disabled={creatingLimit}
            style={{
              padding: "8px 14px",
              background: "var(--accent-cyan, #3b82f6)",
              color: S.white,
              border: "none",
              fontFamily: S.fontUI,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              cursor: creatingLimit ? "not-allowed" : "pointer",
            }}
          >
            {creatingLimit ? "…" : "+ ADD"}
          </button>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: S.bgSub }}>
              {["Type", "Amount", "Currency", "Effective", "Expiry", "Active", ""].map(
                (h) => (
                  <th scope="col"
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      fontFamily: S.fontUI,
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      color: S.textSec,
                      borderBottom: `1px solid ${S.rim}`,
                    }}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {limits.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: 18,
                    textAlign: "center",
                    color: S.textSec,
                    fontFamily: S.fontUI,
                    fontSize: 12,
                  }}
                >
                  No limits configured.
                </td>
              </tr>
            )}
            {limits.map((l) => (
              <tr key={l.id} style={{ borderBottom: `1px solid ${S.rim}` }}>
                <td style={{ padding: "8px 10px", fontFamily: S.fontMono, fontSize: 12 }}>
                  {l.limit_type}
                </td>
                <td style={{ padding: "8px 10px", fontFamily: S.fontMono, fontSize: 12 }}>
                  {fmtUsd(l.limit_amount_usd)}
                </td>
                <td style={{ padding: "8px 10px", fontFamily: S.fontMono, fontSize: 12 }}>
                  {l.currency}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    color: S.textSec,
                  }}
                >
                  {new Date(l.effective_date).toLocaleDateString()}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    color: S.textSec,
                  }}
                >
                  {l.expiry_date ? new Date(l.expiry_date).toLocaleDateString() : "—"}
                </td>
                <td style={{ padding: "8px 10px", fontFamily: S.fontMono, fontSize: 12 }}>
                  {l.active ? (
                    <span style={{ color: "var(--success, #38a169)" }}>YES</span>
                  ) : (
                    <span style={{ color: S.textSec }}>NO</span>
                  )}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  {l.active && (
                    <button
                      type="button"
                      onClick={() => onDeactivate(l.id)}
                      style={{
                        padding: "4px 10px",
                        background: "transparent",
                        color: "var(--danger, #e53e3e)",
                        border: `1px solid var(--danger, #e53e3e)`,
                        fontFamily: S.fontUI,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        cursor: "pointer",
                      }}
                    >
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Compute Exposure (Ad-Hoc)">
        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSec, marginBottom: 6 }}>
          Positions JSON (array of {"{ notional_usd, mtm_usd, isda_threshold_usd }"})
        </div>
        <textarea
          value={positionsJson}
          onChange={(e) => setPositionsJson(e.target.value)}
          rows={6}
          style={{
            width: "100%",
            padding: 10,
            background: S.bgDeep,
            color: S.textPri,
            border: `1px solid ${S.rim}`,
            fontFamily: S.fontMono,
            fontSize: 12,
            resize: "vertical",
          }}
        />
        <button
          type="button"
          onClick={onComputeExposure}
          disabled={exposureLoading}
          style={{
            padding: "8px 16px",
            marginTop: 10,
            background: "var(--accent-cyan, #3b82f6)",
            color: S.white,
            border: "none",
            fontFamily: S.fontUI,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            cursor: exposureLoading ? "not-allowed" : "pointer",
          }}
        >
          {exposureLoading ? "COMPUTING…" : "COMPUTE EXPOSURE"}
        </button>
        {exposureError && (
          <div style={{ color: "var(--danger, #e53e3e)", fontFamily: S.fontMono, fontSize: 12, marginTop: 10 }}>
            {exposureError}
          </div>
        )}
        {exposure && (
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 20,
                marginBottom: 14,
              }}
            >
              <div>
                {kv("Gross Notional", fmtUsd(exposure.exposure.gross_notional_usd))}
                {kv("Net Notional", fmtUsd(exposure.exposure.net_notional_usd))}
                {kv("Mark-to-Market", fmtUsd(exposure.exposure.mark_to_market))}
              </div>
              <div>
                {kv("PFE 97.5%", fmtUsd(exposure.exposure.pfe_97_5))}
                {kv("Above ISDA Threshold", fmtUsd(exposure.exposure.exposure_above_threshold))}
                {kv(
                  "Risk Level",
                  <span style={{ color: riskColor(exposure.risk_level), fontWeight: 600 }}>
                    {exposure.risk_level}
                  </span>,
                )}
              </div>
            </div>
            {exposure.breaches.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    fontFamily: S.fontUI,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    color: "var(--danger, #e53e3e)",
                    marginBottom: 8,
                  }}
                >
                  Limit Breaches / Warnings
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: S.bgSub }}>
                      {["Type", "Limit", "Actual", "Utilization", "Severity"].map((h) => (
                        <th scope="col"
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "8px 10px",
                            fontFamily: S.fontUI,
                            fontSize: 10,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            color: S.textSec,
                            borderBottom: `1px solid ${S.rim}`,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exposure.breaches.map((b) => (
                      <tr key={b.limit_id} style={{ borderBottom: `1px solid ${S.rim}` }}>
                        <td style={{ padding: "8px 10px", fontFamily: S.fontMono, fontSize: 12 }}>
                          {b.limit_type}
                        </td>
                        <td style={{ padding: "8px 10px", fontFamily: S.fontMono, fontSize: 12 }}>
                          {fmtUsd(b.limit_amount_usd)}
                        </td>
                        <td style={{ padding: "8px 10px", fontFamily: S.fontMono, fontSize: 12 }}>
                          {fmtUsd(b.actual_amount_usd)}
                        </td>
                        <td style={{ padding: "8px 10px", fontFamily: S.fontMono, fontSize: 12 }}>
                          {b.utilization_pct}%
                        </td>
                        <td
                          style={{
                            padding: "8px 10px",
                            fontFamily: S.fontMono,
                            fontSize: 12,
                            color:
                              b.severity === "BREACH"
                                ? "var(--danger, #e53e3e)"
                                : "var(--warning, #dd6b20)",
                            fontWeight: 600,
                          }}
                        >
                          {b.severity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
