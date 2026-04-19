"use client";

/**
 * /hedge-templates — Hedge Program Templates Library (P2-C).
 *
 * Shows system + company templates. Users with trades.create can clone,
 * customize, or apply a template to a position via the Apply modal.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookCheck, Layers, Shuffle, Shield, GitBranch, Play, Trash2 } from "lucide-react";

import { useAuth } from "@/lib/authContext";
import {
  HedgeTemplate,
  InstrumentLeg,
  AppliedLeg,
  TemplateCategory,
  listTemplates,
  applyTemplate,
  deleteTemplate,
  HedgeTemplateApiError,
} from "@/lib/api/hedgeTemplatesClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  textPri: "var(--text-primary)",
  textSec: "var(--text-secondary)",
  accent: "var(--accent-cyan, #22d3ee)",
  accentAmber: "var(--accent-amber, #f59e0b)",
} as const;

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  FORWARD: "Forward",
  OPTION: "Option",
  LAYERED: "Layered",
  ROLLING: "Rolling",
  COLLAR: "Collar",
  MIXED: "Mixed",
};

const CATEGORY_ICON: Record<TemplateCategory, React.ElementType> = {
  FORWARD: BookCheck,
  OPTION: Shield,
  LAYERED: Layers,
  ROLLING: Shuffle,
  COLLAR: Shield,
  MIXED: GitBranch,
};

const fmtNum = (n: number, digits = 2) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);

const fmtWeight = (w: number) => `${(w * 100).toFixed(1)}%`;

export default function HedgeTemplatesPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<HedgeTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | "ALL">("ALL");
  const [selected, setSelected] = useState<HedgeTemplate | null>(null);
  const [applyTarget, setApplyTarget] = useState<HedgeTemplate | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const r = await listTemplates(token);
      setItems(r.items);
    } catch (e) {
      setError(e instanceof HedgeTemplateApiError ? e.message : "load failed");
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (categoryFilter === "ALL") return items;
    return items.filter((t) => t.category === categoryFilter);
  }, [items, categoryFilter]);

  const handleDelete = async (t: HedgeTemplate) => {
    if (!token) return;
    if (t.is_system) return;
    if (!window.confirm(`Deactivate template "${t.name}"?`)) return;
    try {
      await deleteTemplate(token, t.id);
      await load();
      if (selected?.id === t.id) setSelected(null);
    } catch (e) {
      setError(e instanceof HedgeTemplateApiError ? e.message : "delete failed");
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: S.fontUI, color: S.textPri }}>
      {error && (
        <div style={{
          background: "rgba(229,62,62,0.1)",
          border: "1px solid var(--danger, #e53e3e)",
          padding: "10px 14px", borderRadius: 4, marginBottom: 16,
          fontFamily: S.fontMono, fontSize: 12,
        }}>{error}</div>
      )}

      {/* KPI strip */}
      {items && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))",
          gap: 12, marginBottom: 20,
        }}>
          <KpiCell label="Templates available" value={String(items.length)} />
          <KpiCell label="System (built-in)" value={String(items.filter(t => t.is_system).length)} />
          <KpiCell label="Company (custom)" value={String(items.filter(t => !t.is_system).length)} />
          <KpiCell label="Active" value={String(items.filter(t => t.is_active).length)} />
        </div>
      )}

      {/* Category filter */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 16,
        fontFamily: S.fontMono, fontSize: 12, flexWrap: "wrap",
      }}>
        {(["ALL", "FORWARD", "LAYERED", "ROLLING", "COLLAR", "OPTION", "MIXED"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            style={{
              padding: "6px 12px",
              background: categoryFilter === c ? S.accent : "transparent",
              color: categoryFilter === c ? "#000" : S.textSec,
              border: `1px solid ${categoryFilter === c ? S.accent : S.rim}`,
              borderRadius: 3, cursor: "pointer",
              fontFamily: S.fontMono, fontSize: 11, fontWeight: 600,
              letterSpacing: 0.5, textTransform: "uppercase",
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      {filtered === null ? (
        <div style={{ color: S.textSec, padding: 20, fontFamily: S.fontMono, fontSize: 12 }}>
          Loading templates…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: S.textSec, padding: 20, fontFamily: S.fontMono, fontSize: 12 }}>
          No templates match the current filter.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 16,
        }}>
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onApply={() => setApplyTarget(t)}
              onInspect={() => setSelected(t)}
              onDelete={() => handleDelete(t)}
            />
          ))}
        </div>
      )}

      {selected && (
        <DetailModal template={selected} onClose={() => setSelected(null)} />
      )}
      {applyTarget && token && (
        <ApplyModal
          template={applyTarget}
          token={token}
          onClose={() => setApplyTarget(null)}
        />
      )}
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: S.bgPanel,
      border: `1px solid ${S.rim}`,
      borderRadius: 4,
      padding: "12px 14px",
    }}>
      <div style={{
        fontFamily: S.fontMono, fontSize: 10, letterSpacing: 0.6,
        textTransform: "uppercase", color: S.textSec, marginBottom: 6,
      }}>{label}</div>
      <div style={{
        fontFamily: S.fontMono, fontSize: 22, fontWeight: 600, color: S.textPri,
      }}>{value}</div>
    </div>
  );
}

function TemplateCard(props: {
  template: HedgeTemplate;
  onApply: () => void;
  onInspect: () => void;
  onDelete: () => void;
}) {
  const { template: t } = props;
  const Icon = CATEGORY_ICON[t.category] ?? BookCheck;
  return (
    <div style={{
      background: S.bgPanel,
      border: `1px solid ${S.rim}`,
      borderRadius: 4,
      padding: 16,
      display: "flex", flexDirection: "column", gap: 10,
      minHeight: 220,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 4,
          background: "rgba(34, 211, 238, 0.1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: S.accent,
        }}>
          <Icon size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: S.fontUI, fontSize: 14, fontWeight: 600,
            color: S.textPri, overflow: "hidden", textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>{t.name}</div>
          <div style={{
            fontFamily: S.fontMono, fontSize: 10, color: S.textSec,
            letterSpacing: 0.5, textTransform: "uppercase",
          }}>
            {t.short_name} · {CATEGORY_LABEL[t.category]}
            {t.is_system ? " · BUILT-IN" : " · CUSTOM"}
          </div>
        </div>
      </div>

      {t.description && (
        <div style={{
          fontFamily: S.fontUI, fontSize: 12, color: S.textSec,
          lineHeight: 1.5, flex: 1,
        }}>
          {t.description}
        </div>
      )}

      <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textSec }}>
        {t.instrument_mix.length} leg{t.instrument_mix.length !== 1 ? "s" : ""} ·
        {" "}weight sum {fmtWeight(t.instrument_mix.reduce((a, l) => a + l.weight, 0))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          onClick={props.onApply}
          style={{
            flex: 1, padding: "8px 10px",
            background: S.accent, color: "#000",
            border: "none", borderRadius: 3, cursor: "pointer",
            fontFamily: S.fontMono, fontSize: 11, fontWeight: 600,
            letterSpacing: 0.5, textTransform: "uppercase",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          <Play size={12} /> Apply
        </button>
        <button
          onClick={props.onInspect}
          style={{
            padding: "8px 10px",
            background: "transparent", color: S.textPri,
            border: `1px solid ${S.rim}`, borderRadius: 3, cursor: "pointer",
            fontFamily: S.fontMono, fontSize: 11, fontWeight: 600,
            letterSpacing: 0.5, textTransform: "uppercase",
          }}
        >
          Inspect
        </button>
        {!t.is_system && (
          <button
            onClick={props.onDelete}
            title="Deactivate"
            style={{
              padding: "8px 10px",
              background: "transparent", color: "var(--danger, #e53e3e)",
              border: `1px solid ${S.rim}`, borderRadius: 3, cursor: "pointer",
            }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function DetailModal({
  template, onClose,
}: { template: HedgeTemplate; onClose: () => void }) {
  return (
    <ModalShell title={`${template.short_name} · ${template.name}`} onClose={onClose}>
      <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSec, marginBottom: 12 }}>
        {template.description}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontMono, fontSize: 11 }}>
        <thead>
          <tr style={{ textAlign: "left", color: S.textSec }}>
            <Th>Instrument</Th>
            <Th>Direction</Th>
            <Th>Weight</Th>
            <Th>Tenor</Th>
            <Th>Strike</Th>
            <Th>Tranche</Th>
          </tr>
        </thead>
        <tbody>
          {template.instrument_mix.map((leg: InstrumentLeg, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${S.rim}` }}>
              <Td>{leg.instrument}</Td>
              <Td>{leg.direction}</Td>
              <Td>{fmtWeight(leg.weight)}</Td>
              <Td>{leg.tenor_days == null ? "match exposure" : `${leg.tenor_days}d`}</Td>
              <Td>{leg.strike_pct == null ? "—" : `${(leg.strike_pct * 100).toFixed(1)}%`}</Td>
              <Td>{leg.tranche_label ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </ModalShell>
  );
}

function ApplyModal({
  template, token, onClose,
}: { template: HedgeTemplate; token: string; onClose: () => void }) {
  const [positionId, setPositionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ legs: AppliedLeg[]; total: number; ccy: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!positionId.trim()) {
      setError("Position ID required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await applyTemplate(token, template.id, positionId.trim());
      setResult({ legs: r.legs, total: r.total_notional, ccy: r.currency });
    } catch (e) {
      setError(e instanceof HedgeTemplateApiError ? e.message : "apply failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell title={`Apply · ${template.short_name}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{
            display: "block", marginBottom: 6,
            fontFamily: S.fontMono, fontSize: 10, letterSpacing: 0.5,
            textTransform: "uppercase", color: S.textSec,
          }}>Position ID</label>
          <input
            type="text"
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            style={{
              width: "100%", padding: "8px 10px",
              background: S.bgDeep, color: S.textPri,
              border: `1px solid ${S.rim}`, borderRadius: 3,
              fontFamily: S.fontMono, fontSize: 12,
            }}
          />
        </div>
        <button
          onClick={run}
          disabled={loading}
          style={{
            padding: "10px 14px",
            background: S.accent, color: "#000",
            border: "none", borderRadius: 3,
            cursor: loading ? "wait" : "pointer",
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
            letterSpacing: 0.5, textTransform: "uppercase",
          }}
        >
          {loading ? "APPLYING…" : "PROJECT HEDGE LEGS"}
        </button>

        {error && (
          <div style={{
            background: "rgba(229,62,62,0.1)",
            border: "1px solid var(--danger, #e53e3e)",
            padding: 10, borderRadius: 3,
            fontFamily: S.fontMono, fontSize: 11,
          }}>{error}</div>
        )}

        {result && (
          <div>
            <div style={{
              fontFamily: S.fontMono, fontSize: 11, color: S.textSec,
              marginBottom: 8,
            }}>
              Total notional: <strong style={{ color: S.textPri }}>
                {fmtNum(result.total)} {result.ccy}
              </strong> · {result.legs.length} leg{result.legs.length !== 1 ? "s" : ""}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontMono, fontSize: 11 }}>
              <thead>
                <tr style={{ textAlign: "left", color: S.textSec }}>
                  <Th>Tranche</Th>
                  <Th>Instrument</Th>
                  <Th>Dir</Th>
                  <Th>Notional</Th>
                  <Th>Value Date</Th>
                  <Th>Strike</Th>
                </tr>
              </thead>
              <tbody>
                {result.legs.map((leg, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${S.rim}` }}>
                    <Td>{leg.tranche_label ?? "—"}</Td>
                    <Td>{leg.instrument}</Td>
                    <Td>{leg.direction}</Td>
                    <Td>{fmtNum(leg.notional)} {leg.currency}</Td>
                    <Td>{leg.value_date}</Td>
                    <Td>{leg.strike_pct == null ? "—" : `${(leg.strike_pct * 100).toFixed(1)}%`}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 100, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`, borderRadius: 4,
          width: "100%", maxWidth: 720, maxHeight: "85vh",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: `1px solid ${S.rim}`,
        }}>
          <div style={{
            fontFamily: S.fontMono, fontSize: 12, letterSpacing: 0.6,
            textTransform: "uppercase", color: S.textPri, fontWeight: 600,
          }}>{title}</div>
          <button onClick={onClose} style={{
            background: "transparent", color: S.textSec, border: "none",
            cursor: "pointer", fontSize: 18,
          }}>×</button>
        </div>
        <div style={{ padding: 16, overflow: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{
    padding: "6px 8px",
    fontFamily: S.fontMono, fontSize: 10, letterSpacing: 0.5,
    textTransform: "uppercase", fontWeight: 500,
  }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "6px 8px", color: S.textPri }}>{children}</td>;
}
