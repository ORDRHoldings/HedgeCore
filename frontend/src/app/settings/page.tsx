"use client";

/**
 * settings/page.tsx — ORDR Terminal Settings Hub (thin shell)
 *
 * Decomposed into:
 *   types/settings.ts           — types, constants, design tokens
 *   hooks/useSettings.ts        — state + server/localStorage sync
 *   hooks/useGovernedSave.ts    — diff modal + server PATCH for governed tabs
 *   hooks/useSettingsPermissions.ts — RBAC checks
 *   components/SettingsShell.tsx    — 44px header bar
 *   components/SettingsTabBar.tsx   — 3-group tab strip
 *   components/DiffPreviewModal.tsx — before/after confirmation
 *   components/ChangeLogDrawer.tsx  — session change log
 *   components/tabs/             — 10 tab files
 */

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter, useSearchParams } from "next/navigation";
import HelpPanelV2 from "@/components/help/HelpPanelV2";
import { SETTINGS_HELP } from "@/lib/help";

import { S, DEFAULT_SETTINGS, STORAGE_KEY, HASH_MAP, SettingsTab, AllSettings, Toast, ChangeEntry } from "./types/settings";

// Canonical param value for each tab (reverse of HASH_MAP)
const TAB_TO_PARAM: Partial<Record<SettingsTab, string>> = {
  APPEARANCE:    "appearance",
  POLICY_LIMITS: "policy_limits",
  EXECUTION:     "execution",
  API_CONFIG:    "api_config",
  NOTIFICATIONS: "notifications",
  SECURITY:      "security",
  USERS_ROLES:   "users_roles",
  API_KEY_MGMT:  "api_key_mgmt",
  ORGANISATION:  "organisation",
  AUDIT_TRAIL:   "audit_trail",
  REGULATORY:    "regulatory",
};
import { useSettings } from "./hooks/useSettings";
import { useGovernedSave } from "./hooks/useGovernedSave";

import SettingsShell   from "./components/SettingsShell";
import SettingsTabBar  from "./components/SettingsTabBar";
import DiffPreviewModal from "./components/DiffPreviewModal";
import ChangeLogDrawer  from "./components/ChangeLogDrawer";

import GeneralTab       from "./components/tabs/GeneralTab";
import PolicyLimitsTab  from "./components/tabs/PolicyLimitsTab";
import ExecutionTab     from "./components/tabs/ExecutionTab";
import ApiConfigTab     from "./components/tabs/ApiConfigTab";
import NotificationsTab from "./components/tabs/NotificationsTab";
import SecurityTab      from "./components/tabs/SecurityTab";
import UsersRolesTab    from "./components/tabs/UsersRolesTab";
import ApiKeyManagementTab from "./components/tabs/ApiKeyManagementTab";
import OrganisationTab  from "./components/tabs/OrganisationTab";
import AuditTrailTab    from "./components/tabs/AuditTrailTab";
import AppearanceTab    from "./components/tabs/AppearanceTab";
import RegulatorySettingsTab from "./components/tabs/RegulatorySettingsTab";

import { PageShell } from "@/components/layout/PageShell";
import { Settings } from "lucide-react";

import { useTheme } from "@/lib/theme/ThemeProvider";

// ── Hydration-safe timestamp hook ─────────────────────────────────────────────
function useRenderTs(): string {
  const [ts, setTs] = useState("");
  useEffect(() => {
    setTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return ts;
}

// ── Toast stack ───────────────────────────────────────────────────────────────
function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.kind === "success" ? "#064E3B" : "#450A0A",
          border: `1px solid ${t.kind === "success" ? S.pass : S.fail}`,
          borderLeft: `3px solid ${t.kind === "success" ? S.pass : S.fail}`,
          borderRadius: 3, padding: "8px 14px", minWidth: 260,
          fontFamily: S.fontUI, fontSize: 12, color: S.primary,
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: t.kind === "success" ? S.pass : S.fail, marginRight: 8 }}>
            {t.kind === "success" ? "✓" : "✗"}
          </span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function SettingsPageInner() {
  const { isAuthenticated, isLoading: authLoading, user, token } = useAuth();
  const { appearance, setAppearance } = useTheme();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const renderTs     = useRenderTs();

  const [toasts,     setToasts]     = useState<Toast[]>([]);
  const [changeLog,  setChangeLog]  = useState<ChangeEntry[]>([]);
  const [showLog,    setShowLog]    = useState(false);

  // Derive activeTab directly from URL — no state, no effect that can misfire.
  // searchParams.get() is stable within a render even if the object reference changes.
  const tabParam  = searchParams.get("tab") ?? "";
  const activeTab: SettingsTab =
    tabParam && HASH_MAP[tabParam] ? HASH_MAP[tabParam] : "GENERAL";

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/auth/login");
  }, [authLoading, isAuthenticated, router]);

  // Tab navigation — updates URL; searchParams re-derives activeTab on next render
  const handleTabChange = useCallback((tab: SettingsTab) => {
    const param = TAB_TO_PARAM[tab];
    router.replace(param ? `/settings?tab=${param}` : "/settings", { scroll: false });
  }, [router]);

  const addToast = useCallback((kind: Toast["kind"], msg: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(p => [...p, { id, kind, msg }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  const addChangeLog = useCallback((tab: string, msg: string) => {
    const entry: ChangeEntry = {
      ts:  new Date().toISOString().replace("T", " ").slice(0, 19),
      tab, msg,
    };
    setChangeLog(p => [entry, ...p].slice(0, 50));
  }, []);

  // Settings state
  const {
    settings, setSettings, isDirty, setDirty, saving, setSaving,
    serverMeta, setServerMeta, prevSettings,
  } = useSettings();

  // Governed save
  const {
    showDiffModal, diffFields, handleSave, handleConfirmGoverned, cancelDiff,
  } = useGovernedSave({
    settings, activeTab, prevSettings, token: token ?? null,
    userEmail: user?.email, setSaving, setSettings, setDirty,
    setServerMeta, addToast, addChangeLog,
  });

  const handleReset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    setDirty(true);
  }, [setSettings, setDirty]);

  if (authLoading) {
    return (
      <div style={{ background: S.bgDeep, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.1em" }}>AUTHENTICATING…</span>
      </div>
    );
  }

  // Tab content router
  const renderTab = () => {
    const tok = token ?? "";
    switch (activeTab) {
      case "GENERAL":       return <GeneralTab       s={settings.org}           set={org =>           setSettings(p => ({ ...p, org }))} />;
      case "APPEARANCE":    return <AppearanceTab    appearance={appearance}     onChange={setAppearance} />;
      case "POLICY_LIMITS": return <PolicyLimitsTab  s={settings.policy}        set={policy =>        setSettings(p => ({ ...p, policy }))}
                                     lastModifiedAt={serverMeta.last_modified_at} lastModifiedBy={serverMeta.last_modified_by} />;
      case "EXECUTION":     return <ExecutionTab     s={settings.execution}     set={execution =>     setSettings(p => ({ ...p, execution }))}
                                     lastModifiedAt={serverMeta.last_modified_at} lastModifiedBy={serverMeta.last_modified_by} />;
      case "API_CONFIG":    return <ApiConfigTab     s={settings.api_keys}      set={api_keys =>      setSettings(p => ({ ...p, api_keys }))} />;
      case "NOTIFICATIONS": return <NotificationsTab s={settings.notifications} set={notifications => setSettings(p => ({ ...p, notifications }))} token={tok} />;
      case "SECURITY":      return <SecurityTab         token={tok} />;
      case "USERS_ROLES":   return <UsersRolesTab       token={tok} />;
      case "API_KEY_MGMT":  return <ApiKeyManagementTab token={tok} />;
      case "ORGANISATION":  return <OrganisationTab          token={tok} />;
      case "AUDIT_TRAIL":   return <AuditTrailTab             token={tok} />;
      case "REGULATORY":    return <RegulatorySettingsTab     token={tok} />;
      default:              return null;
    }
  };

  return (
    <div style={{ background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI, display: "flex" }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>

        <DiffPreviewModal
          open={showDiffModal}
          fields={diffFields}
          onConfirm={handleConfirmGoverned}
          onCancel={cancelDiff}
          saving={saving}
        />
        <ToastStack toasts={toasts} />

        <SettingsShell
          isDirty={isDirty}
          saving={saving}
          changeLogLen={changeLog.length}
          lastSaved={settings.last_saved}
          onSave={() => handleSave(() => {})}
          onReset={handleReset}
          onToggleLog={() => setShowLog(p => !p)}
        />

        <SettingsTabBar activeTab={activeTab} onTabChange={handleTabChange} />

        {/* Content */}
        <div style={{ maxWidth: activeTab === "APPEARANCE" ? 1200 : 900, margin: "0 auto", padding: "24px 24px 60px", width: "100%", transition: "max-width 200ms" }}>
          {showLog && (
            <ChangeLogDrawer entries={changeLog} onClose={() => setShowLog(false)} />
          )}
          <div style={{ background: activeTab === "APPEARANCE" ? "transparent" : S.bgPanel, border: activeTab === "APPEARANCE" ? "none" : `1px solid ${S.rim}`, borderRadius: 3, padding: activeTab === "APPEARANCE" ? 0 : "24px 28px" }}>
            {renderTab()}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          height: 32, display: "flex", alignItems: "center", justifyContent: "center",
          borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
        }}>
          <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.05em" }}>
            {renderTs} · ORDR Settings · {user?.email ?? ""}
          </span>
        </div>

      </div>
      <HelpPanelV2 module={SETTINGS_HELP} storageKey="settings" />
    </div>
  );
}

export default function SettingsPage() {
  return (

    <PageShell icon={Settings} title="Settings" breadcrumb={["Dashboard", "Settings"]} noPadding>
    <Suspense fallback={
      <div style={{ background: "var(--bg-deep,#0D0F11)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: 12, color: "var(--text-tertiary,#6B7280)", letterSpacing: "0.1em" }}>LOADING…</span>
      </div>
    }>
      <SettingsPageInner />
    </Suspense>
  
    </PageShell>
    );
}
