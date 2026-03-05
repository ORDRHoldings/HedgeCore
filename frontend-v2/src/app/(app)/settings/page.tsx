"use client";
/**
 * /settings — Tier-aware user and company settings.
 */

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { meetsRequirement, TIER_LABELS, TIER_UPGRADE_LABELS } from "@/lib/tier/features";
import type { PlanTier, AdminUser } from "@/types/api";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontHeading: "var(--font-heading,'Manrope',sans-serif)",
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

interface CompanySettings {
  name: string;
  base_currency: string;
  governance_mode: string;
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

interface MfaStatus {
  enabled: boolean;
  method: string | null;
  recovery_codes_remaining: number;
}

// ── Field helpers ────────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 700,
          color: S.textTertiary,
          display: "block",
          marginBottom: 6,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        fontFamily: S.fontUI,
        fontSize: 14,
        color: S.textPrimary,
        background: disabled ? S.bgSub : S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 6,
        padding: "9px 14px",
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        cursor: disabled ? "not-allowed" : "text",
      }}
    />
  );
}

function SaveButton({
  label,
  isPending,
  onClick,
}: {
  label?: string;
  isPending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isPending}
      style={{
        fontFamily: S.fontMono,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.05em",
        background: isPending ? S.bgSub : S.accentCyan,
        color: isPending ? S.textTertiary : "#fff",
        border: "none",
        padding: "9px 22px",
        borderRadius: 6,
        cursor: isPending ? "not-allowed" : "pointer",
        alignSelf: "flex-start",
      }}
    >
      {isPending ? "Saving…" : label ?? "Save"}
    </button>
  );
}

function Banner({
  type,
  message,
}: {
  type: "success" | "error";
  message: string;
}) {
  const ok = type === "success";
  return (
    <div
      style={{
        background: ok ? "#D1FAE5" : "#FEF2F2",
        border: `1px solid ${ok ? "#6EE7B7" : "#FECACA"}`,
        borderRadius: 6,
        padding: "9px 14px",
        fontFamily: S.fontUI,
        fontSize: 13,
        color: ok ? S.statusPass : S.accentRed,
      }}
    >
      {message}
    </div>
  );
}

// ── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, setUser } = useAuthStore();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [jobTitle, setJobTitle] = useState(user?.job_title ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/v1/admin/users/${user?.id}`, {
        full_name: fullName,
        job_title: jobTitle,
      }),
    onSuccess: (data) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setUser(data as any);
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e: Error) => {
      setError(e.message);
      setSaved(false);
    },
  });

  return (
    <div style={{ maxWidth: 520 }}>
      <SectionHeading>Profile Information</SectionHeading>
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <Field label="Email">
          <TextInput value={user?.email ?? ""} disabled />
          <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.textTertiary, marginTop: 4 }}>
            Email address cannot be changed.
          </div>
        </Field>

        <Field label="Full Name">
          <TextInput value={fullName} onChange={setFullName} placeholder="Your full name" />
        </Field>

        <Field label="Job Title">
          <TextInput value={jobTitle} onChange={setJobTitle} placeholder="e.g. Treasury Manager" />
        </Field>

        {error && <Banner type="error" message={error} />}
        {saved && <Banner type="success" message="Profile saved." />}

        <SaveButton isPending={saveMutation.isPending} onClick={() => saveMutation.mutate()} label="Save Profile" />
      </div>
    </div>
  );
}

// ── Company Tab ──────────────────────────────────────────────────────────────

function CompanyTab() {
  const { token } = useAuthStore();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("");
  const [govMode, setGovMode] = useState("");
  const [synced, setSynced] = useState(false);

  const settingsQ = useQuery<CompanySettings>({
    queryKey: ["company-settings"],
    queryFn: () => api.get<CompanySettings>("/v1/company/settings"),
    enabled: !!token,
  });

  if (settingsQ.data && !synced) {
    setName(settingsQ.data.name ?? "");
    setBaseCurrency(settingsQ.data.base_currency ?? "");
    setGovMode(settingsQ.data.governance_mode ?? "");
    setSynced(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch("/v1/company/settings", {
        name,
        base_currency: baseCurrency,
        governance_mode: govMode,
      }),
    onSuccess: () => {
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e: Error) => {
      setError(e.message);
      setSaved(false);
    },
  });

  if (settingsQ.isLoading) {
    return <LoadingText>Loading company settings…</LoadingText>;
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <SectionHeading>Company Settings</SectionHeading>
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <Field label="Company Name">
          <TextInput value={name} onChange={setName} placeholder="Acme Corp" />
        </Field>

        <Field label="Base Currency">
          <TextInput value={baseCurrency} onChange={setBaseCurrency} placeholder="USD" />
        </Field>

        <Field label="Governance Mode">
          <select
            value={govMode}
            onChange={(e) => setGovMode(e.target.value)}
            style={{
              fontFamily: S.fontUI,
              fontSize: 14,
              color: S.textPrimary,
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 6,
              padding: "9px 14px",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
              cursor: "pointer",
            }}
          >
            <option value="solo">Solo (single approver)</option>
            <option value="team">Team (4-eyes required)</option>
            <option value="committee">Committee (multi-approver)</option>
          </select>
        </Field>

        {error && <Banner type="error" message={error} />}
        {saved && <Banner type="success" message="Settings saved." />}

        <SaveButton isPending={saveMutation.isPending} onClick={() => saveMutation.mutate()} label="Save Settings" />
      </div>
    </div>
  );
}

// ── Team Tab ─────────────────────────────────────────────────────────────────

function TeamTab() {
  const { token } = useAuthStore();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSent, setInviteSent] = useState(false);

  const usersQ = useQuery<AdminUser[]>({
    queryKey: ["admin-users"],
    queryFn: () => api.get<AdminUser[]>("/v1/admin/users"),
    enabled: !!token,
  });

  const users: AdminUser[] = usersQ.data ?? [];

  const handleInvite = () => {
    if (!inviteEmail) return;
    setInviteSent(true);
    setInviteEmail("");
    setTimeout(() => setInviteSent(false), 3000);
  };

  return (
    <div>
      <SectionHeading>Team Members</SectionHeading>

      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          padding: "20px 24px",
          marginBottom: 20,
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <Field label="Invite by Email">
            <TextInput
              type="email"
              value={inviteEmail}
              onChange={setInviteEmail}
              placeholder="colleague@company.com"
            />
          </Field>
        </div>
        <button
          onClick={handleInvite}
          disabled={!inviteEmail}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.05em",
            background: inviteEmail ? S.accentCyan : S.bgSub,
            color: inviteEmail ? "#fff" : S.textTertiary,
            border: "none",
            padding: "9px 20px",
            borderRadius: 6,
            cursor: inviteEmail ? "pointer" : "not-allowed",
            whiteSpace: "nowrap",
            marginBottom: 0,
          }}
        >
          Send Invite
        </button>
      </div>

      {inviteSent && (
        <div style={{ marginBottom: 16 }}>
          <Banner type="success" message="Invite sent (stub — no email dispatched in demo)." />
        </div>
      )}

      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {usersQ.isLoading ? (
          <LoadingText>Loading team…</LoadingText>
        ) : users.length === 0 ? (
          <div style={{ padding: "28px", textAlign: "center", fontFamily: S.fontUI, fontSize: 13, color: S.textTertiary }}>
            No team members found.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead>
                <tr style={{ background: S.bgSub }}>
                  {["Name / Email", "Roles", "MFA", "Last Login", "Status"].map((h) => (
                    <th
                      key={h}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: S.textTertiary,
                        textTransform: "uppercase",
                        textAlign: "left",
                        padding: "10px 16px",
                        borderBottom: `1px solid ${S.rim}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? `1px solid ${S.rim}` : "none" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 600, color: S.textPrimary }}>
                        {u.full_name ?? u.email}
                      </div>
                      {u.full_name && (
                        <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginTop: 2 }}>
                          {u.email}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {(u.roles ?? []).slice(0, 2).map((r) => (
                          <span key={r} style={{ fontFamily: S.fontMono, fontSize: 10, background: "#EFF6FF", color: S.accentCyan, padding: "2px 7px", borderRadius: 3 }}>
                            {r}
                          </span>
                        ))}
                        {u.is_superuser && (
                          <span style={{ fontFamily: S.fontMono, fontSize: 10, background: "#FEF3C7", color: S.accentAmber, padding: "2px 7px", borderRadius: 3 }}>
                            SUPER
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          fontWeight: 700,
                          background: u.mfa_enabled ? "#D1FAE5" : "#F1F5F9",
                          color: u.mfa_enabled ? S.statusPass : S.textTertiary,
                          padding: "2px 8px",
                          borderRadius: 3,
                        }}
                      >
                        {u.mfa_enabled ? "ON" : "OFF"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                        {u.last_login
                          ? new Date(u.last_login).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : "—"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          fontWeight: 700,
                          background: u.is_active ? "#D1FAE5" : "#FEF2F2",
                          color: u.is_active ? S.statusPass : S.accentRed,
                          padding: "2px 8px",
                          borderRadius: 3,
                        }}
                      >
                        {u.is_active ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Security Tab ─────────────────────────────────────────────────────────────

function SecurityTab() {
  const { token } = useAuthStore();
  const [setupStep, setSetupStep] = useState<"idle" | "qr" | "done">("idle");
  const [totpCode, setTotpCode] = useState("");
  const [qrData, setQrData] = useState<{ qr_url: string; secret: string } | null>(null);

  const mfaQ = useQuery<MfaStatus>({
    queryKey: ["mfa-status"],
    queryFn: () => api.get<MfaStatus>("/v1/mfa/status"),
    enabled: !!token,
  });

  const mfaStatus = mfaQ.data;

  const initMutation = useMutation({
    mutationFn: () => api.post<{ qr_url: string; secret: string }>("/v1/mfa/setup"),
    onSuccess: (data) => {
      setQrData(data);
      setSetupStep("qr");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (code: string) => api.post("/v1/mfa/verify", { code }),
    onSuccess: () => {
      setSetupStep("done");
      mfaQ.refetch();
    },
  });

  return (
    <div style={{ maxWidth: 520 }}>
      <SectionHeading>Multi-Factor Authentication</SectionHeading>
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {mfaQ.isLoading ? (
          <LoadingText>Loading MFA status…</LoadingText>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div>
                <div style={{ fontFamily: S.fontHeading, fontSize: 15, fontWeight: 700, color: S.textPrimary, marginBottom: 3 }}>
                  TOTP Authenticator
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary }}>
                  Use Google Authenticator or Authy for secure 2-factor login.
                </div>
              </div>
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  background: mfaStatus?.enabled ? "#D1FAE5" : "#F1F5F9",
                  color: mfaStatus?.enabled ? S.statusPass : S.textTertiary,
                  padding: "3px 10px",
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              >
                {mfaStatus?.enabled ? "ENABLED" : "DISABLED"}
              </span>
            </div>

            {setupStep === "done" && <Banner type="success" message="MFA successfully enabled." />}

            {setupStep === "idle" && !mfaStatus?.enabled && (
              <button
                onClick={() => initMutation.mutate()}
                disabled={initMutation.isPending}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  background: initMutation.isPending ? S.bgSub : S.accentCyan,
                  color: initMutation.isPending ? S.textTertiary : "#fff",
                  border: "none",
                  padding: "9px 22px",
                  borderRadius: 6,
                  cursor: initMutation.isPending ? "not-allowed" : "pointer",
                  alignSelf: "flex-start",
                }}
              >
                {initMutation.isPending ? "Loading…" : "Set Up MFA"}
              </button>
            )}

            {setupStep === "qr" && qrData && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary }}>
                  Scan this QR code with your authenticator app, then enter the 6-digit code.
                </div>
                <div
                  style={{
                    background: S.bgSub,
                    border: `1px solid ${S.rim}`,
                    borderRadius: 8,
                    padding: "16px",
                    textAlign: "center",
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    color: S.textTertiary,
                  }}
                >
                  [QR Code — TOTP secret: {qrData.secret}]
                </div>
                <Field label="Verification Code">
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="text"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 18,
                        letterSpacing: "0.2em",
                        color: S.textPrimary,
                        background: S.bgPanel,
                        border: `1px solid ${S.rim}`,
                        borderRadius: 6,
                        padding: "9px 14px",
                        outline: "none",
                        flex: 1,
                        textAlign: "center",
                      }}
                    />
                    <button
                      onClick={() => verifyMutation.mutate(totpCode)}
                      disabled={totpCode.length !== 6 || verifyMutation.isPending}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 700,
                        background: totpCode.length === 6 ? S.statusPass : S.bgSub,
                        color: totpCode.length === 6 ? "#fff" : S.textTertiary,
                        border: "none",
                        padding: "9px 18px",
                        borderRadius: 6,
                        cursor: totpCode.length === 6 ? "pointer" : "not-allowed",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      Verify
                    </button>
                  </div>
                  {verifyMutation.isError && (
                    <div style={{ marginTop: 6, fontFamily: S.fontUI, fontSize: 12, color: S.accentRed }}>
                      {(verifyMutation.error as Error)?.message ?? "Verification failed."}
                    </div>
                  )}
                </Field>
              </div>
            )}

            {mfaStatus?.enabled && (
              <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary }}>
                Recovery codes remaining: <strong style={{ color: S.textPrimary }}>{mfaStatus.recovery_codes_remaining}</strong>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── API Keys Tab ─────────────────────────────────────────────────────────────

function ApiKeysTab() {
  const { token } = useAuthStore();
  const qc = useQueryClient();
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const keysQ = useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: () => api.get<ApiKey[]>("/admin/api-keys"),
    enabled: !!token,
  });

  const keys: ApiKey[] = keysQ.data ?? [];

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      api.post<{ key: string; id: string }>("/admin/api-keys", { name }),
    onSuccess: (data) => {
      setCreatedKey(data.key);
      setNewKeyName("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  return (
    <div>
      <SectionHeading>API Keys</SectionHeading>

      <div
        style={{
          background: "#FEF3C7",
          border: "1px solid #FCD34D",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 16,
          fontFamily: S.fontUI,
          fontSize: 13,
          color: "#92400E",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 15, flexShrink: 0 }}>⚠️</span>
        API keys grant full programmatic access. Store securely and never commit to version control.
      </div>

      {createdKey && (
        <div
          style={{
            background: "#D1FAE5",
            border: "1px solid #6EE7B7",
            borderRadius: 8,
            padding: "16px",
            marginBottom: 16,
          }}
        >
          <div style={{ fontFamily: S.fontHeading, fontSize: 13, fontWeight: 700, color: S.statusPass, marginBottom: 6 }}>
            New key created — copy it now. It will not be shown again.
          </div>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              letterSpacing: "0.04em",
              color: S.textPrimary,
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 6,
              padding: "10px 14px",
              wordBreak: "break-all",
            }}
          >
            {createdKey}
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            style={{
              marginTop: 10,
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              background: "none",
              border: `1px solid ${S.soft}`,
              borderRadius: 5,
              padding: "5px 12px",
              cursor: "pointer",
              color: S.textSecondary,
            }}
          >
            I&apos;ve saved it
          </button>
        </div>
      )}

      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          padding: "20px 24px",
          marginBottom: 20,
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 180 }}>
          <Field label="Key Name">
            <TextInput
              value={newKeyName}
              onChange={setNewKeyName}
              placeholder="e.g. ci-pipeline"
            />
          </Field>
        </div>
        <button
          onClick={() => createMutation.mutate(newKeyName)}
          disabled={!newKeyName || createMutation.isPending}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.05em",
            background: newKeyName ? S.accentCyan : S.bgSub,
            color: newKeyName ? "#fff" : S.textTertiary,
            border: "none",
            padding: "9px 20px",
            borderRadius: 6,
            cursor: newKeyName ? "pointer" : "not-allowed",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {createMutation.isPending ? "Creating…" : "Create Key"}
        </button>
      </div>

      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {keysQ.isLoading ? (
          <LoadingText>Loading API keys…</LoadingText>
        ) : keys.length === 0 ? (
          <div style={{ padding: "28px", textAlign: "center", fontFamily: S.fontUI, fontSize: 13, color: S.textTertiary }}>
            No API keys yet. Create one above.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: S.bgSub }}>
                {["Name", "Prefix", "Last Used", "Status"].map((h) => (
                  <th
                    key={h}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: S.textTertiary,
                      textTransform: "uppercase",
                      textAlign: "left",
                      padding: "10px 16px",
                      borderBottom: `1px solid ${S.rim}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k, i) => (
                <tr key={k.id} style={{ borderBottom: i < keys.length - 1 ? `1px solid ${S.rim}` : "none" }}>
                  <td style={{ padding: "12px 16px", fontFamily: S.fontUI, fontSize: 13, color: S.textPrimary, fontWeight: 600 }}>
                    {k.name}
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: S.fontMono, fontSize: 12, color: S.textSecondary }}>
                    {k.prefix}…
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                    {k.last_used_at
                      ? new Date(k.last_used_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "Never"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        fontWeight: 700,
                        background: k.is_active ? "#D1FAE5" : "#FEF2F2",
                        color: k.is_active ? S.statusPass : S.accentRed,
                        padding: "2px 8px",
                        borderRadius: 3,
                      }}
                    >
                      {k.is_active ? "ACTIVE" : "REVOKED"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Upgrade Section ──────────────────────────────────────────────────────────

function UpgradeSection({ currentTier }: { currentTier: PlanTier }) {
  if (currentTier === "enterprise") return null;

  const nextTier: PlanTier = currentTier === "lite" ? "smb" : "enterprise";
  const upgradeLabel = TIER_UPGRADE_LABELS[currentTier];
  const nextLabel = TIER_LABELS[nextTier];

  const featuresByTier: Record<string, string[]> = {
    lite: [
      "Unlimited FX positions",
      "60+ policy templates",
      "4-step execution wizard",
      "Team collaboration",
    ],
    smb: [
      "Enterprise-grade governance pipeline",
      "Tri-state workflow (Sandbox → Staging → Ledger)",
      "SHA-256 hash-chained audit trail",
      "Scenario Studio (Monte Carlo, VaR)",
      "MFA + programmatic API keys",
      "Committee approval packs",
    ],
    professional: [
      "Enterprise governance",
      "Tri-state pipeline",
      "SHA-256 audit chain",
      "Scenario Studio",
    ],
  };

  const features = featuresByTier[currentTier] ?? [];

  return (
    <div style={{ marginTop: 40, paddingTop: 28, borderTop: `1px solid ${S.rim}` }}>
      <SectionHeading>Upgrade Your Plan</SectionHeading>
      <div
        style={{
          background: "linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 100%)",
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          padding: "24px",
          display: "flex",
          alignItems: "center",
          gap: 28,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontFamily: S.fontHeading, fontSize: 17, fontWeight: 700, color: S.textPrimary, marginBottom: 12 }}>
            Unlock {nextLabel}
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 7 }}>
            {features.map((f) => (
              <li
                key={f}
                style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary, display: "flex", alignItems: "flex-start", gap: 8 }}
              >
                <span style={{ color: S.statusPass, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <a
          href="mailto:sales@ordr.ai?subject=Upgrade inquiry"
          style={{
            fontFamily: S.fontMono,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.05em",
            background: S.accentCyan,
            color: "#fff",
            padding: "11px 28px",
            borderRadius: 6,
            textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {upgradeLabel || `Upgrade to ${nextLabel} →`}
        </a>
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  );
}

function LoadingText({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary, padding: "20px 24px" }}>
      {children}
    </div>
  );
}

// ── Main settings inner (needs useSearchParams) ──────────────────────────────

type TabId = "profile" | "company" | "team" | "security" | "api-keys";

function SettingsInner() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const showUpgrade = searchParams.get("upgrade") === "true";

  const isSmb =
    user?.is_superuser || meetsRequirement(user?.plan_tier ?? "lite", "smb");
  const isEnterprise =
    user?.is_superuser || meetsRequirement(user?.plan_tier ?? "lite", "enterprise");

  const allTabs: { id: TabId; label: string; show: boolean }[] = [
    { id: "profile", label: "Profile", show: true },
    { id: "company", label: "Company", show: isSmb },
    { id: "team", label: "Team", show: isSmb },
    { id: "security", label: "Security", show: isEnterprise },
    { id: "api-keys", label: "API Keys", show: isEnterprise },
  ];
  const tabs = allTabs.filter((t) => t.show) as { id: TabId; label: string; show: boolean }[];

  const [activeTab, setActiveTab] = useState<TabId>("profile");

  return (
    <div style={{ fontFamily: S.fontUI }}>
      <PageHeader
        label="ACCOUNT"
        title="Settings"
        subtitle="Manage your profile, team, and integrations"
      />

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: `1px solid ${S.rim}`,
          marginBottom: 28,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.04em",
              background: "none",
              border: "none",
              borderBottom:
                activeTab === tab.id
                  ? `2px solid ${S.accentCyan}`
                  : "2px solid transparent",
              color: activeTab === tab.id ? S.accentCyan : S.textTertiary,
              padding: "10px 20px",
              cursor: "pointer",
              marginBottom: -1,
              transition: "color 0.1s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab */}
      {activeTab === "profile" && <ProfileTab />}
      {activeTab === "company" && <CompanyTab />}
      {activeTab === "team" && <TeamTab />}
      {activeTab === "security" && <SecurityTab />}
      {activeTab === "api-keys" && <ApiKeysTab />}

      {/* Upgrade section — always show for non-enterprise, auto-expand if ?upgrade=true */}
      <div id="upgrade-section">
        <UpgradeSection currentTier={user?.plan_tier ?? "lite"} />
      </div>

      {/* Auto-scroll to upgrade if query param present */}
      {showUpgrade && (
        <style>{`
          #upgrade-section { animation: highlight 1.2s ease; }
          @keyframes highlight {
            0% { box-shadow: 0 0 0 3px rgba(28,98,242,0.3); border-radius: 10px; }
            100% { box-shadow: none; }
          }
        `}</style>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsInner />
    </Suspense>
  );
}
