"use client";
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { useAuth } from "@/lib/authContext";
import {
  listObligations, createObligation, cancelObligation,
  listProposals, generateProposals, approveProposal, executeProposal,
  getNettingSavings, listEntities,
  type IntercompanyObligation, type NettingProposal, type NettingSavings, type LegalEntity,
} from "@/lib/api/cashClient";
import { GitMerge, Plus, Check, X, Play, DollarSign, List, ArrowRight } from "lucide-react";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
} as const;

type Tab = "OBLIGATIONS" | "PROPOSALS" | "SAVINGS";

const statusColor: Record<string, string> = {
  PENDING: "#f59e0b",
  NETTED: "#10b981",
  SETTLED: "#6366f1",
  CANCELLED: "#6b7280",
  DRAFT: "#9ca3af",
  PENDING_APPROVAL: "#f59e0b",
  APPROVED: "#10b981",
  EXECUTED: "#3b82f6",
  REJECTED: "#ef4444",
};

function NettingInner() {
  const isMobile = useIsMobile();
  const { token, user } = useAuth();
  const [tab, setTab] = useState<Tab>("OBLIGATIONS");
  const [obligations, setObligations] = useState<IntercompanyObligation[]>([]);
  const [proposals, setProposals] = useState<NettingProposal[]>([]);
  const [savings, setSavings] = useState<NettingSavings | null>(null);
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ debtor_entity_id: "", creditor_entity_id: "", amount: "", currency: "EUR", due_date: "", reference: "" });

  const loadEntities = useCallback(async () => {
    if (!token) return;
    try { setEntities(await listEntities(token, { status: "ACTIVE" })); } catch { /* noop */ }
  }, [token]);

  const loadObligations = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try { setObligations(await listObligations(token)); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  }, [token]);

  const loadProposals = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try { setProposals(await listProposals(token)); } catch { setProposals([]); } finally { setLoading(false); }
  }, [token]);

  const loadSavings = useCallback(async () => {
    if (!token) return;
    try { setSavings(await getNettingSavings(token)); } catch { setSavings(null); }
  }, [token]);

  useEffect(() => { loadEntities(); }, [loadEntities]);
  useEffect(() => {
    if (tab === "OBLIGATIONS") loadObligations();
    else if (tab === "PROPOSALS") loadProposals();
    else loadSavings();
  }, [tab, loadObligations, loadProposals, loadSavings]);

  const entityName = (id: string) => entities.find(e => e.id === id)?.short_name || id.slice(0, 8);

  const handleCreate = async () => {
    if (!token || !form.debtor_entity_id || !form.creditor_entity_id || !form.amount || !form.due_date) return;
    try {
      await createObligation(token, form);
      setShowForm(false);
      setForm({ debtor_entity_id: "", creditor_entity_id: "", amount: "", currency: "EUR", due_date: "", reference: "" });
      loadObligations();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Create failed"); }
  };

  const handleCancel = async (id: string) => {
    if (!token) return;
    try { await cancelObligation(token, id); loadObligations(); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Cancel failed"); }
  };

  const handleGenerate = async () => {
    if (!token) return;
    try { await generateProposals(token); loadProposals(); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Generate failed"); }
  };

  const handleApprove = async (id: string) => {
    if (!token) return;
    try { await approveProposal(token, id); loadProposals(); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Approve failed"); }
  };

  const handleExecute = async (id: string) => {
    if (!token) return;
    try { await executeProposal(token, id); loadProposals(); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Execute failed"); }
  };

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "OBLIGATIONS", label: "OBLIGATIONS", icon: List },
    { key: "PROPOSALS", label: "PROPOSALS", icon: GitMerge },
    { key: "SAVINGS", label: "SAVINGS", icon: DollarSign },
  ];

  const fmtAmount = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? v : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div style={{ fontFamily: S.fontUI, padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <GitMerge size={22} />
        <h1 style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", margin: 0 }}>
          Intercompany Netting
        </h1>
      </div>

      {error && <div style={{ background: "#7f1d1d", color: "#fca5a5", padding: "8px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{error}<button onClick={() => setError(null)} style={{ float: "right", background: "none", border: "none", color: "#fca5a5", cursor: "pointer" }}>x</button></div>}

      <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase",
              background: tab === t.key ? S.bgPanel : "transparent", color: tab === t.key ? "#fff" : "#9ca3af",
              border: `1px solid ${tab === t.key ? S.rim : "transparent"}`, borderRadius: 6, cursor: "pointer" }}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: "#9ca3af", fontSize: 13, padding: 20 }}>Loading...</div>}

      {/* OBLIGATIONS TAB */}
      {tab === "OBLIGATIONS" && !loading && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setShowForm(!showForm)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>
              <Plus size={14} />ADD OBLIGATION
            </button>
          </div>

          {showForm && (
            <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>
                  DEBTOR ENTITY
                  <select value={form.debtor_entity_id} onChange={e => setForm({ ...form, debtor_entity_id: e.target.value })}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                    <option value="">Select...</option>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.short_name}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>
                  CREDITOR ENTITY
                  <select value={form.creditor_entity_id} onChange={e => setForm({ ...form, creditor_entity_id: e.target.value })}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                    <option value="">Select...</option>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.short_name}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>
                  AMOUNT
                  <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }} />
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>
                  CURRENCY
                  <input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }} />
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>
                  DUE DATE
                  <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }} />
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>
                  REFERENCE
                  <input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="INV-001"
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={handleCreate} style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>CREATE</button>
                <button onClick={() => setShowForm(false)} style={{ padding: "8px 16px", background: "transparent", color: "#9ca3af", border: `1px solid ${S.rim}`, borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>CANCEL</button>
              </div>
            </div>
          )}

          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["DEBTOR", "CREDITOR", "AMOUNT", "CCY", "DUE DATE", "REF", "STATUS", ""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {obligations.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>No obligations found</td></tr>
                )}
                {obligations.map(o => (
                  <tr key={o.id} style={{ borderBottom: `1px solid ${S.rim}22` }}>
                    <td style={{ padding: "8px 12px" }}>{entityName(o.debtor_entity_id)}</td>
                    <td style={{ padding: "8px 12px" }}>{entityName(o.creditor_entity_id)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtAmount(o.amount)}</td>
                    <td style={{ padding: "8px 12px" }}>{o.currency}</td>
                    <td style={{ padding: "8px 12px" }}>{o.due_date}</td>
                    <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{o.reference || "\u2014"}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${statusColor[o.status] || "#6b7280"}22`, color: statusColor[o.status] || "#6b7280" }}>{o.status}</span>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      {o.status === "PENDING" && (
                        <button onClick={() => handleCancel(o.id)} title="Cancel" style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 4 }}><X size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PROPOSALS TAB */}
      {tab === "PROPOSALS" && !loading && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={handleGenerate} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>
              <GitMerge size={14} />GENERATE PROPOSALS
            </button>
          </div>
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["ENTITY PAIR", "CCY", "GROSS PAY", "GROSS REC", "NET", "DIR", "SAVINGS", "STATUS", "ACTIONS"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {proposals.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>No proposals -- generate from pending obligations</td></tr>
                )}
                {proposals.map(p => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${S.rim}22` }}>
                    <td style={{ padding: "8px 12px" }}>{entityName(p.entity_a_id)} <ArrowRight size={12} style={{ display: "inline", verticalAlign: "middle" }} /> {entityName(p.entity_b_id)}</td>
                    <td style={{ padding: "8px 12px" }}>{p.currency}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtAmount(p.gross_payable)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtAmount(p.gross_receivable)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>{fmtAmount(p.net_amount)}</td>
                    <td style={{ padding: "8px 12px" }}>{p.net_direction === "A2B" ? entityName(p.entity_a_id) + " \u2192 " + entityName(p.entity_b_id) : entityName(p.entity_b_id) + " \u2192 " + entityName(p.entity_a_id)}</td>
                    <td style={{ padding: "8px 12px", color: "#10b981", fontWeight: 600, textAlign: "right" }}>{fmtAmount(p.savings)}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${statusColor[p.status] || "#6b7280"}22`, color: statusColor[p.status] || "#6b7280" }}>{p.status}</span>
                    </td>
                    <td style={{ padding: "8px 12px", display: "flex", gap: 4 }}>
                      {p.status === "PENDING_APPROVAL" && (
                        <button onClick={() => handleApprove(p.id)} title="Approve" style={{ background: "none", border: "none", color: "#10b981", cursor: "pointer", padding: 4 }}><Check size={14} /></button>
                      )}
                      {p.status === "APPROVED" && (
                        <button onClick={() => handleExecute(p.id)} title="Execute" style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", padding: 4 }}><Play size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SAVINGS TAB */}
      {tab === "SAVINGS" && !loading && (
        <div>
          {savings ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
                <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 20 }}>
                  <div style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>TOTAL SAVINGS</div>
                  <div style={{ fontSize: 28, fontFamily: S.fontMono, fontWeight: 700, color: "#10b981" }}>{fmtAmount(savings.total_savings)}</div>
                </div>
                <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 20 }}>
                  <div style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>NETTINGS EXECUTED</div>
                  <div style={{ fontSize: 28, fontFamily: S.fontMono, fontWeight: 700 }}>{savings.netting_count}</div>
                </div>
                <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 20 }}>
                  <div style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>AVG SAVINGS / NETTING</div>
                  <div style={{ fontSize: 28, fontFamily: S.fontMono, fontWeight: 700, color: "#10b981" }}>
                    {savings.netting_count > 0 ? fmtAmount(String(parseFloat(savings.total_savings) / savings.netting_count)) : "\u2014"}
                  </div>
                </div>
              </div>

              {Object.keys(savings.savings_by_currency).length > 0 && (
                <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: `1px solid ${S.rim}`, fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: 0.5, color: "#9ca3af" }}>SAVINGS BY CURRENCY</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.fontMono }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                        <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>CURRENCY</th>
                        <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>SAVINGS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(savings.savings_by_currency).map(([ccy, amt]) => (
                        <tr key={ccy} style={{ borderBottom: `1px solid ${S.rim}22` }}>
                          <td style={{ padding: "8px 16px" }}>{ccy}</td>
                          <td style={{ padding: "8px 16px", textAlign: "right", color: "#10b981", fontWeight: 600 }}>{fmtAmount(amt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: "#6b7280", textAlign: "center", padding: 40 }}>No savings data yet -- execute netting proposals to track savings</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function IntercompanyNettingPage() {
  const isMobile = useIsMobile();
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#6b7280" }}>Loading...</div>}>
      <NettingInner />
    </Suspense>
  );
}
