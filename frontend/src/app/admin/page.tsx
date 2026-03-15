"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { PageShell } from "@/components/layout/PageShell";
import { Shield } from "lucide-react";
import AdminTabBar, { type AdminTab } from "./components/AdminTabBar";
import dynamic from "next/dynamic";

// Lazy load each tab — keeps initial bundle small
const OperationsTab = dynamic(() => import("./components/tabs/OperationsTab"), { ssr: false });
const UsersTab      = dynamic(() => import("./components/tabs/UsersTab"),      { ssr: false });
const TenantsTab    = dynamic(() => import("./components/tabs/TenantsTab"),    { ssr: false });
const RolesTab      = dynamic(() => import("./components/tabs/RolesTab"),      { ssr: false });
const ApiKeysTab    = dynamic(() => import("./components/tabs/ApiKeysTab"),    { ssr: false });
const MetricsTab    = dynamic(() => import("./components/tabs/MetricsTab"),    { ssr: false });
const ConfigTab     = dynamic(() => import("./components/tabs/ConfigTab"),     { ssr: false });
const DevOpsTab     = dynamic(() => import("./components/tabs/DevOpsTab"),     { ssr: false });

const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  rim:       "var(--border-rim)",
  secondary: "var(--text-secondary)",
  red:       "var(--accent-red)",
  cyan:      "var(--accent-cyan)",
} as const;

function DeniedCard() {
  return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", padding: 48 }}>
      <div style={{
        background: S.bgPanel, border: `1px solid ${S.red}`,
        borderLeft: `4px solid ${S.red}`, padding: "28px 36px",
        maxWidth: 480,
      }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.red, marginBottom: 10 }}>
          ACCESS RESTRICTED
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.6 }}>
          This section is restricted to superusers. Contact your platform administrator if you believe this is an error.
        </div>
      </div>
    </div>
  );
}

function TabLoader() {
  return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontFamily: S.fontMono, fontSize: 11, color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>
        LOADING…
      </span>
    </div>
  );
}

function AdminContent() {
  const { token, user, isAuthenticated } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const activeTab = (searchParams?.get("tab") ?? "operations") as AdminTab;

  const handleTabChange = (tab: AdminTab) => {
    router.replace(`/admin?tab=${tab}`, { scroll: false });
  };

  if (!isAuthenticated || !token || !user) return <DeniedCard />;
  if (!user.is_superuser) return <DeniedCard />;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
      <AdminTabBar active={activeTab} onChange={handleTabChange} />
      <div style={{ flex: 1, overflowY: "auto", background: S.bgDeep }}>
        <Suspense fallback={<TabLoader />}>
          {activeTab === "operations" && <OperationsTab token={token} />}
          {activeTab === "users"      && <UsersTab      token={token} />}
          {activeTab === "tenants"    && <TenantsTab    token={token} />}
          {activeTab === "roles"      && <RolesTab      token={token} />}
          {activeTab === "apikeys"    && <ApiKeysTab    token={token} />}
          {activeTab === "metrics"    && <MetricsTab    token={token} />}
          {activeTab === "config"     && <ConfigTab     token={token} />}
          {activeTab === "devops"     && <DevOpsTab     token={token} />}
        </Suspense>
      </div>
    </div>
  );
}

export default function AdminHubPage() {
  return (
    <PageShell icon={Shield} title="Admin Hub" breadcrumb={["Platform", "Admin"]} noPadding>
      <Suspense fallback={<TabLoader />}>
        <AdminContent />
      </Suspense>
    </PageShell>
  );
}
