"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import TierGateClient from "@/components/tier/TierGateClient";
import type { PolicyTemplate, PolicyInstance } from "@/types/api";

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

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ActivePolicyPanel({
  instance,
  templates,
  onDeactivate,
  isDeactivating,
}: {
  instance: PolicyInstance | null;
  templates: PolicyTemplate[];
  onDeactivate: () => void;
  isDeactivating: boolean;
}) {
  if (!instance) {
    return (
      <div
        style={{
          background: S.bgPanel,
          border: `1px dashed ${S.soft}`,
          borderRadius: 10,
          padding: "28px 24px",
          textAlign: "center",
          marginBottom: 28,
        }}
      >
        <div style={{ fontFamily: S.fontHeading, fontWeight: 700, fontSize: 15, color: S.textPrimary, marginBottom: 6 }}>
          No active policy
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary }}>
          Activate a policy template below to enforce hedge rules on your positions.
        </div>
      </div>
    );
  }

  const tpl = templates.find((t) => t.id === instance.template_id);

  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.statusPass}`,
        borderRadius: 10,
        padding: "20px 24px",
        marginBottom: 28,
        display: "flex",
        alignItems: "center",
        gap: 20,
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: S.statusPass,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: S.fontHeading, fontWeight: 700, fontSize: 15, color: S.textPrimary, marginBottom: 3 }}>
          {tpl?.name ?? "Unknown Template"}
        </div>
        <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
          Active since {fmtDate(instance.active_since)}
        </div>
      </div>
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          background: "#D1FAE5",
          color: S.statusPass,
          padding: "3px 10px",
          borderRadius: 4,
        }}
      >
        ACTIVE
      </span>
      <button
        onClick={onDeactivate}
        disabled={isDeactivating}
        style={{
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.05em",
          background: "transparent",
          border: `1px solid ${S.soft}`,
          color: S.accentRed,
          padding: "7px 16px",
          borderRadius: 6,
          cursor: isDeactivating ? "not-allowed" : "pointer",
          opacity: isDeactivating ? 0.6 : 1,
          flexShrink: 0,
        }}
      >
        {isDeactivating ? "Deactivating…" : "Deactivate"}
      </button>
    </div>
  );
}

function TemplateCard({
  template,
  isActive,
  onActivate,
  isActivating,
}: {
  template: PolicyTemplate;
  isActive: boolean;
  onActivate: (id: string) => void;
  isActivating: boolean;
}) {
  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${isActive ? S.statusPass : S.rim}`,
        borderRadius: 10,
        padding: "20px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontFamily: S.fontHeading, fontWeight: 700, fontSize: 14, color: S.textPrimary }}>
              {template.name}
            </span>
            {template.is_system && (
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  background: "#EFF6FF",
                  color: S.accentCyan,
                  padding: "2px 7px",
                  borderRadius: 3,
                }}
              >
                SYSTEM
              </span>
            )}
          </div>
          {template.description && (
            <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSecondary, lineHeight: 1.5 }}>
              {template.description}
            </div>
          )}
        </div>
        {isActive && (
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.1em",
              background: "#D1FAE5",
              color: S.statusPass,
              padding: "3px 8px",
              borderRadius: 3,
              flexShrink: 0,
            }}
          >
            ACTIVE
          </span>
        )}
      </div>

      {template.currency_pairs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {template.currency_pairs.slice(0, 8).map((pair) => (
            <span
              key={pair}
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                fontWeight: 600,
                background: S.bgSub,
                color: S.textSecondary,
                border: `1px solid ${S.rim}`,
                padding: "2px 7px",
                borderRadius: 3,
              }}
            >
              {pair}
            </span>
          ))}
          {template.currency_pairs.length > 8 && (
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, padding: "2px 0" }}>
              +{template.currency_pairs.length - 8} more
            </span>
          )}
        </div>
      )}

      <button
        onClick={() => onActivate(template.id)}
        disabled={isActive || isActivating}
        style={{
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.05em",
          background: isActive ? S.bgSub : S.accentCyan,
          color: isActive ? S.textTertiary : "#fff",
          border: "none",
          padding: "8px 16px",
          borderRadius: 6,
          cursor: isActive || isActivating ? "not-allowed" : "pointer",
          opacity: isActivating ? 0.6 : 1,
          alignSelf: "flex-start",
        }}
      >
        {isActive ? "Current Policy" : isActivating ? "Activating…" : "Activate"}
      </button>
    </div>
  );
}

function PoliciesContent() {
  const { token } = useAuthStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showComingSoon, setShowComingSoon] = useState(false);

  const templatesQ = useQuery<PolicyTemplate[]>({
    queryKey: ["policy-templates"],
    queryFn: () => api.get<PolicyTemplate[]>("/v1/policies/templates"),
    enabled: !!token,
  });

  const activeQ = useQuery<PolicyInstance | null>({
    queryKey: ["policy-active"],
    queryFn: () => api.get<PolicyInstance | null>("/v1/policies/active"),
    enabled: !!token,
  });

  const activateMutation = useMutation({
    mutationFn: (template_id: string) =>
      api.post("/v1/policies/activate", { template_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policy-active"] });
      qc.invalidateQueries({ queryKey: ["policy-templates"] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => api.post("/v1/policies/deactivate"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policy-active"] });
    },
  });

  const templates: PolicyTemplate[] = templatesQ.data ?? [];
  const activeInstance = activeQ.data ?? null;

  const filtered = templates.filter((t) =>
    search
      ? t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.description ?? "").toLowerCase().includes(search.toLowerCase())
      : true
  );

  const isLoading = templatesQ.isLoading || activeQ.isLoading;

  const headerAction = (
    <div style={{ display: "flex", gap: 10 }}>
      <button
        onClick={() => setShowComingSoon(true)}
        style={{
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.05em",
          background: "transparent",
          border: `1px solid ${S.soft}`,
          color: S.textSecondary,
          padding: "8px 16px",
          borderRadius: 6,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 13 }}>✨</span>
        AI Policy Wizard
      </button>
    </div>
  );

  return (
    <div style={{ fontFamily: S.fontUI }}>
      <PageHeader
        label="GOVERNANCE"
        title="Policy Library"
        subtitle="Manage and activate hedge policy rules"
        action={headerAction}
      />

      {showComingSoon && (
        <div
          style={{
            background: "#EFF6FF",
            border: "1px solid #BFDBFE",
            borderRadius: 8,
            padding: "14px 20px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>✨</span>
            <div>
              <div style={{ fontFamily: S.fontHeading, fontWeight: 700, fontSize: 14, color: "#1E40AF", marginBottom: 2 }}>
                AI Policy Wizard — Coming Soon
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: "#3B82F6" }}>
                Describe your hedge objectives in plain English and get a custom policy recommendation.
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowComingSoon(false)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#93C5FD", fontSize: 18, padding: "0 4px" }}
          >
            ×
          </button>
        </div>
      )}

      {/* Active Policy Section */}
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: S.textTertiary,
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        Active Policy
      </div>

      {activeQ.isLoading ? (
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 10,
            padding: "24px",
            marginBottom: 28,
            color: S.textTertiary,
            fontFamily: S.fontMono,
            fontSize: 12,
          }}
        >
          Loading…
        </div>
      ) : (
        <ActivePolicyPanel
          instance={activeInstance}
          templates={templates}
          onDeactivate={() => deactivateMutation.mutate()}
          isDeactivating={deactivateMutation.isPending}
        />
      )}

      {/* Policy Library Section */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: S.textTertiary,
            textTransform: "uppercase",
          }}
        >
          Policy Library
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates…"
          style={{
            fontFamily: S.fontUI,
            fontSize: 13,
            color: S.textPrimary,
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 6,
            padding: "7px 14px",
            outline: "none",
            minWidth: 220,
          }}
        />
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
          Loading templates…
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div
          style={{
            background: S.bgPanel,
            border: `1px dashed ${S.soft}`,
            borderRadius: 10,
            padding: "40px",
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: S.fontHeading, fontWeight: 700, fontSize: 15, color: S.textPrimary, marginBottom: 6 }}>
            {search ? "No matching templates" : "No policy templates"}
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary }}>
            {search ? "Try a different search term." : "Policy templates will appear here once seeded."}
          </div>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              isActive={activeInstance?.template_id === t.id}
              onActivate={(id) => activateMutation.mutate(id)}
              isActivating={activateMutation.isPending && activateMutation.variables === t.id}
            />
          ))}
        </div>
      )}

      {activateMutation.isError && (
        <div
          style={{
            marginTop: 16,
            background: "#FEF2F2",
            border: `1px solid #FECACA`,
            borderRadius: 6,
            padding: "10px 16px",
            fontFamily: S.fontUI,
            fontSize: 13,
            color: S.accentRed,
          }}
        >
          {(activateMutation.error as Error)?.message ?? "Failed to activate policy."}
        </div>
      )}
    </div>
  );
}

export default function PoliciesPage() {
  return (
    <TierGateClient requiredTier="smb" featureName="policies">
      <PoliciesContent />
    </TierGateClient>
  );
}
