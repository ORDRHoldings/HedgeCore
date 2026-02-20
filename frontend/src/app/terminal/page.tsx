"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/authContext";
import {
  Layers,
  ArrowLeftRight,
  Radar,
  BookOpen,
} from "lucide-react";

// ── Design Tokens (institutional terminal palette) ───────────────────────────
const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep: "var(--bg-deep)",
  bgPanel: "var(--bg-panel)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  pass: "var(--status-pass)",
  pending: "var(--status-pending)",
} as const;

// ── Module Definitions ───────────────────────────────────────────────────────
interface ModuleDef {
  id: string;
  title: string;
  route: string;
  description: string;
  tooltip: string;
  status: "LIVE" | "UNDER CONSTRUCTION";
  icon: typeof Layers;
}

const MODULES: ModuleDef[] = [
  {
    id: "portfolio-risk",
    title: "Portfolio Risk",
    route: "/portfolio-risk",
    description: "Multi-asset exposure decomposition and deterministic hedge construction.",
    tooltip:
      "Multi-asset exposure decomposition, deterministic hedge construction, scenario analysis, and risk-committee decision surface.",
    status: "LIVE",
    icon: Layers,
  },
  {
    id: "currency-fx",
    title: "CurrencyFX",
    route: "/currency-fx",
    description: "Treasury cash-flow ingestion and policy-constrained hedge sizing.",
    tooltip:
      "Treasury cash-flow ingestion, policy-constrained hedge sizing, deterministic execution tickets, and audit-ready committee pack.",
    status: "LIVE",
    icon: ArrowLeftRight,
  },
  {
    id: "polisophic",
    title: "Polisophic",
    route: "/polisophic",
    description: "Macro-policy and geopolitical intelligence console.",
    tooltip:
      "Macro-policy and geopolitical intelligence console for regime monitoring, constraint setting, and strategic risk oversight.",
    status: "LIVE",
    icon: Radar,
  },
  {
    id: "hedgewiki",
    title: "HedgeWiki",
    route: "/hedgewiki",
    description: "Canonical governance layer and institutional audit playbooks.",
    tooltip:
      "Canonical governance layer defining taxonomy, control logic, lifecycle mapping, and institutional audit playbooks.",
    status: "LIVE",
    icon: BookOpen,
  },
];

// ── Tooltip Component ────────────────────────────────────────────────────────
function Tooltip({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
      });
    }
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        role="button"
        aria-describedby={visible ? "tooltip-popup" : undefined}
        style={{ display: "inline-flex", outline: "none" }}
      >
        {children}
      </div>
      {visible && (
        <div
          ref={tooltipRef}
          id="tooltip-popup"
          role="tooltip"
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            transform: "translateX(-50%)",
            zIndex: 9999,
            maxWidth: 340,
            padding: "10px 14px",
            fontFamily: S.fontUI,
            fontSize: "0.6875rem",
            lineHeight: 1.6,
            color: S.secondary,
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            pointerEvents: "none",
          }}
        >
          {text}
        </div>
      )}
    </>
  );
}

// ── Module Card ──────────────────────────────────────────────────────────────
function ModuleCard({ mod }: { mod: ModuleDef }) {
  const router = useRouter();
  const isLive = mod.status === "LIVE";
  const Icon = mod.icon;

  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        transition: "border-color 100ms",
      }}
      onMouseEnter={(e) => {
        if (isLive) e.currentTarget.style.borderColor = "var(--accent-cyan)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = S.rim;
      }}
    >
      {/* Card Header */}
      <div
        style={{
          padding: "16px 20px 12px",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <Tooltip text={mod.tooltip}>
          <div
            style={{
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isLive
                ? "color-mix(in srgb, var(--accent-cyan) 8%, transparent)"
                : S.bgSub,
              border: `1px solid ${isLive ? "color-mix(in srgb, var(--accent-cyan) 20%, transparent)" : S.soft}`,
              flexShrink: 0,
            }}
          >
            <Icon
              size={18}
              strokeWidth={1.5}
              style={{
                color: isLive ? S.cyan : S.tertiary,
              }}
            />
          </div>
        </Tooltip>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 2,
            }}
          >
            <Tooltip text={mod.tooltip}>
              <span
                style={{
                  fontFamily: S.fontUI,
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: S.primary,
                  letterSpacing: "0.01em",
                }}
              >
                {mod.title}
              </span>
            </Tooltip>
            {/* Status Badge */}
            <span
              className={
                isLive ? "hc-status-badge hc-status-active" : "hc-status-badge hc-status-pending"
              }
            >
              <span className="hc-status-dot" />
              {mod.status}
            </span>
          </div>
          <p
            style={{
              fontFamily: S.fontUI,
              fontSize: "0.6875rem",
              lineHeight: 1.55,
              color: S.tertiary,
              margin: 0,
            }}
          >
            {mod.description}
          </p>
        </div>
      </div>

      {/* Card Footer */}
      <div
        style={{
          padding: "8px 20px 14px",
          borderTop: `1px solid ${S.soft}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: "0.5625rem",
            color: S.tertiary,
            letterSpacing: "0.04em",
          }}
        >
          {mod.route}
        </span>
        <button
          className={`hc-action-btn no-scale ${isLive ? "hc-action-primary" : "hc-action-muted"}`}
          disabled={!isLive}
          onClick={() => router.push(mod.route)}
          aria-label={`Open ${mod.title} module`}
        >
          Open Module
        </button>
      </div>
    </div>
  );
}

// ── Terminal Page ─────────────────────────────────────────────────────────────
export default function TerminalPage() {
  const router = useRouter();
  const { isAuthenticated, logout, user } = useAuth();
  const [ready, setReady] = useState(false);

  // Auth guard — wait for hydration, then redirect if unauthenticated
  useEffect(() => {
    // On first client render, check auth state
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace("/auth/login");
    }
  }, [ready, isAuthenticated, router]);

  // Show loading shell while auth resolves
  if (!ready || !isAuthenticated) {
    return (
      <div
        style={{
          fontFamily: S.fontUI,
          fontSize: "0.75rem",
          color: S.tertiary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
          letterSpacing: "0.04em",
        }}
      >
        Initializing session...
      </div>
    );
  }

  const sessionTs = new Date()
    .toISOString()
    .replace("T", " ")
    .slice(0, 19) + " UTC";

  return (
    <div className="hc-workspace" style={{ minHeight: "calc(100vh - 110px)" }}>
      {/* ── Identity Bar ── */}
      <div className="hc-identity-bar">
        <div className="hc-identity-left">
          <span className="hc-product-name">ORDR Terminal</span>
          <span className="hc-env-badge" data-state="sandbox">
            TERMINAL
          </span>
        </div>
        <div className="hc-identity-meta">
          <span className="hc-meta-chip">
            <span className="hc-meta-label">Session</span>
            <span className="hc-meta-value">{sessionTs}</span>
          </span>
          <span className="hc-meta-sep">|</span>
          <span className="hc-meta-chip">
            <span className="hc-meta-label">Modules</span>
            <span className="hc-meta-value hc-meta-accent">
              {MODULES.filter((m) => m.status === "LIVE").length} active
            </span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 12 }}>
          <a
            href="/dashboard"
            style={{
              fontFamily: S.fontMono,
              fontSize: '0.5rem',
              letterSpacing: '0.06em',
              padding: '3px 8px',
              color: S.tertiary,
              border: '1px solid ' + S.rim,
              textDecoration: 'none',
            }}
          >
            Dashboard
          </a>
        </div>
        <div className="hc-identity-right">
          <span className="hc-user-chip">
            <span style={{ color: S.tertiary }}>Role:</span>
            {user?.roles?.[0] ? <span className="hc-meta-accent">{user.roles[0]}</span> : <span className="hc-meta-accent">—</span>}
          </span>
          <button
            className="hc-logout-btn no-scale"
            onClick={() => {
              logout();
              router.push("/auth/login");
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div
        className="hc-main-grid"
        style={{ gridTemplateColumns: "1fr", border: "none" }}
      >
        <div className="hc-primary-col" style={{ maxWidth: 1000, margin: "0 auto", width: "100%" }}>
          {/* Section Header */}
          <div className="hc-section">
            <div className="hc-section-header">
              <span className="hc-section-index">01</span>
              <h2 className="hc-section-title">Module Selection</h2>
              <span className="hc-section-count">
                {MODULES.length} registered
              </span>
            </div>
            <div className="hc-divider" />
            <p className="hc-body-text" style={{ marginBottom: 20 }}>
              Select a module to enter. Each module operates within its own
              analytical context and data boundary.
            </p>
          </div>

          {/* 2x2 Module Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 16,
            }}
            className="terminal-module-grid"
          >
            {MODULES.map((mod) => (
              <ModuleCard key={mod.id} mod={mod} />
            ))}
          </div>

          {/* System Posture Table */}
          <div className="hc-section" style={{ marginTop: 8 }}>
            <div className="hc-section-header">
              <span className="hc-section-index">02</span>
              <h2 className="hc-section-title">System Posture</h2>
            </div>
            <div className="hc-divider" />
            <table className="hc-module-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th style={{ textAlign: "right" }}>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hc-module-row">
                  <td>Engine Version</td>
                  <td style={{ textAlign: "right" }}>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: "0.625rem",
                        color: S.secondary,
                      }}
                    >
                      1.0.0
                    </span>
                  </td>
                </tr>
                <tr className="hc-module-row">
                  <td>Environment</td>
                  <td style={{ textAlign: "right" }}>
                    <span className="hc-status-badge hc-status-active">
                      <span className="hc-status-dot" />
                      PRODUCTION
                    </span>
                  </td>
                </tr>
                <tr className="hc-module-row">
                  <td>Auth Mode</td>
                  <td style={{ textAlign: "right" }}>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: "0.625rem",
                        color: S.secondary,
                      }}
                    >
                      DEMO (cookie-backed)
                    </span>
                  </td>
                </tr>
                <tr className="hc-module-row">
                  <td>Backend Connectivity</td>
                  <td style={{ textAlign: "right" }}>
                    <span className="hc-status-badge hc-status-active">
                      <span className="hc-status-dot" />
                      CONNECTED
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="hc-footer">
        <span>ORDR TERMINAL</span>
        <span className="hc-footer-sep">|</span>
        <span>Institutional FX Risk Infrastructure</span>
        <span className="hc-footer-sep">|</span>
        <span>{sessionTs}</span>
      </div>

      {/* Responsive: stack on mobile */}
      <style>{`
        @media (max-width: 680px) {
          .terminal-module-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
