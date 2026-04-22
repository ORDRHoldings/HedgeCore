"use client";

/**
 * /policies — Unified Policy Engine
 *
 * Tabbed layout merging 4 former policy pages:
 *   LIBRARY    — System preset policies (was /policies)
 *   SAVED      — User-created & branch policies (was /saved-policies)
 *   ASSIGN     — Policy assignment to positions (was /policy-desk)
 *   ANALYTICS  — Active policy dashboard & governance (was /policy-dashboard)
 */

import { Suspense, lazy, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { T } from "@/lib/design/tokens";

import { PageShell } from "@/components/layout/PageShell";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

// ── Lazy-loaded tab components ──────────────────────────────────────────────
const PolicyLibraryTab  = lazy(() => import("@/components/policy/PolicyLibraryTab"));
const SavedPoliciesTab  = lazy(() => import("@/components/policy/SavedPoliciesTab"));
const PolicyAssignTab   = lazy(() => import("@/components/policy/PolicyAssignTab"));
const PolicyAnalyticsTab = lazy(() => import("@/components/policy/PolicyAnalyticsTab"));

// ── Tab definitions ─────────────────────────────────────────────────────────
const TABS = [
  { key: "library",   label: "LIBRARY" },
  { key: "saved",     label: "SAVED" },
  { key: "assign",    label: "ASSIGN" },
  { key: "analytics", label: "ANALYTICS" },
] as const;

type TabKey = typeof TABS[number]["key"];

function isValidTab(v: string | null): v is TabKey {
  return v === "library" || v === "saved" || v === "assign" || v === "analytics";
}

// ── Loading fallback ────────────────────────────────────────────────────────
function TabLoading() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "80px 0",
      fontFamily: T.fontMono,
      fontSize: 12,
      letterSpacing: "0.08em",
      color: T.secondary,
    }}>
      LOADING...
    </div>
  );
}

// ── Inner component (reads useSearchParams) ─────────────────────────────────
function PoliciesPageInner() {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawTab = searchParams.get("tab");
  const activeTab: TabKey = isValidTab(rawTab) ? rawTab : "library";

  // Optimistic local state for instant tab highlight
  const [localTab, setLocalTab] = useState<TabKey>(activeTab);

  // Keep localTab in sync when URL changes (back/forward nav)
  if (activeTab !== localTab && rawTab !== null) {
    // Only sync if URL actually drove the change
    if (isValidTab(rawTab) && rawTab !== localTab) {
      setLocalTab(rawTab);
    }
  }

  const handleTabChange = useCallback((tab: TabKey) => {
    setLocalTab(tab);
    router.push(`/policies?tab=${tab}`, { scroll: false });
  }, [router]);

  const currentTab = localTab;

  return (
    <div style={{ minHeight: "100vh", background: T.bgDeep }}>
      {/* ── Page header ── */}
      <header style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: isMobile ? "14px 12px" : "14px 24px",
        borderBottom: `1px solid ${T.rim}`,
        background: T.bgPanel,
      }}>
        <Shield size={18} style={{ color: T.accent, flexShrink: 0 }} />
        <div>
          <div style={{
            fontFamily: T.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: T.primary,
          }}>
            POLICY ENGINE
          </div>
          <div style={{
            fontFamily: T.fontMono,
            fontSize: 12,
            color: T.tertiary,
            letterSpacing: "0.04em",
            marginTop: 1,
          }}>
            Manage, assign, and govern FX hedge policies
          </div>
        </div>
      </header>

      {/* ── Tab bar ── */}
      <nav style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        padding: isMobile ? "0 12px" : "0 24px",
        background: T.bgPanel,
        borderBottom: `1px solid ${T.rim}`,
        height: isMobile ? "auto" : 38,
        flexWrap: isMobile ? "wrap" : "nowrap",
      }}>
        {TABS.map(({ key, label }) => {
          const isActive = currentTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleTabChange(key)}
              style={{
                fontFamily: T.fontMono,
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: "0.08em",
                color: isActive ? T.primary : T.tertiary,
                background: "transparent",
                border: "none",
                borderBottom: isActive ? `2px solid ${T.accent}` : "2px solid transparent",
                padding: "0 16px",
                cursor: "pointer",
                transition: "color 0.12s, border-color 0.12s",
              }}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {/* ── Tab content ── */}
      <Suspense fallback={<TabLoading />}>
        {currentTab === "library"   && <PolicyLibraryTab />}
        {currentTab === "saved"     && <SavedPoliciesTab />}
        {currentTab === "assign"    && <PolicyAssignTab />}
        {currentTab === "analytics" && <PolicyAnalyticsTab />}
      </Suspense>
    </div>
  );
}

// ── Page export (Suspense boundary for useSearchParams) ─────────────────────
export default function PoliciesPage() {
  return (
    <PageShell icon={Shield} title="Policies" breadcrumb={["Dashboard","Policies"]}>

    <Suspense fallback={<TabLoading />}>
      <PoliciesPageInner />
    </Suspense>
  
    </PageShell>
  );
}
