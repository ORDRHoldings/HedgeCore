"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import type { PositionCreate } from "@/types/api";

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

const FX_PAIRS = ["USD/MXN", "EUR/USD", "GBP/USD", "USD/JPY", "USD/CAD", "EUR/GBP", "AUD/USD"];

const CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "MXN", "CAD", "AUD", "CHF", "HKD", "SGD",
];

const BASE_CURRENCIES = ["USD", "EUR", "GBP", "AUD", "CAD", "CHF"];

const INDUSTRIES = [
  "Manufacturing",
  "Technology",
  "Financial Services",
  "Healthcare",
  "Retail & E-commerce",
  "Energy & Resources",
  "Real Estate",
  "Transportation & Logistics",
  "Agriculture",
  "Other",
];

// ── Progress dots ─────────────────────────────────────────────────────────────

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 40 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? 24 : 8,
            height: 8,
            borderRadius: 4,
            background: i <= current ? S.accentCyan : S.rim,
            transition: "all 0.25s ease",
          }}
        />
      ))}
    </div>
  );
}

// ── Label + Input helpers ────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: S.fontMono,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: S.textTertiary,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontFamily: S.fontUI,
  fontSize: 14,
  color: S.textPrimary,
  background: S.bgPanel,
  border: `1px solid ${S.rim}`,
  borderRadius: 6,
  padding: "10px 14px",
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  paddingRight: 36,
};

function PrimaryBtn({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: S.fontMono,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.06em",
        color: "#fff",
        background: disabled ? S.textTertiary : S.accentCyan,
        border: "none",
        borderRadius: 6,
        padding: "12px 24px",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "opacity 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function SecondaryBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: S.fontMono,
        fontSize: 13,
        fontWeight: 600,
        color: S.textSecondary,
        background: "none",
        border: `1px solid ${S.rim}`,
        borderRadius: 6,
        padding: "12px 20px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ── Step 1: Workspace ─────────────────────────────────────────────────────────

interface WorkspaceData {
  companyName: string;
  baseCurrency: string;
  industry: string;
}

function StepWorkspace({
  data,
  onChange,
}: {
  data: WorkspaceData;
  onChange: (d: WorkspaceData) => void;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: S.fontHeading,
          fontSize: 24,
          fontWeight: 800,
          color: S.textPrimary,
          marginBottom: 8,
          letterSpacing: "-0.02em",
        }}
      >
        Set up your workspace
      </div>
      <div
        style={{
          fontFamily: S.fontUI,
          fontSize: 14,
          color: S.textSecondary,
          marginBottom: 32,
        }}
      >
        Tell us a little about your company so we can configure ORDR Terminal for your needs.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <FieldLabel>Company Name</FieldLabel>
          <input
            style={inputStyle}
            value={data.companyName}
            onChange={(e) => onChange({ ...data, companyName: e.target.value })}
            placeholder="Your company name"
          />
        </div>

        <div>
          <FieldLabel>Base Currency</FieldLabel>
          <select
            style={selectStyle}
            value={data.baseCurrency}
            onChange={(e) => onChange({ ...data, baseCurrency: e.target.value })}
          >
            {BASE_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel>Industry</FieldLabel>
          <select
            style={selectStyle}
            value={data.industry}
            onChange={(e) => onChange({ ...data, industry: e.target.value })}
          >
            <option value="">Select industry…</option>
            {INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: FX Pairs ──────────────────────────────────────────────────────────

function StepFxPairs({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (s: string[]) => void;
}) {
  const toggle = (pair: string) => {
    if (selected.includes(pair)) {
      onChange(selected.filter((p) => p !== pair));
    } else {
      onChange([...selected, pair]);
    }
  };

  const allSelected = selected.length === FX_PAIRS.length;

  return (
    <div>
      <div
        style={{
          fontFamily: S.fontHeading,
          fontSize: 24,
          fontWeight: 800,
          color: S.textPrimary,
          marginBottom: 8,
          letterSpacing: "-0.02em",
        }}
      >
        What FX pairs do you trade?
      </div>
      <div
        style={{
          fontFamily: S.fontUI,
          fontSize: 14,
          color: S.textSecondary,
          marginBottom: 28,
        }}
      >
        Select all currency pairs relevant to your business. You can change this later.
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => onChange(FX_PAIRS)}
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            background: allSelected ? S.accentCyan : S.bgSub,
            color: allSelected ? "#fff" : S.textSecondary,
            border: `1px solid ${allSelected ? S.accentCyan : S.rim}`,
            borderRadius: 4,
            padding: "6px 14px",
            cursor: "pointer",
          }}
        >
          Select All
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            background: "none",
            color: S.textTertiary,
            border: `1px solid ${S.rim}`,
            borderRadius: 4,
            padding: "6px 14px",
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {FX_PAIRS.map((pair) => {
          const active = selected.includes(pair);
          return (
            <button
              key={pair}
              type="button"
              onClick={() => toggle(pair)}
              style={{
                fontFamily: S.fontMono,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.05em",
                padding: "10px 20px",
                borderRadius: 6,
                cursor: "pointer",
                border: `1.5px solid ${active ? S.accentCyan : S.rim}`,
                background: active ? "#EFF6FF" : S.bgPanel,
                color: active ? S.accentCyan : S.textSecondary,
                transition: "all 0.15s",
              }}
            >
              {pair}
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <div
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.statusPass,
            marginTop: 20,
          }}
        >
          {selected.length} pair{selected.length !== 1 ? "s" : ""} selected
        </div>
      )}
    </div>
  );
}

// ── Step 3: First Exposure ────────────────────────────────────────────────────

interface ExposureData {
  currency: string;
  amount: string;
  flow_type: "AR" | "AP";
  value_date: string;
  description: string;
}

function StepFirstExposure({
  data,
  onChange,
  onSkip,
  onSuccess,
}: {
  data: ExposureData;
  onChange: (d: ExposureData) => void;
  onSkip: () => void;
  onSuccess: (created: unknown) => void;
}) {
  const mutation = useMutation({
    mutationFn: (payload: PositionCreate) => api.post("/v1/positions", payload),
    onSuccess,
  });

  const handleSubmit = () => {
    if (!data.currency || !data.amount) return;
    mutation.mutate({
      currency: data.currency,
      amount: parseFloat(data.amount),
      flow_type: data.flow_type,
      value_date: data.value_date || undefined,
      description: data.description || undefined,
    });
  };

  return (
    <div>
      <div
        style={{
          fontFamily: S.fontHeading,
          fontSize: 24,
          fontWeight: 800,
          color: S.textPrimary,
          marginBottom: 8,
          letterSpacing: "-0.02em",
        }}
      >
        Add your first exposure
      </div>
      <div
        style={{
          fontFamily: S.fontUI,
          fontSize: 14,
          color: S.textSecondary,
          marginBottom: 32,
        }}
      >
        Enter an FX receivable (AR) or payable (AP) to see hedge recommendations immediately.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Flow type toggle */}
        <div>
          <FieldLabel>Flow Type</FieldLabel>
          <div style={{ display: "flex", gap: 0, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden", width: "fit-content" }}>
            {(["AR", "AP"] as const).map((ft) => (
              <button
                key={ft}
                type="button"
                onClick={() => onChange({ ...data, flow_type: ft })}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  padding: "10px 28px",
                  background: data.flow_type === ft ? S.accentCyan : S.bgPanel,
                  color: data.flow_type === ft ? "#fff" : S.textSecondary,
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {ft === "AR" ? "AR — Receivable" : "AP — Payable"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <FieldLabel>Currency</FieldLabel>
            <select
              style={selectStyle}
              value={data.currency}
              onChange={(e) => onChange({ ...data, currency: e.target.value })}
            >
              <option value="">Select currency…</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel>Amount</FieldLabel>
            <input
              style={inputStyle}
              type="number"
              min="0"
              step="1000"
              value={data.amount}
              onChange={(e) => onChange({ ...data, amount: e.target.value })}
              placeholder="e.g. 500000"
            />
          </div>
        </div>

        <div>
          <FieldLabel>Value Date (optional)</FieldLabel>
          <input
            style={inputStyle}
            type="date"
            value={data.value_date}
            onChange={(e) => onChange({ ...data, value_date: e.target.value })}
          />
        </div>

        <div>
          <FieldLabel>Description (optional)</FieldLabel>
          <input
            style={inputStyle}
            value={data.description}
            onChange={(e) => onChange({ ...data, description: e.target.value })}
            placeholder="e.g. Q2 supplier payment"
          />
        </div>
      </div>

      {mutation.isError && (
        <div
          style={{
            marginTop: 16,
            padding: "10px 14px",
            background: "#FEE2E2",
            border: `1px solid ${S.accentRed}`,
            borderRadius: 6,
            fontFamily: S.fontUI,
            fontSize: 13,
            color: S.accentRed,
          }}
        >
          {(mutation.error as Error)?.message ?? "Failed to create position."}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
        <PrimaryBtn
          onClick={handleSubmit}
          disabled={!data.currency || !data.amount || mutation.isPending}
        >
          {mutation.isPending ? "Saving…" : "Add Exposure →"}
        </PrimaryBtn>
        <SecondaryBtn onClick={onSkip}>Skip for now →</SecondaryBtn>
      </div>
    </div>
  );
}

// ── Step 4: Done ──────────────────────────────────────────────────────────────

function StepDone({
  exposureCreated,
  onFinish,
}: {
  exposureCreated: boolean;
  onFinish: () => void;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "#D1FAE5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
        }}
      >
        <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
          <path
            d="M2 11L10 19L26 2"
            stroke="#059669"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div
        style={{
          fontFamily: S.fontHeading,
          fontSize: 26,
          fontWeight: 800,
          color: S.textPrimary,
          marginBottom: 10,
          letterSpacing: "-0.02em",
        }}
      >
        You&apos;re set up!
      </div>
      <div
        style={{
          fontFamily: S.fontUI,
          fontSize: 15,
          color: S.textSecondary,
          marginBottom: 32,
          maxWidth: 420,
          margin: "0 auto 32px",
        }}
      >
        {exposureCreated
          ? "Your first FX exposure has been logged. ORDR Terminal is ready to generate hedge recommendations."
          : "Your workspace is configured. Add FX exposures any time from the Position Desk."}
      </div>

      {exposureCreated && (
        <div
          style={{
            background: "#EFF6FF",
            border: `1px solid #BFDBFE`,
            borderRadius: 8,
            padding: "16px 20px",
            marginBottom: 28,
            textAlign: "left",
            maxWidth: 400,
            margin: "0 auto 28px",
          }}
        >
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#1E40AF",
              marginBottom: 8,
            }}
          >
            First Insight
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 13, color: "#1E40AF" }}>
            Go to the Hedge Plan to run your first hedge calculation on this exposure.
          </div>
        </div>
      )}

      <PrimaryBtn onClick={onFinish}>Go to Dashboard →</PrimaryBtn>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [step, setStep] = useState(0);
  const [exposureCreated, setExposureCreated] = useState(false);

  const [workspace, setWorkspace] = useState<WorkspaceData>({
    companyName: user?.company?.name ?? "",
    baseCurrency: "USD",
    industry: "",
  });

  const [selectedPairs, setSelectedPairs] = useState<string[]>(["USD/MXN", "EUR/USD"]);

  const [exposure, setExposure] = useState<ExposureData>({
    currency: "MXN",
    amount: "",
    flow_type: "AR",
    value_date: "",
    description: "",
  });

  const canContinueStep = () => {
    if (step === 0) return workspace.companyName.trim().length > 0;
    if (step === 1) return selectedPairs.length > 0;
    return true;
  };

  const handleNext = () => {
    if (step < 3) setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const handleFinish = () => {
    localStorage.setItem("onboarding_done", "1");
    router.replace("/");
  };

  const handleExposureSuccess = () => {
    setExposureCreated(true);
    setStep(3);
  };

  const handleExposureSkip = () => {
    setStep(3);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: S.bgDeep,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        fontFamily: S.fontUI,
      }}
    >
      {/* Logo / brand */}
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: "0.15em",
          color: S.accentCyan,
          marginBottom: 40,
          textTransform: "uppercase",
        }}
      >
        ORDR Terminal
      </div>

      {/* Progress dots */}
      <ProgressDots total={4} current={step} />

      {/* Card */}
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 12,
          padding: "40px 48px",
          width: "100%",
          maxWidth: 560,
          boxShadow: "0 4px 24px rgba(0,0,0,0.05)",
        }}
      >
        {step === 0 && <StepWorkspace data={workspace} onChange={setWorkspace} />}
        {step === 1 && <StepFxPairs selected={selectedPairs} onChange={setSelectedPairs} />}
        {step === 2 && (
          <StepFirstExposure
            data={exposure}
            onChange={setExposure}
            onSkip={handleExposureSkip}
            onSuccess={handleExposureSuccess}
          />
        )}
        {step === 3 && (
          <StepDone exposureCreated={exposureCreated} onFinish={handleFinish} />
        )}

        {/* Navigation buttons (steps 0, 1 only — step 2 has its own, step 3 has its own) */}
        {step <= 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 36,
              paddingTop: 24,
              borderTop: `1px solid ${S.rim}`,
            }}
          >
            <SecondaryBtn onClick={handleBack}>{step === 0 ? "Cancel" : "← Back"}</SecondaryBtn>
            <PrimaryBtn onClick={handleNext} disabled={!canContinueStep()}>
              Continue →
            </PrimaryBtn>
          </div>
        )}

        {/* Step 2 back button */}
        {step === 2 && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={handleBack}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                color: S.textTertiary,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 0",
              }}
            >
              ← Back
            </button>
          </div>
        )}
      </div>

      {/* Step indicator text */}
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          color: S.textTertiary,
          marginTop: 20,
          letterSpacing: "0.06em",
        }}
      >
        STEP {step + 1} OF 4
      </div>
    </div>
  );
}
