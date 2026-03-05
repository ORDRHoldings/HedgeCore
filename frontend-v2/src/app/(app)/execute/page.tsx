"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import TierGateClient from "@/components/tier/TierGateClient";
import type { Position } from "@/types/api";

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
  textPrimary: "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary: "var(--text-tertiary,#94A3B8)",
} as const;

const STEPS = [
  { n: 1, label: "Review" },
  { n: 2, label: "Calculate" },
  { n: 3, label: "Risk Check" },
  { n: 4, label: "Execute" },
];

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function StepTracker({ current }: { current: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 10,
        padding: "16px 24px",
        marginBottom: 28,
        overflow: "hidden",
      }}
    >
      {STEPS.map((step, i) => {
        const isDone = current > step.n;
        const isActive = current === step.n;
        return (
          <div key={step.n} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: isDone ? S.statusPass : isActive ? S.accentCyan : S.bgSub,
                  border: `2px solid ${isDone ? S.statusPass : isActive ? S.accentCyan : S.soft}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {isDone ? (
                  <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>
                ) : (
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      fontWeight: 700,
                      color: isActive ? "#fff" : S.textTertiary,
                    }}
                  >
                    {step.n}
                  </span>
                )}
              </div>
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: isActive ? S.textPrimary : isDone ? S.statusPass : S.textTertiary,
                  whiteSpace: "nowrap",
                }}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: isDone ? S.statusPass : S.rim,
                  margin: "0 16px",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Step 1: Review
function StepReview({
  positions,
  selected,
  onToggle,
  onSelectAll,
  onContinue,
  isLoading,
}: {
  positions: Position[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onContinue: () => void;
  isLoading: boolean;
}) {
  const totalExposure = positions
    .filter((p) => selected.has(p.id))
    .reduce((sum, p) => sum + (p.amount_usd ?? p.amount), 0);

  return (
    <div>
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: S.textTertiary,
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        Step 1 — Select Positions to Execute
      </div>

      {isLoading && (
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 10,
            padding: "40px",
            textAlign: "center",
            color: S.textTertiary,
            fontFamily: S.fontMono,
            fontSize: 12,
          }}
        >
          Loading positions…
        </div>
      )}

      {!isLoading && positions.length === 0 && (
        <div
          style={{
            background: S.bgPanel,
            border: `1px dashed ${S.soft}`,
            borderRadius: 10,
            padding: "48px",
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: S.fontHeading, fontWeight: 700, fontSize: 16, color: S.textPrimary, marginBottom: 8 }}>
            No positions ready to execute
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary, marginBottom: 20 }}>
            Positions must have a policy assigned before they can be executed.
          </div>
          <Link
            href="/exposures"
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.05em",
              background: S.accentCyan,
              color: "#fff",
              padding: "8px 18px",
              borderRadius: 6,
              textDecoration: "none",
            }}
          >
            View Positions →
          </Link>
        </div>
      )}

      {!isLoading && positions.length > 0 && (
        <>
          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 10,
              overflow: "hidden",
              marginBottom: 16,
            }}
          >
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr 120px 120px 140px",
                padding: "10px 20px",
                borderBottom: `1px solid ${S.rim}`,
                background: S.bgSub,
              }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={selected.size === positions.length && positions.length > 0}
                  onChange={onSelectAll}
                  style={{ cursor: "pointer" }}
                />
              </div>
              {["Currency", "Amount (USD)", "Flow Type", "Policy"].map((h) => (
                <div
                  key={h}
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: S.textTertiary,
                    textTransform: "uppercase",
                  }}
                >
                  {h}
                </div>
              ))}
            </div>

            {positions.map((p, i) => (
              <div
                key={p.id}
                onClick={() => onToggle(p.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr 120px 120px 140px",
                  padding: "14px 20px",
                  borderBottom: i < positions.length - 1 ? `1px solid ${S.rim}` : "none",
                  cursor: "pointer",
                  background: selected.has(p.id) ? "#EFF6FF" : "transparent",
                  transition: "background 0.1s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => onToggle(p.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ cursor: "pointer" }}
                  />
                </div>
                <div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 600, color: S.textPrimary }}>
                    {p.currency}
                  </div>
                  {p.description && (
                    <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textTertiary, marginTop: 2 }}>
                      {p.description}
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: S.fontMono, fontSize: 13, color: S.textPrimary, fontWeight: 600 }}>
                  {fmtUSD(p.amount_usd ?? p.amount)}
                </div>
                <div>
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      padding: "2px 8px",
                      borderRadius: 3,
                      background: p.flow_type === "AR" ? "#D1FAE5" : "#FEF3C7",
                      color: p.flow_type === "AR" ? S.statusPass : S.accentAmber,
                    }}
                  >
                    {p.flow_type}
                  </span>
                </div>
                <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                  {p.policy_instance_id ? "Policy assigned" : "—"}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 10,
              padding: "16px 20px",
            }}
          >
            <div>
              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginBottom: 3 }}>
                SELECTED EXPOSURE
              </div>
              <div style={{ fontFamily: S.fontHeading, fontSize: 20, fontWeight: 700, color: S.textPrimary }}>
                {fmtUSD(totalExposure)}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginTop: 2 }}>
                {selected.size} position{selected.size !== 1 ? "s" : ""} selected
              </div>
            </div>
            <button
              onClick={onContinue}
              disabled={selected.size === 0}
              style={{
                fontFamily: S.fontMono,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.05em",
                background: selected.size === 0 ? S.bgSub : S.accentCyan,
                color: selected.size === 0 ? S.textTertiary : "#fff",
                border: "none",
                padding: "10px 24px",
                borderRadius: 6,
                cursor: selected.size === 0 ? "not-allowed" : "pointer",
              }}
            >
              Continue →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Step 2: Calculate
function StepCalculate({
  positions,
  selected,
  calcResult,
  onCalculate,
  onContinue,
  onRevise,
  isCalculating,
  error,
}: {
  positions: Position[];
  selected: Set<string>;
  calcResult: Record<string, unknown> | null;
  onCalculate: () => void;
  onContinue: () => void;
  onRevise: () => void;
  isCalculating: boolean;
  error: string | null;
}) {
  const selectedPositions = positions.filter((p) => selected.has(p.id));

  return (
    <div>
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: S.textTertiary,
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        Step 2 — Calculate Hedge
      </div>

      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          padding: "20px 24px",
          marginBottom: 16,
        }}
      >
        <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary, marginBottom: 12 }}>
          Selected {selectedPositions.length} position{selectedPositions.length !== 1 ? "s" : ""} for calculation:
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {selectedPositions.map((p) => (
            <span
              key={p.id}
              style={{
                fontFamily: S.fontMono,
                fontSize: 11,
                fontWeight: 600,
                background: "#EFF6FF",
                color: S.accentCyan,
                border: `1px solid #BFDBFE`,
                padding: "3px 10px",
                borderRadius: 4,
              }}
            >
              {p.currency} {fmtUSD(p.amount_usd ?? p.amount)}
            </span>
          ))}
        </div>

        {!calcResult && (
          <button
            onClick={onCalculate}
            disabled={isCalculating}
            style={{
              fontFamily: S.fontMono,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.05em",
              background: isCalculating ? S.bgSub : S.accentCyan,
              color: isCalculating ? S.textTertiary : "#fff",
              border: "none",
              padding: "10px 24px",
              borderRadius: 6,
              cursor: isCalculating ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {isCalculating && (
              <span
                style={{
                  width: 14,
                  height: 14,
                  border: "2px solid rgba(255,255,255,0.4)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "spin 0.7s linear infinite",
                }}
              />
            )}
            {isCalculating ? "Calculating…" : "Run Calculation"}
          </button>
        )}

        {error && (
          <div
            style={{
              marginTop: 12,
              background: "#FEF2F2",
              border: `1px solid #FECACA`,
              borderRadius: 6,
              padding: "10px 16px",
              fontFamily: S.fontUI,
              fontSize: 13,
              color: S.accentRed,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {calcResult && (
        <>
          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 10,
              padding: "20px 24px",
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
                marginBottom: 14,
              }}
            >
              Calculation Result
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 16 }}>
              {([
                { label: "Verdict", value: (calcResult.verdict as string) ?? "—", isVerdict: true },
                { label: "Run ID", value: String(calcResult.run_id ?? "—").slice(0, 16) + "…", isVerdict: false },
                { label: "Position Count", value: String(calcResult.position_count ?? "—"), isVerdict: false },
                { label: "Status", value: String(calcResult.status ?? "—"), isVerdict: false },
              ] as { label: string; value: string; isVerdict: boolean }[]).map(({ label, value, isVerdict }) => (
                <div key={label}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                    {label}
                  </div>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 14,
                      fontWeight: 700,
                      color: isVerdict
                        ? value === "APPROVE"
                          ? S.statusPass
                          : value === "REJECT"
                          ? S.accentRed
                          : S.accentAmber
                        : S.textPrimary,
                    }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {Array.isArray(calcResult.scenarios) && (calcResult.scenarios as unknown[]).length > 0 ? (
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Scenarios
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(calcResult.scenarios as Record<string, string | number | boolean | null>[]).slice(0, 5).map((s, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "8px 12px",
                        background: S.bgSub,
                        borderRadius: 6,
                        fontFamily: S.fontMono,
                        fontSize: 11,
                        color: S.textSecondary,
                      }}
                    >
                      {Object.entries(s).map(([k, v]) => (
                        <span key={k}>
                          <span style={{ color: S.textTertiary }}>{k}:</span> {String(v)}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onRevise}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.05em",
                background: "transparent",
                border: `1px solid ${S.soft}`,
                color: S.textSecondary,
                padding: "9px 20px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              ← Revise
            </button>
            <button
              onClick={onContinue}
              style={{
                fontFamily: S.fontMono,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.05em",
                background: S.accentCyan,
                color: "#fff",
                border: "none",
                padding: "9px 24px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Continue →
            </button>
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Step 3: Risk Check
function StepRiskCheck({
  riskResult,
  onCheck,
  onProceed,
  onBack,
  isChecking,
  error,
}: {
  riskResult: Record<string, unknown> | null;
  onCheck: () => void;
  onProceed: () => void;
  onBack: () => void;
  isChecking: boolean;
  error: string | null;
}) {
  const verdict = riskResult?.verdict as string | undefined;

  const verdictStyle = {
    APPROVE: { bg: "#D1FAE5", color: S.statusPass, border: "#6EE7B7" },
    APPROVE_WITH_CONDITIONS: { bg: "#FEF3C7", color: S.accentAmber, border: "#FCD34D" },
    REJECT: { bg: "#FEF2F2", color: S.accentRed, border: "#FECACA" },
  }[verdict ?? ""] ?? { bg: S.bgSub, color: S.textSecondary, border: S.rim };

  const reasons = riskResult?.reasons as string[] | undefined;

  return (
    <div>
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: S.textTertiary,
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        Step 3 — Risk Gate
      </div>

      {!riskResult && (
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 10,
            padding: "28px 24px",
            marginBottom: 16,
          }}
        >
          <div style={{ fontFamily: S.fontUI, fontSize: 14, color: S.textPrimary, marginBottom: 6, fontWeight: 600 }}>
            Risk Gate Check
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary, marginBottom: 16 }}>
            The risk gate validates your proposed hedge against policy constraints, market conditions, and compliance rules before execution.
          </div>
          <button
            onClick={onCheck}
            disabled={isChecking}
            style={{
              fontFamily: S.fontMono,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.05em",
              background: isChecking ? S.bgSub : S.accentCyan,
              color: isChecking ? S.textTertiary : "#fff",
              border: "none",
              padding: "10px 24px",
              borderRadius: 6,
              cursor: isChecking ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {isChecking && (
              <span
                style={{
                  width: 14,
                  height: 14,
                  border: "2px solid rgba(255,255,255,0.4)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "spin 0.7s linear infinite",
                }}
              />
            )}
            {isChecking ? "Checking…" : "Run Risk Check"}
          </button>
          {error && (
            <div
              style={{
                marginTop: 12,
                background: "#FEF2F2",
                border: `1px solid #FECACA`,
                borderRadius: 6,
                padding: "10px 16px",
                fontFamily: S.fontUI,
                fontSize: 13,
                color: S.accentRed,
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}

      {riskResult && (
        <>
          <div
            style={{
              background: verdictStyle.bg,
              border: `1px solid ${verdictStyle.border}`,
              borderRadius: 10,
              padding: "24px",
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: verdictStyle.color,
                marginBottom: 6,
              }}
            >
              {verdict}
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: 13, color: verdictStyle.color, opacity: 0.85 }}>
              Risk gate verdict
            </div>
          </div>

          {reasons && reasons.length > 0 && (
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 10,
                padding: "20px 24px",
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
                Conditions & Reasons
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {reasons.map((r, i) => (
                  <li
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      fontFamily: S.fontUI,
                      fontSize: 13,
                      color: S.textSecondary,
                    }}
                  >
                    <span
                      style={{
                        color: verdict === "REJECT" ? S.accentRed : S.accentAmber,
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      {verdict === "REJECT" ? "✕" : "◆"}
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onBack}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.05em",
                background: "transparent",
                border: `1px solid ${S.soft}`,
                color: S.textSecondary,
                padding: "9px 20px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              ← Back
            </button>
            {verdict !== "REJECT" && (
              <button
                onClick={onProceed}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  background: S.accentCyan,
                  color: "#fff",
                  border: "none",
                  padding: "9px 24px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Proceed to Execute →
              </button>
            )}
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Step 4: Execute
function StepExecute({
  positions,
  selected,
  onExecute,
  onBack,
  isExecuting,
  success,
  error,
}: {
  positions: Position[];
  selected: Set<string>;
  onExecute: () => void;
  onBack: () => void;
  isExecuting: boolean;
  success: boolean;
  error: string | null;
}) {
  const [confirmText, setConfirmText] = useState("");
  const selectedPositions = positions.filter((p) => selected.has(p.id));
  const totalUSD = selectedPositions.reduce((sum, p) => sum + (p.amount_usd ?? p.amount), 0);
  const canExecute = confirmText === "EXECUTE";

  if (success) {
    return (
      <div
        style={{
          background: "#D1FAE5",
          border: `1px solid #6EE7B7`,
          borderRadius: 10,
          padding: "40px 32px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
        <div style={{ fontFamily: S.fontHeading, fontWeight: 700, fontSize: 20, color: S.statusPass, marginBottom: 8 }}>
          Execution Submitted
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: 14, color: "#047857", marginBottom: 20 }}>
          {selectedPositions.length} position{selectedPositions.length !== 1 ? "s" : ""} ({fmtUSD(totalUSD)}) submitted for 4-eyes approval.
        </div>
        <Link
          href="/governance/staging"
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.05em",
            background: S.statusPass,
            color: "#fff",
            padding: "9px 20px",
            borderRadius: 6,
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          View in Staging Queue →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: S.textTertiary,
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        Step 4 — Execute
      </div>

      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          padding: "20px 24px",
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
          Execution Summary
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, marginBottom: 4 }}>POSITIONS</div>
            <div style={{ fontFamily: S.fontHeading, fontSize: 22, fontWeight: 700, color: S.textPrimary }}>
              {selectedPositions.length}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, marginBottom: 4 }}>TOTAL EXPOSURE</div>
            <div style={{ fontFamily: S.fontHeading, fontSize: 22, fontWeight: 700, color: S.textPrimary }}>
              {fmtUSD(totalUSD)}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, marginBottom: 4 }}>CURRENCIES</div>
            <div style={{ fontFamily: S.fontHeading, fontSize: 22, fontWeight: 700, color: S.textPrimary }}>
              {[...new Set(selectedPositions.map((p) => p.currency))].join(", ")}
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#FEF3C7",
            border: `1px solid #FCD34D`,
            borderRadius: 6,
            padding: "12px 16px",
            marginBottom: 16,
            fontFamily: S.fontUI,
            fontSize: 13,
            color: "#92400E",
          }}
        >
          This action will submit execution proposals for all selected positions. A second approver must authorize before execution is final.
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 700,
              color: S.textSecondary,
              display: "block",
              marginBottom: 6,
              letterSpacing: "0.04em",
            }}
          >
            Type <span style={{ color: S.accentRed, fontWeight: 900 }}>EXECUTE</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="EXECUTE"
            style={{
              fontFamily: S.fontMono,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: S.textPrimary,
              background: S.bgSub,
              border: `2px solid ${canExecute ? S.statusPass : S.rim}`,
              borderRadius: 6,
              padding: "10px 16px",
              outline: "none",
              width: "100%",
              maxWidth: 280,
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
          />
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 12,
            background: "#FEF2F2",
            border: `1px solid #FECACA`,
            borderRadius: 6,
            padding: "10px 16px",
            fontFamily: S.fontUI,
            fontSize: 13,
            color: S.accentRed,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onBack}
          disabled={isExecuting}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.05em",
            background: "transparent",
            border: `1px solid ${S.soft}`,
            color: S.textSecondary,
            padding: "9px 20px",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
        <button
          onClick={onExecute}
          disabled={!canExecute || isExecuting}
          style={{
            fontFamily: S.fontMono,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.05em",
            background: canExecute && !isExecuting ? S.accentRed : S.bgSub,
            color: canExecute && !isExecuting ? "#fff" : S.textTertiary,
            border: "none",
            padding: "9px 24px",
            borderRadius: 6,
            cursor: canExecute && !isExecuting ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {isExecuting && (
            <span
              style={{
                width: 14,
                height: 14,
                border: "2px solid rgba(255,255,255,0.4)",
                borderTopColor: "#fff",
                borderRadius: "50%",
                display: "inline-block",
                animation: "spin 0.7s linear infinite",
              }}
            />
          )}
          {isExecuting ? "Executing…" : "Execute Now"}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ExecuteContent() {
  const { token } = useAuthStore();
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [calcResult, setCalcResult] = useState<Record<string, unknown> | null>(null);
  const [riskResult, setRiskResult] = useState<Record<string, unknown> | null>(null);
  const [executeSuccess, setExecuteSuccess] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  const positionsQ = useQuery<{ items: Position[]; total: number }>({
    queryKey: ["positions-ready"],
    queryFn: () => api.get<{ items: Position[]; total: number }>("/v1/positions?execution_status=READY_TO_EXECUTE"),
    enabled: !!token,
  });

  const positions: Position[] = positionsQ.data?.items ?? [];

  const calcMutation = useMutation({
    mutationFn: (positionIds: string[]) =>
      api.post<Record<string, unknown>>("/v1/calculate", { positions: positionIds }),
    onSuccess: (data) => {
      setCalcResult(data);
      setCalcError(null);
    },
    onError: (e: Error) => setCalcError(e.message),
  });

  const riskMutation = useMutation({
    mutationFn: (payload: { position_ids: string[]; market_snapshot?: unknown }) =>
      api.post<Record<string, unknown>>("/v1/risk-check", payload),
    onSuccess: (data) => {
      setRiskResult(data);
      setRiskError(null);
    },
    onError: (e: Error) => setRiskError(e.message),
  });

  const executeMutation = useMutation({
    mutationFn: async (positionIds: string[]) => {
      for (const id of positionIds) {
        await api.post(`/v1/positions/${id}/execute`);
      }
    },
    onSuccess: () => {
      setExecuteSuccess(true);
      setExecError(null);
    },
    onError: (e: Error) => setExecError(e.message),
  });

  const togglePosition = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === positions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(positions.map((p) => p.id)));
    }
  };

  return (
    <div style={{ fontFamily: S.fontUI }}>
      <PageHeader
        label="EXECUTION"
        title="Execute Hedge"
        subtitle="4-step guided execution wizard with risk gate"
      />

      <StepTracker current={step} />

      {step === 1 && (
        <StepReview
          positions={positions}
          selected={selected}
          onToggle={togglePosition}
          onSelectAll={selectAll}
          onContinue={() => setStep(2)}
          isLoading={positionsQ.isLoading}
        />
      )}

      {step === 2 && (
        <StepCalculate
          positions={positions}
          selected={selected}
          calcResult={calcResult}
          onCalculate={() => {
            setCalcResult(null);
            calcMutation.mutate([...selected]);
          }}
          onContinue={() => setStep(3)}
          onRevise={() => { setStep(1); setCalcResult(null); }}
          isCalculating={calcMutation.isPending}
          error={calcError}
        />
      )}

      {step === 3 && (
        <StepRiskCheck
          riskResult={riskResult}
          onCheck={() => {
            setRiskResult(null);
            riskMutation.mutate({
              position_ids: [...selected],
              market_snapshot: calcResult?.market_snapshot,
            });
          }}
          onProceed={() => setStep(4)}
          onBack={() => { setStep(2); setRiskResult(null); }}
          isChecking={riskMutation.isPending}
          error={riskError}
        />
      )}

      {step === 4 && (
        <StepExecute
          positions={positions}
          selected={selected}
          onExecute={() => executeMutation.mutate([...selected])}
          onBack={() => setStep(3)}
          isExecuting={executeMutation.isPending}
          success={executeSuccess}
          error={execError}
        />
      )}
    </div>
  );
}

export default function ExecutePage() {
  return (
    <TierGateClient requiredTier="smb" featureName="execute">
      <ExecuteContent />
    </TierGateClient>
  );
}
