"use client";
import { useState, useEffect, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { S } from "../../types/settings";
import SectionHeader from "../shared/SectionHeader";

interface CompanyInfo {
  id:             string;
  name:           string;
  slug:           string;
  governance_mode: string;
  settings?:      Record<string, unknown>;
}

interface Branch {
  id:   string;
  name: string;
  code: string;
}

interface Department {
  id:        string;
  name:      string;
  branch_id: string;
}

interface Props { token: string; }

export default function OrganisationTab({ token }: Props) {
  const [company,  setCompany]  = useState<CompanyInfo | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [_depts,   _setDepts]   = useState<Department[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [editing,  setEditing]  = useState(false);
  const [_name,    setName]     = useState("");
  const [govMode,  setGovMode]  = useState<"solo" | "team">("team");
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  const showToast = (kind: "success" | "error", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Fetch company settings (already exists)
      const [compRes, branchRes] = await Promise.all([
        dashboardFetch("/v1/company/settings", token),
        dashboardFetch("/v1/admin/branches", token),
      ]);
      if (compRes.ok) {
        const d = await compRes.json() as CompanyInfo;
        setCompany(d);
        setName(d.name ?? "");
        setGovMode((d.governance_mode as "solo" | "team") ?? "team");
      }
      if (branchRes.ok) {
        const d = await branchRes.json() as { branches?: Branch[] } | Branch[];
        setBranches(Array.isArray(d) ? d : (d as { branches?: Branch[] }).branches ?? []);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load organisation data.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await dashboardFetch("/v1/company/settings", token, {
        method: "PATCH",
        body:   JSON.stringify({ governance_mode: govMode }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      showToast("success", "Governance mode updated.");
      setEditing(false);
      await load();
    } catch (e: unknown) {
      showToast("error", e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: "40px 0", textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.09em" }}>LOADING…</div>;

  if (error) return (
    <div style={{ background: `color-mix(in srgb, ${S.fail} 8%, transparent)`, border: `1px solid ${S.fail}`, borderLeft: `3px solid ${S.fail}`, borderRadius: 2, padding: "12px 16px", fontFamily: S.fontMono, fontSize: 12, color: S.fail }}>
      ✗ {error}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {toast && (
        <div style={{
          background: toast.kind === "success" ? "#064E3B" : "#450A0A",
          border: `1px solid ${toast.kind === "success" ? S.pass : S.fail}`,
          borderLeft: `3px solid ${toast.kind === "success" ? S.pass : S.fail}`,
          borderRadius: 2, padding: "8px 14px", fontFamily: S.fontUI, fontSize: 12, color: S.primary,
        }}>
          {toast.kind === "success" ? "✓" : "✗"} {toast.msg}
        </div>
      )}

      {/* Company identity */}
      <div>
        <SectionHeader label="Company Identity" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: S.secondary }}>COMPANY NAME</span>
            <span style={{ fontFamily: S.fontUI, fontSize: 13, color: S.primary }}>{company?.name ?? "—"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: S.secondary }}>SLUG</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan }}>{company?.slug ?? "—"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: S.secondary }}>COMPANY ID</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{company?.id ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Governance mode */}
      <div>
        <SectionHeader label="Governance Mode" />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>CURRENT:</span>
            <span style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.09em",
              color: company?.governance_mode === "team" ? S.cyan : S.amber,
              background: company?.governance_mode === "team"
                ? `color-mix(in srgb, ${S.cyan} 10%, transparent)`
                : `color-mix(in srgb, ${S.amber} 10%, transparent)`,
              border: `1px solid ${company?.governance_mode === "team" ? S.cyan : S.amber}40`,
              borderRadius: 2, padding: "2px 8px",
            }}>
              {(company?.governance_mode ?? "team").toUpperCase()}
            </span>
            {!editing && (
              <button onClick={() => setEditing(true)} style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                color: S.secondary, background: "transparent", border: `1px solid ${S.rim}`,
                borderRadius: 2, padding: "4px 10px", cursor: "pointer",
              }}>
                CHANGE
              </button>
            )}
          </div>

          {editing && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2, padding: "14px 16px" }}>
              {(["team", "solo"] as const).map(m => (
                <label key={m} style={{
                  display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                  background: govMode === m ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : "transparent",
                  border: `1px solid ${govMode === m ? S.cyan : S.soft}`,
                  borderRadius: 2, padding: "10px 14px",
                }}>
                  <input type="radio" name="gov" checked={govMode === m} onChange={() => setGovMode(m)} style={{ accentColor: S.cyan }} />
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: govMode === m ? S.cyan : S.primary }}>
                      {m === "team" ? "TEAM (4-EYES)" : "SOLO (SELF-APPROVE)"}
                    </div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
                      {m === "team"
                        ? "Proposer cannot approve their own submissions — requires a second approver."
                        : "Single-user approval flow — proposer may self-approve. Use for demo or single-operator setups."}
                    </div>
                  </div>
                </label>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleSave} disabled={saving} style={{
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em",
                  color: S.black, background: saving ? S.tertiary : S.cyan, border: "none", borderRadius: 2,
                  padding: "7px 18px", cursor: saving ? "wait" : "pointer",
                }}>
                  {saving ? "SAVING…" : "SAVE"}
                </button>
                <button onClick={() => setEditing(false)} style={{
                  fontFamily: S.fontMono, fontSize: 12, color: S.secondary, background: "transparent",
                  border: `1px solid ${S.rim}`, borderRadius: 2, padding: "7px 14px", cursor: "pointer",
                }}>
                  CANCEL
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Branches */}
      <div>
        <SectionHeader label={`Branches (${branches.length})`} />
        {branches.length === 0 ? (
          <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, padding: "12px 0" }}>No branches configured.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {branches.map(b => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 2, padding: "8px 12px" }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan, minWidth: 60 }}>{b.code}</span>
                <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.primary }}>{b.name}</span>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginLeft: "auto" }}>{b.id.slice(0, 8)}…</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
