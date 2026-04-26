"use client";

/**
 * /counterparties — Counterparty Hub landing page.
 *
 * Table of all counterparties for the tenant, with inline "create" form
 * and click-through to per-counterparty detail page.
 */

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import Link from "next/link";
import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/authContext";
import { PageShell } from "@/components/layout/PageShell";
import {
  listCounterparties,
  createCounterparty,
  type Counterparty,
  type CounterpartyCreateRequest,
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

const fmtUsd = (n: number | null) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(n);

const riskColor = (level: RiskLevel | null): string => {
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

export default function CounterpartiesHubPage() {
  const { token } = useAuth();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<CounterpartyCreateRequest>({
    name: "",
    internal_code: "",
    legal_entity_name: "",
    lei: "",
    credit_rating: "",
    rating_agency: "",
    country_iso: "",
  });
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      setRows(await listCounterparties(token));
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
  }, [token]);

  const onCreate = async () => {
    if (!token || !draft.name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const cleaned: CounterpartyCreateRequest = {
        name: draft.name.trim(),
        internal_code: draft.internal_code?.trim() || null,
        legal_entity_name: draft.legal_entity_name?.trim() || null,
        lei: draft.lei?.trim() || null,
        credit_rating: draft.credit_rating?.trim() || null,
        rating_agency: draft.rating_agency?.trim() || null,
        country_iso: draft.country_iso?.trim() || null,
      };
      await createCounterparty(token, cleaned);
      setShowCreate(false);
      setDraft({
        name: "",
        internal_code: "",
        legal_entity_name: "",
        lei: "",
        credit_rating: "",
        rating_agency: "",
        country_iso: "",
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "create failed");
    } finally {
      setCreating(false);
    }
  };

  const input = (
    label: string,
    key: keyof CounterpartyCreateRequest,
    placeholder?: string,
  ) => (
    <label style={{ display: "block", marginBottom: 10 }}>
      <div
        style={{
          fontFamily: S.fontUI,
          fontSize: 11,
          color: S.textSec,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <input
        type="text"
        value={(draft[key] as string) ?? ""}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: 8,
          background: S.bgDeep,
          color: S.textPri,
          border: `1px solid ${S.rim}`,
          fontFamily: S.fontMono,
          fontSize: 13,
        }}
      />
    </label>
  );

  return (
    <PageShell icon={Users} title="Counterparties">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSec }}>
          {rows.length} counterparties
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          style={{
            padding: "8px 16px",
            background: showCreate ? S.bgSub : "var(--accent-cyan, #3b82f6)",
            color: showCreate ? S.textPri : "#fff",
            border: "none",
            fontFamily: S.fontUI,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            cursor: "pointer",
          }}
        >
          {showCreate ? "CANCEL" : "+ NEW COUNTERPARTY"}
        </button>
      </div>

      {showCreate && (
        <div
          style={{
            padding: 16,
            marginBottom: 20,
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <div>
              {input("Name *", "name", "Goldman Sachs International")}
              {input("Internal Code", "internal_code", "GS-INTL")}
              {input("Legal Entity", "legal_entity_name", "Goldman Sachs International")}
            </div>
            <div>
              {input("LEI", "lei", "W22LROWP2IHZNBB6K528")}
              {input("Credit Rating", "credit_rating", "A+")}
              {input("Rating Agency", "rating_agency", "S&P")}
              {input("Country ISO", "country_iso", "GB")}
            </div>
          </div>
          <button
            type="button"
            onClick={onCreate}
            disabled={creating || !draft.name.trim()}
            style={{
              padding: "8px 20px",
              marginTop: 12,
              background: "var(--accent-cyan, #3b82f6)",
              color: S.white,
              border: "none",
              fontFamily: S.fontUI,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              cursor: creating ? "not-allowed" : "pointer",
              opacity: creating || !draft.name.trim() ? 0.6 : 1,
            }}
          >
            {creating ? "CREATING…" : "CREATE"}
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            background: "var(--danger-bg, rgba(229,62,62,0.1))",
            border: `1px solid var(--danger, #e53e3e)`,
            color: "var(--danger, #e53e3e)",
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
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: S.bgSub }}>
              {[
                "Name",
                "Internal Code",
                "Rating",
                "Country",
                "Last Exposure",
                "Last PFE",
                "Risk",
                "Scored At",
              ].map((h) => (
                <th scope="col"
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    fontFamily: S.fontUI,
                    fontSize: 11,
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
            {loading && (
              <tr>
                <td
                  colSpan={8}
                  style={{ padding: 24, textAlign: "center", color: S.textSec, fontFamily: S.fontUI }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                    <Skeleton width={120} height={14} />
                    <SkeletonTable columns={8} rows={4} />
                  </div>
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: 32,
                    textAlign: "center",
                    color: S.textSec,
                    fontFamily: S.fontUI,
                    fontSize: 13,
                  }}
                >
                  No counterparties yet. Create your first one above.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${S.rim}` }}>
                  <td style={{ padding: "10px 12px", fontFamily: S.fontUI, fontSize: 13 }}>
                    <Link
                      href={`/counterparties/${r.id}`}
                      style={{ color: "var(--accent-cyan, #3b82f6)", textDecoration: "none" }}
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 12, color: S.textSec }}>
                    {r.internal_code ?? "—"}
                  </td>
                  <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 12 }}>
                    {r.credit_rating ? `${r.credit_rating}${r.rating_agency ? ` (${r.rating_agency})` : ""}` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 12 }}>
                    {r.country_iso ?? "—"}
                  </td>
                  <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 12 }}>
                    {fmtUsd(r.last_exposure_usd)}
                  </td>
                  <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 12 }}>
                    {fmtUsd(r.last_pfe_usd)}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      color: riskColor(r.risk_level_cached),
                      fontWeight: 600,
                    }}
                  >
                    {r.risk_level_cached ?? "—"}
                  </td>
                  <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 11, color: S.textSec }}>
                    {r.last_scored_at ? new Date(r.last_scored_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        </div>
      </div>
    </PageShell>
  );
}
