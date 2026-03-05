"use client";

import { Suspense, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { SlideOver } from "@/components/ui/SlideOver";
import { useSearchParamsState } from "@/lib/hooks/useSearchParamsState";
import type { Position, PositionStatus, PaginatedResponse } from "@/types/api";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontHeading: "var(--font-heading,'Manrope',sans-serif)",
  bgDeep: "var(--bg-deep,#F8FAFC)",
  bgSub: "var(--bg-sub,#F1F5F9)",
  bgPanel: "var(--bg-panel,#FFFFFF)",
  rim: "var(--border-rim,#E2E8F0)",
  soft: "var(--border-soft,#CBD5E1)",
  accentCyan: "var(--accent-cyan,#1C62F2)",
  accentAmber: "var(--accent-amber,#D97706)",
  accentRed: "var(--accent-red,#DC2626)",
  statusPass: "var(--status-pass,#059669)",
  statusPending: "var(--status-pending,#94A3B8)",
  textPrimary: "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary: "var(--text-tertiary,#94A3B8)",
} as const;

const PAGE_SIZE = 20;

function fmtUSD(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtNum(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<PositionStatus, { bg: string; color: string; label: string }> = {
  NEW: { bg: "#F1F5F9", color: "#94A3B8", label: "NEW" },
  POLICY_ASSIGNED: { bg: "#EFF6FF", color: "#1C62F2", label: "POLICY ASSIGNED" },
  READY_TO_EXECUTE: { bg: "#FEF3C7", color: "#D97706", label: "READY" },
  HEDGED: { bg: "#D1FAE5", color: "#059669", label: "HEDGED" },
  REJECTED: { bg: "#FEE2E2", color: "#DC2626", label: "REJECTED" },
};

function StatusBadge({ status }: { status: PositionStatus }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.NEW;
  return (
    <span
      style={{
        fontFamily: S.fontMono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        padding: "2px 8px",
        borderRadius: 4,
        background: cfg.bg,
        color: cfg.color,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── Inline field helpers ──────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: S.fontMono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: S.textTertiary,
        marginBottom: 5,
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontFamily: S.fontUI,
  fontSize: 13,
  color: S.textPrimary,
  background: S.bgPanel,
  border: `1px solid ${S.rim}`,
  borderRadius: 6,
  padding: "9px 12px",
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  paddingRight: 30,
};

// ── Add Exposure Form ─────────────────────────────────────────────────────────

interface AddForm {
  currency: string;
  amount: string;
  flow_type: "AR" | "AP";
  value_date: string;
  description: string;
}

function AddExposurePanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AddForm>({
    currency: "",
    amount: "",
    flow_type: "AR",
    value_date: "",
    description: "",
  });
  const [err, setErr] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post("/v1/positions", {
        currency: form.currency,
        amount: parseFloat(form.amount),
        flow_type: form.flow_type,
        value_date: form.value_date || undefined,
        description: form.description || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      onClose();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const valid = form.currency.trim().length > 0 && parseFloat(form.amount) > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Flow type */}
      <div>
        <FieldLabel>Flow Type</FieldLabel>
        <div
          style={{
            display: "flex",
            border: `1px solid ${S.rim}`,
            borderRadius: 6,
            overflow: "hidden",
            width: "fit-content",
          }}
        >
          {(["AR", "AP"] as const).map((ft) => (
            <button
              key={ft}
              type="button"
              onClick={() => setForm({ ...form, flow_type: ft })}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                padding: "8px 22px",
                background: form.flow_type === ft ? S.accentCyan : S.bgPanel,
                color: form.flow_type === ft ? "#fff" : S.textSecondary,
                border: "none",
                cursor: "pointer",
              }}
            >
              {ft === "AR" ? "AR — Receivable" : "AP — Payable"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Currency</FieldLabel>
        <input
          style={inputStyle}
          value={form.currency}
          onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
          placeholder="e.g. MXN"
          maxLength={3}
        />
      </div>

      <div>
        <FieldLabel>Amount</FieldLabel>
        <input
          style={inputStyle}
          type="number"
          min="0"
          step="1000"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder="e.g. 500000"
        />
      </div>

      <div>
        <FieldLabel>Value Date (optional)</FieldLabel>
        <input
          style={inputStyle}
          type="date"
          value={form.value_date}
          onChange={(e) => setForm({ ...form, value_date: e.target.value })}
        />
      </div>

      <div>
        <FieldLabel>Description (optional)</FieldLabel>
        <input
          style={inputStyle}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="e.g. Q2 supplier payment"
        />
      </div>

      {err && (
        <div
          style={{
            padding: "10px 14px",
            background: "#FEE2E2",
            border: `1px solid ${S.accentRed}`,
            borderRadius: 6,
            fontFamily: S.fontUI,
            fontSize: 13,
            color: S.accentRed,
          }}
        >
          {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, paddingTop: 8 }}>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={!valid || mutation.isPending}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.06em",
            background: !valid || mutation.isPending ? S.textTertiary : S.accentCyan,
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "10px 20px",
            cursor: !valid || mutation.isPending ? "not-allowed" : "pointer",
          }}
        >
          {mutation.isPending ? "Saving…" : "Add Exposure"}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 600,
            background: "none",
            border: `1px solid ${S.rim}`,
            borderRadius: 6,
            padding: "10px 16px",
            cursor: "pointer",
            color: S.textSecondary,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Position Detail Panel ─────────────────────────────────────────────────────

function PositionDetail({ position, onClose }: { position: Position; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const doAction = useMutation({
    mutationFn: ({ url, body }: { url: string; body?: unknown }) =>
      api.patch(url, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      onClose();
    },
    onError: (e: Error) => setActionErr(e.message),
  });

  const handleLifecycle = (action: string) => {
    const base = `/v1/positions/${position.id}`;
    if (action === "assign-policy") doAction.mutate({ url: `${base}/assign-policy` });
    if (action === "ready") doAction.mutate({ url: `${base}/ready` });
    if (action === "execute") doAction.mutate({ url: `${base}/execute`, body: {} });
    if (action === "reject") {
      if (!rejectReason.trim()) {
        setActionErr("Please provide a reason.");
        return;
      }
      doAction.mutate({ url: `${base}/reject`, body: { reason: rejectReason } });
    }
  };

  const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 12, borderBottom: `1px solid ${S.rim}`, gap: 12 }}>
      <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontFamily: S.fontMono, fontSize: 13, color: S.textPrimary, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Status + badge */}
      <div style={{ marginBottom: 20 }}>
        <StatusBadge status={position.execution_status} />
      </div>

      {/* Detail rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
        <DetailRow label="Record ID" value={position.record_id} />
        <DetailRow label="Currency" value={position.currency} />
        <DetailRow label="Amount" value={`${fmtNum(position.amount)} ${position.currency}`} />
        <DetailRow label="USD Value" value={fmtUSD(position.amount_usd)} />
        <DetailRow label="Flow Type" value={
          <span style={{ color: position.flow_type === "AR" ? S.statusPass : S.accentAmber }}>
            {position.flow_type === "AR" ? "AR — Receivable" : "AP — Payable"}
          </span>
        } />
        <DetailRow label="Value Date" value={fmtDate(position.value_date)} />
        <DetailRow label="Created" value={fmtDate(position.created_at)} />
        {position.description && <DetailRow label="Description" value={position.description} />}
        {position.hedge_amount != null && (
          <DetailRow label="Hedge Amount" value={fmtUSD(position.hedge_amount)} />
        )}
      </div>

      {/* Lifecycle actions */}
      <div
        style={{
          background: S.bgSub,
          borderRadius: 8,
          padding: "16px",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontFamily: S.fontMono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: S.textTertiary,
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          Lifecycle Actions
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {position.execution_status === "NEW" && (
            <button
              type="button"
              onClick={() => handleLifecycle("assign-policy")}
              disabled={doAction.isPending}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.05em",
                background: S.accentCyan,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "10px 16px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              Assign Policy →
            </button>
          )}

          {position.execution_status === "POLICY_ASSIGNED" && (
            <button
              type="button"
              onClick={() => handleLifecycle("ready")}
              disabled={doAction.isPending}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.05em",
                background: S.accentAmber,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "10px 16px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              Mark Ready to Execute →
            </button>
          )}

          {position.execution_status === "READY_TO_EXECUTE" && (
            <button
              type="button"
              onClick={() => handleLifecycle("execute")}
              disabled={doAction.isPending}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.05em",
                background: S.statusPass,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "10px 16px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              Execute Hedge →
            </button>
          )}

          {!["HEDGED", "REJECTED"].includes(position.execution_status) && (
            <div>
              {!showReject ? (
                <button
                  type="button"
                  onClick={() => setShowReject(true)}
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 600,
                    background: "none",
                    border: `1px solid ${S.accentRed}`,
                    borderRadius: 6,
                    padding: "9px 16px",
                    cursor: "pointer",
                    color: S.accentRed,
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  Reject Position
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    style={inputStyle}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection…"
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleLifecycle("reject")}
                      disabled={doAction.isPending}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 700,
                        background: S.accentRed,
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        padding: "9px 16px",
                        cursor: "pointer",
                      }}
                    >
                      Confirm Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowReject(false); setRejectReason(""); }}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        background: "none",
                        border: `1px solid ${S.rim}`,
                        borderRadius: 6,
                        padding: "9px 14px",
                        cursor: "pointer",
                        color: S.textSecondary,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {actionErr && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              background: "#FEE2E2",
              borderRadius: 6,
              fontFamily: S.fontUI,
              fontSize: 12,
              color: S.accentRed,
            }}
          >
            {actionErr}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CSV Upload Modal ──────────────────────────────────────────────────────────

function CsvUploadModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("No file selected");
      const fd = new FormData();
      fd.append("file", file);
      return api.upload("/v1/connectors/import/csv", fd);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      setDone(true);
    },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.4)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          padding: "28px 32px",
          width: "100%",
          maxWidth: 440,
        }}
      >
        <div
          style={{
            fontFamily: S.fontHeading,
            fontSize: 16,
            fontWeight: 700,
            color: S.textPrimary,
            marginBottom: 6,
          }}
        >
          Import Positions from CSV
        </div>
        <div
          style={{
            fontFamily: S.fontUI,
            fontSize: 13,
            color: S.textSecondary,
            marginBottom: 20,
          }}
        >
          Upload a CSV file with columns: currency, amount, flow_type, value_date, description
        </div>

        {done ? (
          <div
            style={{
              padding: "16px",
              background: "#D1FAE5",
              borderRadius: 6,
              fontFamily: S.fontUI,
              fontSize: 13,
              color: "#059669",
              marginBottom: 16,
            }}
          >
            Import complete. Positions created successfully.
          </div>
        ) : (
          <>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{ fontFamily: S.fontUI, fontSize: 13, marginBottom: 16, display: "block", width: "100%" }}
            />

            {err && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "#FEE2E2",
                  borderRadius: 6,
                  fontFamily: S.fontUI,
                  fontSize: 13,
                  color: S.accentRed,
                  marginBottom: 14,
                }}
              >
                {err}
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          {!done && (
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={!file || mutation.isPending}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                background: !file || mutation.isPending ? S.textTertiary : S.accentCyan,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "10px 18px",
                cursor: !file || mutation.isPending ? "not-allowed" : "pointer",
              }}
            >
              {mutation.isPending ? "Uploading…" : "Upload CSV"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              background: "none",
              border: `1px solid ${S.rim}`,
              borderRadius: 6,
              padding: "10px 16px",
              cursor: "pointer",
              color: S.textSecondary,
            }}
          >
            {done ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function ExposuresContent() {
  const [positionId, setPositionId] = useSearchParamsState("position");
  const [action, setAction] = useSearchParamsState("action");

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [currencyFilter, setCurrencyFilter] = useState<string>("");
  const [flowFilter, setFlowFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [showCsvModal, setShowCsvModal] = useState(false);

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("size", String(PAGE_SIZE));
    if (statusFilter) params.set("execution_status", statusFilter);
    if (currencyFilter) params.set("currency", currencyFilter.toUpperCase());
    if (flowFilter) params.set("flow_type", flowFilter);
    return params.toString();
  };

  const positionsQ = useQuery<PaginatedResponse<Position>>({
    queryKey: ["positions", page, statusFilter, currencyFilter, flowFilter],
    queryFn: () => api.get<PaginatedResponse<Position>>(`/v1/positions?${buildQuery()}`),
  });

  const positions = positionsQ.data?.items ?? [];
  const total = positionsQ.data?.total ?? 0;
  const totalPages = positionsQ.data?.pages ?? 1;

  // Summary stats
  const totalExposureUSD = positions.reduce((acc, p) => acc + (p.amount_usd ?? 0), 0);
  const hedgedCount = positions.filter((p) => p.execution_status === "HEDGED").length;
  const pendingCount = positions.filter(
    (p) => p.execution_status === "POLICY_ASSIGNED" || p.execution_status === "READY_TO_EXECUTE"
  ).length;

  const selectedPosition = positionId ? positions.find((p) => p.id === positionId) : null;
  const isAddOpen = action === "add";

  return (
    <div>
      <PageHeader
        label="POSITION DESK"
        title="FX Exposures"
        subtitle="Manage and lifecycle FX receivables and payables"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowCsvModal(true)}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.04em",
                background: S.bgSub,
                color: S.textPrimary,
                border: `1px solid ${S.rim}`,
                borderRadius: 6,
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              Import CSV
            </button>
            <button
              type="button"
              onClick={() => setAction("add")}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                background: S.accentCyan,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              + Add Exposure
            </button>
          </div>
        }
      />

      {/* Summary bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          { label: "Total Positions", value: String(total) },
          {
            label: "Total Exposure USD",
            value: totalExposureUSD.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }),
          },
          { label: "Hedged", value: String(hedgedCount), accent: S.statusPass },
          { label: "Pending", value: String(pendingCount), accent: S.accentAmber },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 8,
              padding: "14px 18px",
            }}
          >
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: S.textTertiary,
                marginBottom: 5,
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 20,
                fontWeight: 700,
                color: (item as { accent?: string }).accent ?? S.textPrimary,
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters bar */}
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 16,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Filters
        </div>

        <select
          style={{ ...selectStyle, width: 180 }}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          <option value="NEW">New</option>
          <option value="POLICY_ASSIGNED">Policy Assigned</option>
          <option value="READY_TO_EXECUTE">Ready to Execute</option>
          <option value="HEDGED">Hedged</option>
          <option value="REJECTED">Rejected</option>
        </select>

        <input
          style={{ ...inputStyle, width: 120 }}
          value={currencyFilter}
          onChange={(e) => { setCurrencyFilter(e.target.value); setPage(1); }}
          placeholder="Currency…"
          maxLength={3}
        />

        <select
          style={{ ...selectStyle, width: 140 }}
          value={flowFilter}
          onChange={(e) => { setFlowFilter(e.target.value); setPage(1); }}
        >
          <option value="">AR + AP</option>
          <option value="AR">AR — Receivable</option>
          <option value="AP">AP — Payable</option>
        </select>

        {(statusFilter || currencyFilter || flowFilter) && (
          <button
            type="button"
            onClick={() => { setStatusFilter(""); setCurrencyFilter(""); setFlowFilter(""); setPage(1); }}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 600,
              background: "none",
              border: `1px solid ${S.rim}`,
              borderRadius: 4,
              padding: "6px 12px",
              cursor: "pointer",
              color: S.textTertiary,
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 16,
        }}
      >
        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "140px 80px 130px 130px 70px 140px 110px 80px",
            gap: 0,
            borderBottom: `1px solid ${S.rim}`,
            background: S.bgSub,
          }}
        >
          {["ID", "Currency", "Amount", "USD Value", "Flow", "Status", "Date", ""].map((h) => (
            <div
              key={h}
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: S.textTertiary,
                padding: "10px 14px",
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {positionsQ.isLoading ? (
          <div style={{ padding: "32px", textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary }}>
            Loading positions…
          </div>
        ) : positions.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontFamily: S.fontHeading, fontSize: 15, fontWeight: 700, color: S.textPrimary, marginBottom: 8 }}>
              No positions found
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary, marginBottom: 20 }}>
              {statusFilter || currencyFilter || flowFilter
                ? "Try clearing your filters."
                : "Add your first FX exposure to get started."}
            </div>
            <button
              type="button"
              onClick={() => setAction("add")}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                background: S.accentCyan,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "10px 18px",
                cursor: "pointer",
              }}
            >
              + Add Exposure
            </button>
          </div>
        ) : (
          positions.map((pos, i) => (
            <div
              key={pos.id}
              onClick={() => setPositionId(pos.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "140px 80px 130px 130px 70px 140px 110px 80px",
                gap: 0,
                borderBottom: i < positions.length - 1 ? `1px solid ${S.rim}` : "none",
                cursor: "pointer",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = S.bgSub)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ padding: "12px 14px" }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.accentCyan, fontWeight: 600 }}>
                  {pos.record_id.slice(0, 12)}…
                </span>
              </div>
              <div style={{ padding: "12px 14px", fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.textPrimary }}>
                {pos.currency}
              </div>
              <div style={{ padding: "12px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.textSecondary }}>
                {fmtNum(pos.amount)}
              </div>
              <div style={{ padding: "12px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.textSecondary }}>
                {fmtUSD(pos.amount_usd)}
              </div>
              <div style={{ padding: "12px 14px" }}>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    fontWeight: 700,
                    color: pos.flow_type === "AR" ? S.statusPass : S.accentAmber,
                  }}
                >
                  {pos.flow_type}
                </span>
              </div>
              <div style={{ padding: "12px 14px" }}>
                <StatusBadge status={pos.execution_status} />
              </div>
              <div style={{ padding: "12px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                {fmtDate(pos.value_date)}
              </div>
              <div style={{ padding: "12px 14px", textAlign: "center" }}>
                <span style={{ color: S.textTertiary, fontSize: 14 }}>›</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary }}>
            Page {page} of {totalPages} · {total} positions
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 600,
                background: page === 1 ? S.bgSub : S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 6,
                padding: "8px 16px",
                cursor: page === 1 ? "not-allowed" : "pointer",
                color: page === 1 ? S.textTertiary : S.textPrimary,
              }}
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 600,
                background: page === totalPages ? S.bgSub : S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 6,
                padding: "8px 16px",
                cursor: page === totalPages ? "not-allowed" : "pointer",
                color: page === totalPages ? S.textTertiary : S.textPrimary,
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Position detail slide-over */}
      <SlideOver
        open={!!positionId && !!selectedPosition}
        onClose={() => setPositionId(null)}
        title={`Position Detail`}
        subtitle={selectedPosition ? `${selectedPosition.currency} · ${selectedPosition.flow_type}` : undefined}
        width={500}
      >
        {selectedPosition && (
          <PositionDetail
            position={selectedPosition}
            onClose={() => setPositionId(null)}
          />
        )}
      </SlideOver>

      {/* Add exposure slide-over */}
      <SlideOver
        open={isAddOpen}
        onClose={() => setAction(null)}
        title="Add FX Exposure"
        subtitle="Create a new receivable or payable position"
        width={460}
      >
        <AddExposurePanel onClose={() => setAction(null)} />
      </SlideOver>

      {/* CSV Upload modal */}
      {showCsvModal && <CsvUploadModal onClose={() => setShowCsvModal(false)} />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default function ExposuresPage() {
  return (
    <Suspense fallback={null}>
      <ExposuresContent />
    </Suspense>
  );
}
