"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgDeep: "var(--bg-deep,#F8FAFC)",
  bgPanel: "var(--bg-panel,#FFFFFF)",
  bgSub: "var(--bg-sub,#F1F5F9)",
  rim: "var(--border-rim,#E2E8F0)",
  accentRed: "var(--accent-red,#DC2626)",
  accentCyan: "var(--accent-cyan,#1C62F2)",
  textPrimary: "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary: "var(--text-tertiary,#94A3B8)",
} as const;

const NAV_TABS = [
  { label: "War Room", href: "/admin" },
  { label: "Tenants", href: "/admin/tenants" },
  { label: "Users", href: "/admin/users" },
  { label: "System", href: "/admin/system" },
  { label: "Audit", href: "/admin/audit" },
  { label: "API Keys", href: "/admin/api-keys" },
  { label: "Metrics", href: "/admin/metrics" },
  { label: "Config", href: "/admin/config" },
];

function NotFound() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-deep)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 48, fontWeight: 700, color: "var(--border-soft)" }}>404</div>
        <div style={{ fontFamily: "var(--font-terminal)", fontSize: 14, color: "var(--text-tertiary)", marginTop: 8 }}>Page not found</div>
      </div>
    </div>
  );
}

function LiveClock() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toUTCString().replace("GMT", "UTC").replace(/.*(\d{2}:\d{2}:\d{2}).*/, "$1") +
          " UTC · " +
          now.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" })
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary, letterSpacing: "0.04em" }}>
      {time}
    </span>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();
  const pathname = usePathname();

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: S.bgDeep }}>
        <div
          style={{
            width: 32,
            height: 32,
            border: "3px solid var(--border-rim)",
            borderTopColor: S.accentRed,
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user?.is_superuser) {
    return <NotFound />;
  }

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes radar-pulse {
          0% { box-shadow: 0 0 0 0 rgba(220,38,38,0.6); }
          70% { box-shadow: 0 0 0 8px rgba(220,38,38,0); }
          100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); }
        }
        .radar-pulse { animation: radar-pulse 1.8s ease-out infinite; }
        .admin-nav-tab:hover { background: var(--bg-sub) !important; color: var(--text-primary) !important; }
      `}</style>

      {/* Admin Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: S.bgPanel,
          borderBottom: `1px solid ${S.rim}`,
          borderLeft: `3px solid ${S.accentRed}`,
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            height: 52,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Radar pulse dot */}
            <span
              className="radar-pulse"
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: S.accentRed,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: S.fontMono,
                fontSize: 14,
                fontWeight: 700,
                color: S.textPrimary,
                letterSpacing: "0.08em",
              }}
            >
              ◉ ORDR COMMAND CENTER
            </span>
            <span
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: S.accentRed,
                background: "#FEE2E2",
                border: `1px solid ${S.accentRed}`,
                borderRadius: 3,
                padding: "1px 6px",
              }}
            >
              SUPERUSER
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <LiveClock />
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontFamily: S.fontMono,
                fontSize: 11,
                fontWeight: 700,
                color: "#059669",
                letterSpacing: "0.06em",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#059669",
                  display: "inline-block",
                  animation: "radar-pulse 2s ease-out infinite",
                }}
              />
              LIVE
            </span>
          </div>
        </div>

        {/* Sub-nav */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            padding: "0 24px",
            borderTop: `1px solid ${S.rim}`,
            height: 40,
            overflowX: "auto",
          }}
        >
          {NAV_TABS.map((tab) => {
            const isActive = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="admin-nav-tab"
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: "0.06em",
                  color: isActive ? S.accentRed : S.textSecondary,
                  padding: "4px 12px",
                  borderRadius: 4,
                  background: isActive ? "#FEE2E2" : "transparent",
                  border: isActive ? `1px solid rgba(220,38,38,0.25)` : "1px solid transparent",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {tab.label.toUpperCase()}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Main content with red left border accent */}
      <main
        style={{
          flex: 1,
          borderLeft: `3px solid ${S.accentRed}`,
          minHeight: 0,
        }}
      >
        {children}
      </main>
    </div>
  );
}
