"use client";
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import {
  listPayments, listBeneficiaries, initiatePayment, approvePayment,
  rejectPayment, transmitPayment, cancelPayment, createBeneficiary,
  updateBeneficiary, deactivateBeneficiary,
  type PaymentInstruction, type Beneficiary,
} from "@/lib/api/cashClient";
import { CreditCard, RefreshCw, Plus, ChevronDown, ChevronRight } from "lucide-react";

// ── Design tokens ──────────────────────────────────────────────────────────
const S = {
  mono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  ui: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  deep: "var(--bg-deep)",
  panel: "var(--bg-panel)",
  sub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  text1: "var(--text-primary)",
  text2: "var(--text-secondary)",
  text3: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
} as const;

const HEX = {
  cyan: "#1C62F2",
  green: "#059669",
  red: "#DC2626",
  amber: "#D97706",
  blue: "#3B82F6",
  gray: "#6B7280",
} as const;

// ── Status colours ─────────────────────────────────────────────────────────
const statusColor: Record<string, string> = {
  PENDING_APPROVAL: HEX.amber,
  APPROVED: HEX.green,
  REJECTED: HEX.red,
  TRANSMITTED: HEX.blue,
  CANCELLED: HEX.gray,
  DRAFT: HEX.gray,
};

const PAYMENT_TYPES = ["SWIFT", "SEPA_CT", "BACS", "ACH", "CHAPS", "DOMESTIC_WIRE", "CHECK"];
const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "SGD", "HKD", "NOK", "SEK", "DKK"];

type Tab = "PAYMENTS" | "INITIATE" | "BENEFICIARIES";

// ── Badge ──────────────────────────────────────────────────────────────────
const Badge = ({ label, color }: { label: string; color: string }) => (
  <span style={{
    padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
    background: `${color}18`, color, border: `1px solid ${color}30`,
  }}>{label}</span>
);

const fmtAmount = (v: string | number) => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", marginTop: 4,
  background: "var(--bg-deep)", color: "var(--text-primary)",
  border: "1px solid var(--border-rim)", borderRadius: 4,
  fontSize: 13, fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.1em",
  display: "block",
};

// ══════════════════════════════════════════════════════════════════════════════
// INNER COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

function PaymentsInner() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState<Tab>("PAYMENTS");

  // ── Payments state ─────────────────────────────────────────────────────────
  const [payments, setPayments] = useState<PaymentInstruction[]>([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Beneficiaries state ────────────────────────────────────────────────────
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [beneLoading, setBeneLoading] = useState(false);

  // ── Expanded row + reject flow ─────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Initiate form ──────────────────────────────────────────────────────────
  const [initForm, setInitForm] = useState({
    payment_type: "SWIFT",
    beneficiary_id: "",
    amount: "",
    currency: "USD",
    execution_date: new Date().toISOString().slice(0, 10),
    reference: "",
    memo: "",
  });
  const [initLoading, setInitLoading] = useState(false);

  // ── Beneficiary create form ────────────────────────────────────────────────
  const [showBeneForm, setShowBeneForm] = useState(false);
  const [beneForm, setBeneForm] = useState({
    name: "", bank_name: "", bank_code: "", account_number: "",
    country_code: "", currency: "USD", payment_types: [] as string[],
  });
  const [beneSubmitLoading, setBeneSubmitLoading] = useState(false);

  // ── Load payments ──────────────────────────────────────────────────────────
  const loadPayments = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const res = await listPayments(token);
      setPayments(res.items);
      setPaymentsTotal(res.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadBeneficiaries = useCallback(async () => {
    if (!token) return;
    setBeneLoading(true);
    try {
      setBeneficiaries(await listBeneficiaries(token, false));
    } catch { /* noop */ }
    finally { setBeneLoading(false); }
  }, [token]);

  useEffect(() => { loadPayments(); loadBeneficiaries(); }, [loadPayments, loadBeneficiaries]);

  // ── KPI derived ────────────────────────────────────────────────────────────
  const pendingCount = payments.filter(p => p.status === "PENDING_APPROVAL").length;
  const approvedCount = payments.filter(p => p.status === "APPROVED").length;
  const activeBeneCount = beneficiaries.filter(b => b.is_active).length;

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleApprove = async (id: string) => {
    if (!token) return;
    setActionLoading(id);
    try {
      const updated = await approvePayment(token, id);
      setPayments(prev => prev.map(p => p.id === id ? updated : p));
      setSuccess("Payment approved.");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Approve failed"); }
    finally { setActionLoading(null); }
  };

  const handleReject = async (id: string) => {
    if (!token || !rejectReason.trim()) return;
    setActionLoading(id);
    try {
      const updated = await rejectPayment(token, id, rejectReason.trim());
      setPayments(prev => prev.map(p => p.id === id ? updated : p));
      setRejectingId(null); setRejectReason("");
      setSuccess("Payment rejected.");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Reject failed"); }
    finally { setActionLoading(null); }
  };

  const handleTransmit = async (id: string) => {
    if (!token) return;
    setActionLoading(id);
    try {
      const updated = await transmitPayment(token, id);
      setPayments(prev => prev.map(p => p.id === id ? updated : p));
      setSuccess("Payment transmitted (paper mode).");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Transmit failed"); }
    finally { setActionLoading(null); }
  };

  const handleCancel = async (id: string) => {
    if (!token) return;
    setActionLoading(id);
    try {
      const updated = await cancelPayment(token, id);
      setPayments(prev => prev.map(p => p.id === id ? updated : p));
      setSuccess("Payment cancelled.");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Cancel failed"); }
    finally { setActionLoading(null); }
  };

  const handleInitiate = async () => {
    if (!token || !initForm.beneficiary_id || !initForm.amount || !initForm.reference) return;
    setInitLoading(true); setError(null);
    try {
      await initiatePayment(token, {
        ...initForm,
        memo: initForm.memo || undefined,
      });
      setSuccess("Payment instruction created. Awaiting 4-eyes approval.");
      setInitForm({ payment_type: "SWIFT", beneficiary_id: "", amount: "", currency: "USD", execution_date: new Date().toISOString().slice(0, 10), reference: "", memo: "" });
      await loadPayments();
      setTab("PAYMENTS");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Initiate failed"); }
    finally { setInitLoading(false); }
  };

  const handleCreateBeneficiary = async () => {
    if (!token || !beneForm.name || !beneForm.bank_name || !beneForm.bank_code || !beneForm.account_number || !beneForm.country_code) return;
    setBeneSubmitLoading(true); setError(null);
    try {
      await createBeneficiary(token, beneForm);
      setShowBeneForm(false);
      setBeneForm({ name: "", bank_name: "", bank_code: "", account_number: "", country_code: "", currency: "USD", payment_types: [] });
      setSuccess("Beneficiary created.");
      await loadBeneficiaries();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Create beneficiary failed"); }
    finally { setBeneSubmitLoading(false); }
  };

  const handleDeactivateBeneficiary = async (id: string) => {
    if (!token) return;
    try {
      await deactivateBeneficiary(token, id);
      setSuccess("Beneficiary deactivated.");
      await loadBeneficiaries();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Deactivate failed"); }
  };

  const handleToggleBenePaymentType = (type: string) => {
    setBeneForm(prev => ({
      ...prev,
      payment_types: prev.payment_types.includes(type)
        ? prev.payment_types.filter(t => t !== type)
        : [...prev.payment_types, type],
    }));
  };

  // ── Filtered beneficiaries for INITIATE form ───────────────────────────────
  const filteredBeneficiaries = beneficiaries.filter(
    b => b.is_active && b.payment_types.includes(initForm.payment_type)
  );

  const TABS: { key: Tab; label: string }[] = [
    { key: "PAYMENTS", label: "PAYMENTS" },
    { key: "INITIATE", label: "INITIATE" },
    { key: "BENEFICIARIES", label: "BENEFICIARIES" },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: S.deep }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, background: S.panel, borderBottom: `1px solid ${S.rim}` }}>
        <div style={{ padding: "20px 28px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 6,
              background: "rgba(28,98,242,0.06)", border: "1px solid rgba(28,98,242,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <CreditCard size={18} color={HEX.cyan} strokeWidth={1.5} />
            </div>
            <div>
              <h1 style={{ fontFamily: S.mono, fontSize: 15, fontWeight: 700, color: S.text1, letterSpacing: "0.08em", margin: 0 }}>
                PAYMENT INITIATION
              </h1>
              <span style={{ fontFamily: S.ui, fontSize: 12, color: S.text3 }}>
                Paper-mode payment workflow with 4-eyes approval & SoD controls
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={() => { loadPayments(); loadBeneficiaries(); }} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
              background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4,
              cursor: "pointer", fontSize: 11, fontFamily: S.mono, fontWeight: 600,
              color: S.text3, letterSpacing: "0.06em",
            }}>
              <RefreshCw size={12} />REFRESH
            </button>
            <span style={{
              fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
              padding: "4px 12px", borderRadius: 3,
              background: "rgba(28,98,242,0.06)", color: HEX.cyan,
              border: "1px solid rgba(28,98,242,0.12)",
            }}>
              PHASE 2 §4.4
            </span>
          </div>
        </div>

        {/* ── KPI strip ─────────────────────────────────────────────────────── */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          margin: "14px 28px 0", borderRadius: 6,
          border: `1px solid ${S.rim}`, overflow: "hidden",
        }}>
          {([
            { label: "TOTAL PAYMENTS", value: paymentsTotal, color: HEX.cyan },
            { label: "PENDING APPROVAL", value: pendingCount, color: pendingCount > 0 ? HEX.amber : undefined },
            { label: "APPROVED", value: approvedCount, color: approvedCount > 0 ? HEX.green : undefined },
            { label: "ACTIVE BENEFICIARIES", value: activeBeneCount, color: activeBeneCount > 0 ? HEX.blue : undefined },
          ] as { label: string; value: number; color?: string }[]).map((kpi, i) => (
            <div key={kpi.label} style={{
              padding: "12px 16px",
              borderRight: i < 3 ? `1px solid ${S.rim}` : "none",
              background: S.panel, position: "relative", overflow: "hidden",
            }}>
              {kpi.color && (
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 2, background: kpi.color, opacity: 0.6 }} />
              )}
              <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 4 }}>
                {kpi.label}
              </div>
              <div style={{ fontFamily: S.mono, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: kpi.color || S.text1 }}>
                {loading ? "\u2014" : kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 0, padding: "14px 28px 0" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              fontFamily: S.mono, fontSize: 11, fontWeight: tab === t.key ? 700 : 500,
              letterSpacing: "0.1em", color: tab === t.key ? HEX.cyan : S.text3,
              padding: "8px 16px", background: "transparent", border: "none",
              borderBottom: tab === t.key ? `2px solid ${HEX.cyan}` : "2px solid transparent",
              cursor: "pointer", transition: "all 0.15s",
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content area ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>

        {/* Error/success banners */}
        {error && (
          <div style={{
            padding: "10px 16px", marginBottom: 16, borderRadius: 4,
            background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)",
            fontFamily: S.ui, fontSize: 13, color: HEX.red,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
            {error}
            <div style={{ flex: 1 }} />
            <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: HEX.red, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>&times;</button>
          </div>
        )}
        {success && (
          <div style={{
            padding: "10px 16px", marginBottom: 16, borderRadius: 4,
            background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.25)",
            fontFamily: S.ui, fontSize: 13, color: HEX.green,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            {success}
            <div style={{ flex: 1 }} />
            <button onClick={() => setSuccess(null)} style={{ background: "none", border: "none", color: HEX.green, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>&times;</button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* PAYMENTS TAB                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "PAYMENTS" && (
          <div style={{ maxWidth: 1100 }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <button onClick={() => setTab("INITIATE")} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
                background: HEX.cyan, color: "#fff", border: "none", borderRadius: 4,
                fontSize: 11, fontFamily: S.mono, fontWeight: 700, letterSpacing: "0.06em", cursor: "pointer",
              }}>
                <Plus size={13} />NEW PAYMENT
              </button>
            </div>

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 60 }}>
                <div style={{ width: 28, height: 28, border: `2px solid ${S.rim}`, borderTopColor: S.cyan, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, letterSpacing: "0.1em" }}>LOADING</span>
              </div>
            ) : (
              <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.mono }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                      {["", "TYPE", "BENEFICIARY", "AMOUNT", "CCY", "EXEC DATE", "STATUS"].map(h => (
                        <th key={h} style={{
                          padding: "10px 14px", textAlign: h === "AMOUNT" ? "right" : "left",
                          fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: S.text3, fontSize: 12 }}>
                        No payment instructions. Click NEW PAYMENT to create one.
                      </td></tr>
                    )}
                    {payments.map(p => {
                      const isExpanded = expandedId === p.id;
                      const isCreator = p.created_by === user?.email || p.created_by === user?.id;
                      const isRejecting = rejectingId === p.id;
                      const busy = actionLoading === p.id;

                      return (
                        <React.Fragment key={p.id}>
                          {/* ── Main row ── */}
                          <tr
                            onClick={() => setExpandedId(isExpanded ? null : p.id)}
                            style={{ borderBottom: `1px solid ${S.rim}`, cursor: "pointer", transition: "background 0.12s" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "rgba(28,98,242,0.04)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          >
                            <td style={{ padding: "10px 10px 10px 14px", width: 20 }}>
                              {isExpanded
                                ? <ChevronDown size={13} color={S.text3} />
                                : <ChevronRight size={13} color={S.text3} />}
                            </td>
                            <td style={{ padding: "10px 14px" }}>
                              <Badge label={p.payment_type} color={HEX.blue} />
                            </td>
                            <td style={{ padding: "10px 14px", fontWeight: 600, color: S.text1 }}>{p.beneficiary_name}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: S.text1, fontFamily: S.mono }}>
                              {fmtAmount(p.amount)}
                            </td>
                            <td style={{ padding: "10px 14px", color: S.text2 }}>{p.currency}</td>
                            <td style={{ padding: "10px 14px", color: S.text2 }}>{p.execution_date}</td>
                            <td style={{ padding: "10px 14px" }}>
                              <Badge label={p.status} color={statusColor[p.status] || HEX.gray} />
                            </td>
                          </tr>

                          {/* ── Expanded detail row ── */}
                          {isExpanded && (
                            <tr><td colSpan={7} style={{ padding: 0 }}>
                              <div style={{ background: S.sub, padding: 20, borderBottom: `1px solid ${S.rim}` }}>
                                {/* Detail grid */}
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 16 }}>
                                  {[
                                    { label: "REFERENCE", value: p.reference },
                                    { label: "MEMO", value: p.memo || "\u2014" },
                                    { label: "TRANSMISSION MODE", value: p.transmission_mode },
                                    { label: "CREATED BY", value: p.created_by },
                                    { label: "APPROVED BY", value: p.approved_by || "\u2014" },
                                    { label: "APPROVED AT", value: p.approved_at ? new Date(p.approved_at).toLocaleString() : "\u2014" },
                                    { label: "REJECTED BY", value: p.rejected_by || "\u2014" },
                                    { label: "REJECTION REASON", value: p.rejection_reason || "\u2014" },
                                    { label: "TRANSMITTED AT", value: p.transmitted_at ? new Date(p.transmitted_at).toLocaleString() : "\u2014" },
                                    { label: "INSTRUCTION HASH", value: p.instruction_hash ? `${p.instruction_hash.slice(0, 16)}...` : "\u2014" },
                                    { label: "CREATED AT", value: new Date(p.created_at).toLocaleString() },
                                    { label: "PAYMENT ID", value: p.id.slice(0, 8) + "..." },
                                  ].map(f => (
                                    <div key={f.label} style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4, padding: "10px 12px" }}>
                                      <div style={{ fontSize: 9, fontFamily: S.mono, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 3 }}>{f.label}</div>
                                      <div style={{ fontSize: 12, fontFamily: S.mono, color: S.text1, wordBreak: "break-all" }}>{f.value}</div>
                                    </div>
                                  ))}
                                </div>

                                {/* Action area */}
                                {p.status === "PENDING_APPROVAL" && (
                                  <div>
                                    {isCreator ? (
                                      <div style={{
                                        padding: "10px 14px", borderRadius: 4,
                                        background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.25)",
                                        fontFamily: S.mono, fontSize: 12, color: HEX.amber,
                                      }}>
                                        Awaiting approval (SoD) — a different user must approve this payment.
                                      </div>
                                    ) : (
                                      <div>
                                        {!isRejecting ? (
                                          <div style={{ display: "flex", gap: 8 }}>
                                            <button
                                              disabled={busy}
                                              onClick={e => { e.stopPropagation(); handleApprove(p.id); }}
                                              style={{
                                                padding: "8px 18px", background: HEX.green, color: "#fff",
                                                border: "none", borderRadius: 4, fontSize: 11, fontFamily: S.mono,
                                                fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
                                                letterSpacing: "0.06em", opacity: busy ? 0.6 : 1,
                                              }}>
                                              {busy ? "..." : "APPROVE"}
                                            </button>
                                            <button
                                              disabled={busy}
                                              onClick={e => { e.stopPropagation(); setRejectingId(p.id); }}
                                              style={{
                                                padding: "8px 18px", background: "transparent",
                                                color: HEX.red, border: `1px solid ${HEX.red}33`,
                                                borderRadius: 4, fontSize: 11, fontFamily: S.mono,
                                                fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
                                                letterSpacing: "0.06em",
                                              }}>
                                              REJECT
                                            </button>
                                          </div>
                                        ) : (
                                          <div onClick={e => e.stopPropagation()}>
                                            <textarea
                                              value={rejectReason}
                                              onChange={e => setRejectReason(e.target.value)}
                                              placeholder="Rejection reason (required)"
                                              rows={2}
                                              style={{
                                                ...inputStyle, marginTop: 0, marginBottom: 8,
                                                resize: "vertical",
                                              }}
                                            />
                                            <div style={{ display: "flex", gap: 8 }}>
                                              <button
                                                disabled={busy || !rejectReason.trim()}
                                                onClick={() => handleReject(p.id)}
                                                style={{
                                                  padding: "8px 18px", background: HEX.red, color: "#fff",
                                                  border: "none", borderRadius: 4, fontSize: 11, fontFamily: S.mono,
                                                  fontWeight: 700, cursor: (busy || !rejectReason.trim()) ? "not-allowed" : "pointer",
                                                  letterSpacing: "0.06em", opacity: (busy || !rejectReason.trim()) ? 0.6 : 1,
                                                }}>
                                                CONFIRM REJECT
                                              </button>
                                              <button
                                                onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                                style={{
                                                  padding: "8px 18px", background: "transparent", color: S.text3,
                                                  border: `1px solid ${S.rim}`, borderRadius: 4,
                                                  fontSize: 11, fontFamily: S.mono, fontWeight: 700, cursor: "pointer",
                                                }}>
                                                CANCEL
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {p.status === "APPROVED" && (
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                      disabled={busy}
                                      onClick={e => { e.stopPropagation(); handleTransmit(p.id); }}
                                      style={{
                                        padding: "8px 18px", background: HEX.blue, color: "#fff",
                                        border: "none", borderRadius: 4, fontSize: 11, fontFamily: S.mono,
                                        fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
                                        letterSpacing: "0.06em", opacity: busy ? 0.6 : 1,
                                      }}>
                                      {busy ? "..." : "TRANSMIT (PAPER)"}
                                    </button>
                                    <button
                                      disabled={busy}
                                      onClick={e => { e.stopPropagation(); handleCancel(p.id); }}
                                      style={{
                                        padding: "8px 18px", background: "transparent", color: HEX.gray,
                                        border: `1px solid ${HEX.gray}33`, borderRadius: 4,
                                        fontSize: 11, fontFamily: S.mono, fontWeight: 700,
                                        cursor: busy ? "not-allowed" : "pointer", letterSpacing: "0.06em",
                                      }}>
                                      CANCEL
                                    </button>
                                  </div>
                                )}

                                {(p.status === "DRAFT" || p.status === "PENDING_APPROVAL") && !isCreator && p.status === "DRAFT" && (
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                      disabled={busy}
                                      onClick={e => { e.stopPropagation(); handleCancel(p.id); }}
                                      style={{
                                        padding: "8px 18px", background: "transparent", color: HEX.gray,
                                        border: `1px solid ${HEX.gray}33`, borderRadius: 4,
                                        fontSize: 11, fontFamily: S.mono, fontWeight: 700,
                                        cursor: busy ? "not-allowed" : "pointer", letterSpacing: "0.06em",
                                      }}>
                                      CANCEL
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td></tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* INITIATE TAB                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "INITIATE" && (
          <div style={{ maxWidth: 760 }}>
            <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 24 }}>
              <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 18 }}>
                NEW PAYMENT INSTRUCTION
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {/* Payment type */}
                <label style={labelStyle}>PAYMENT TYPE
                  <select
                    value={initForm.payment_type}
                    onChange={e => setInitForm({ ...initForm, payment_type: e.target.value, beneficiary_id: "" })}
                    style={{ ...inputStyle, marginTop: 4 }}
                  >
                    {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>

                {/* Beneficiary */}
                <label style={labelStyle}>BENEFICIARY
                  <select
                    value={initForm.beneficiary_id}
                    onChange={e => setInitForm({ ...initForm, beneficiary_id: e.target.value })}
                    style={{ ...inputStyle, marginTop: 4 }}
                  >
                    <option value="">Select beneficiary...</option>
                    {filteredBeneficiaries.map(b => (
                      <option key={b.id} value={b.id}>{b.name} — {b.bank_name} ({b.currency})</option>
                    ))}
                  </select>
                  {filteredBeneficiaries.length === 0 && (
                    <span style={{ fontSize: 10, color: HEX.amber, marginTop: 4, display: "block" }}>
                      No active beneficiaries support {initForm.payment_type}
                    </span>
                  )}
                </label>

                {/* Amount */}
                <label style={labelStyle}>AMOUNT
                  <input
                    type="number" min="0" step="0.01"
                    value={initForm.amount}
                    onChange={e => setInitForm({ ...initForm, amount: e.target.value })}
                    placeholder="0.00"
                    style={{ ...inputStyle, marginTop: 4 }}
                  />
                </label>

                {/* Currency */}
                <label style={labelStyle}>CURRENCY
                  <select
                    value={initForm.currency}
                    onChange={e => setInitForm({ ...initForm, currency: e.target.value })}
                    style={{ ...inputStyle, marginTop: 4 }}
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>

                {/* Execution date */}
                <label style={labelStyle}>EXECUTION DATE
                  <input
                    type="date"
                    value={initForm.execution_date}
                    onChange={e => setInitForm({ ...initForm, execution_date: e.target.value })}
                    style={{ ...inputStyle, marginTop: 4, colorScheme: "dark" }}
                  />
                </label>

                {/* Reference */}
                <label style={labelStyle}>PAYMENT REFERENCE
                  <input
                    type="text"
                    value={initForm.reference}
                    onChange={e => setInitForm({ ...initForm, reference: e.target.value })}
                    placeholder="INV-2024-001"
                    style={{ ...inputStyle, marginTop: 4 }}
                  />
                </label>

                {/* Memo — full width */}
                <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>MEMO (OPTIONAL)
                  <textarea
                    value={initForm.memo}
                    onChange={e => setInitForm({ ...initForm, memo: e.target.value })}
                    placeholder="Additional payment notes..."
                    rows={2}
                    style={{ ...inputStyle, marginTop: 4, resize: "vertical" }}
                  />
                </label>
              </div>

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${S.rim}`, display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  disabled={initLoading || !initForm.beneficiary_id || !initForm.amount || !initForm.reference}
                  onClick={handleInitiate}
                  style={{
                    padding: "9px 22px", background: HEX.cyan, color: "#fff",
                    border: "none", borderRadius: 4, fontSize: 11, fontFamily: S.mono,
                    fontWeight: 700, letterSpacing: "0.06em",
                    cursor: (initLoading || !initForm.beneficiary_id || !initForm.amount || !initForm.reference) ? "not-allowed" : "pointer",
                    opacity: (initLoading || !initForm.beneficiary_id || !initForm.amount || !initForm.reference) ? 0.6 : 1,
                  }}>
                  {initLoading ? "SUBMITTING..." : "SUBMIT FOR APPROVAL"}
                </button>
                <button
                  onClick={() => setTab("PAYMENTS")}
                  style={{
                    padding: "9px 18px", background: "transparent", color: S.text3,
                    border: `1px solid ${S.rim}`, borderRadius: 4,
                    fontSize: 11, fontFamily: S.mono, fontWeight: 700, cursor: "pointer",
                  }}>
                  CANCEL
                </button>
                <span style={{ fontFamily: S.ui, fontSize: 11, color: S.text3, marginLeft: 4 }}>
                  Requires 4-eyes approval (SoD enforced — creator cannot approve own payment)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* BENEFICIARIES TAB                                                 */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "BENEFICIARIES" && (
          <div style={{ maxWidth: 1100 }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <button onClick={() => setShowBeneForm(!showBeneForm)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
                background: HEX.cyan, color: "#fff", border: "none", borderRadius: 4,
                fontSize: 11, fontFamily: S.mono, fontWeight: 700, letterSpacing: "0.06em", cursor: "pointer",
              }}>
                <Plus size={13} />{showBeneForm ? "CANCEL" : "ADD BENEFICIARY"}
              </button>
            </div>

            {/* Create beneficiary form */}
            {showBeneForm && (
              <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 20, marginBottom: 16 }}>
                <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 14 }}>
                  NEW BENEFICIARY
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <label style={labelStyle}>BENEFICIARY NAME
                    <input value={beneForm.name} onChange={e => setBeneForm({ ...beneForm, name: e.target.value })}
                      placeholder="Acme Corp" style={{ ...inputStyle, marginTop: 4 }} />
                  </label>
                  <label style={labelStyle}>BANK NAME
                    <input value={beneForm.bank_name} onChange={e => setBeneForm({ ...beneForm, bank_name: e.target.value })}
                      placeholder="Deutsche Bank" style={{ ...inputStyle, marginTop: 4 }} />
                  </label>
                  <label style={labelStyle}>BANK CODE (BIC / SORT / ABA)
                    <input value={beneForm.bank_code} onChange={e => setBeneForm({ ...beneForm, bank_code: e.target.value })}
                      placeholder="DEUTDEDB" style={{ ...inputStyle, marginTop: 4 }} />
                  </label>
                  <label style={labelStyle}>ACCOUNT NUMBER / IBAN
                    <input value={beneForm.account_number} onChange={e => setBeneForm({ ...beneForm, account_number: e.target.value })}
                      placeholder="DE89370400440532013000" style={{ ...inputStyle, marginTop: 4 }} />
                  </label>
                  <label style={labelStyle}>COUNTRY CODE
                    <input value={beneForm.country_code} onChange={e => setBeneForm({ ...beneForm, country_code: e.target.value.toUpperCase() })}
                      maxLength={2} placeholder="DE" style={{ ...inputStyle, marginTop: 4 }} />
                  </label>
                  <label style={labelStyle}>CURRENCY
                    <select value={beneForm.currency} onChange={e => setBeneForm({ ...beneForm, currency: e.target.value })}
                      style={{ ...inputStyle, marginTop: 4 }}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ ...labelStyle, marginBottom: 8 }}>SUPPORTED PAYMENT TYPES</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {PAYMENT_TYPES.map(t => {
                        const selected = beneForm.payment_types.includes(t);
                        return (
                          <button key={t} type="button" onClick={() => handleToggleBenePaymentType(t)} style={{
                            padding: "4px 10px", borderRadius: 3, fontSize: 10, fontWeight: 700,
                            fontFamily: S.mono, letterSpacing: "0.06em", cursor: "pointer",
                            background: selected ? `${HEX.blue}18` : "transparent",
                            color: selected ? HEX.blue : S.text3,
                            border: selected ? `1px solid ${HEX.blue}40` : `1px solid ${S.rim}`,
                            transition: "all 0.12s",
                          }}>{t}</button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button
                    onClick={handleCreateBeneficiary}
                    disabled={beneSubmitLoading || !beneForm.name || !beneForm.bank_name || !beneForm.bank_code || !beneForm.account_number || !beneForm.country_code}
                    style={{
                      padding: "8px 18px", background: HEX.cyan, color: "#fff",
                      border: "none", borderRadius: 4, fontSize: 11, fontFamily: S.mono,
                      fontWeight: 700, cursor: beneSubmitLoading ? "not-allowed" : "pointer",
                      letterSpacing: "0.06em", opacity: beneSubmitLoading ? 0.6 : 1,
                    }}>
                    {beneSubmitLoading ? "SAVING..." : "CREATE"}
                  </button>
                  <button onClick={() => setShowBeneForm(false)} style={{
                    padding: "8px 18px", background: "transparent", color: S.text3,
                    border: `1px solid ${S.rim}`, borderRadius: 4,
                    fontSize: 11, fontFamily: S.mono, fontWeight: 700, cursor: "pointer",
                  }}>CANCEL</button>
                </div>
              </div>
            )}

            {/* Beneficiaries table */}
            {beneLoading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 60 }}>
                <div style={{ width: 28, height: 28, border: `2px solid ${S.rim}`, borderTopColor: S.cyan, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, letterSpacing: "0.1em" }}>LOADING</span>
              </div>
            ) : (
              <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.mono }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                      {["NAME", "BANK NAME", "BANK CODE", "ACCOUNT", "CCY", "PAYMENT TYPES", "STATUS", ""].map(h => (
                        <th key={h} style={{
                          padding: "10px 14px", textAlign: "left",
                          fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {beneficiaries.length === 0 && (
                      <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: S.text3, fontSize: 12 }}>
                        No beneficiaries configured. Click ADD BENEFICIARY to create one.
                      </td></tr>
                    )}
                    {beneficiaries.map(b => (
                      <tr key={b.id}
                        style={{ borderBottom: `1px solid ${S.rim}`, transition: "background 0.12s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(28,98,242,0.04)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <td style={{ padding: "12px 14px", fontWeight: 600, color: S.text1 }}>{b.name}</td>
                        <td style={{ padding: "12px 14px", color: S.text2 }}>{b.bank_name}</td>
                        <td style={{ padding: "12px 14px", color: S.text2, fontFamily: S.mono, fontSize: 11 }}>{b.bank_code}</td>
                        <td style={{ padding: "12px 14px", color: S.text2, fontFamily: S.mono, fontSize: 11 }}>
                          {b.account_number.length > 14 ? `${b.account_number.slice(0, 6)}...${b.account_number.slice(-4)}` : b.account_number}
                        </td>
                        <td style={{ padding: "12px 14px", color: S.text2 }}>{b.currency}</td>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {b.payment_types.map(t => (
                              <Badge key={t} label={t} color={HEX.blue} />
                            ))}
                            {b.payment_types.length === 0 && <span style={{ color: S.text3, fontSize: 11 }}>&mdash;</span>}
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <Badge label={b.is_active ? "ACTIVE" : "INACTIVE"} color={b.is_active ? HEX.green : HEX.gray} />
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          {b.is_active && (
                            <button
                              onClick={() => handleDeactivateBeneficiary(b.id)}
                              style={{
                                padding: "4px 10px", background: "transparent",
                                color: HEX.gray, border: `1px solid ${HEX.gray}33`,
                                borderRadius: 3, fontSize: 10, fontFamily: S.mono,
                                fontWeight: 700, cursor: "pointer", letterSpacing: "0.04em",
                              }}>
                              DEACTIVATE
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE EXPORT
// ══════════════════════════════════════════════════════════════════════════════

export default function PaymentsPage() {
  return (
    <Suspense fallback={
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-deep)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, border: "2px solid var(--border-rim)", borderTopColor: "var(--accent-cyan)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: 12, color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>LOADING</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    }>
      <PaymentsInner />
    </Suspense>
  );
}
