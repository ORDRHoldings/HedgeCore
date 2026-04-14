"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Settings2 } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";

import { useAuth } from "@/lib/authContext";
import {
  listGLMappings,
  upsertGLMapping,
  type GLAccountMapping,
} from "@/lib/api/glClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  accent: "var(--accent-cyan)",
  text: "var(--text-primary)",
  textSub: "var(--text-secondary)",
} as const;

const ENTRY_TYPES = [
  "OCI_RECOGNITION",
  "PNL_RECLASSIFICATION",
  "INEFFECTIVENESS",
  "SETTLEMENT_VARIANCE",
  "FAIR_VALUE_CHANGE",
] as const;

const STANDARDS = ["IFRS_9", "ASC_815", "IAS_39"] as const;

const ERP_SYSTEMS = ["MANUAL", "QB", "XERO", "NETSUITE", "SAGE"] as const;

interface MappingRow {
  entry_type: string;
  standard: string;
  debit_account: string;
  credit_account: string;
  account_label: string;
  erp_system: string;
}

const DEFAULT_ROW: MappingRow = {
  entry_type: "OCI_RECOGNITION",
  standard: "IFRS_9",
  debit_account: "",
  credit_account: "",
  account_label: "",
  erp_system: "MANUAL",
};

export default function GLAccountsPage() {
  const { token } = useAuth();
  const [mappings, setMappings] = useState<GLAccountMapping[]>([]);
  const [editing, setEditing] = useState<MappingRow>(DEFAULT_ROW);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await listGLMappings(token);
      setMappings(data);
    } catch {
      setError("Failed to load GL mappings");
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!token) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await upsertGLMapping(token, editing);
      setSuccess(true);
      await load();
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save mapping");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (m: GLAccountMapping) => {
    setEditing({
      entry_type: m.entry_type,
      standard: m.standard,
      debit_account: m.debit_account,
      credit_account: m.credit_account,
      account_label: m.account_label,
      erp_system: m.erp_system,
    });
  };

  return (
    <PageShell icon={Settings2} title="GL Account Mappings" breadcrumb={["Settings", "GL Account Mappings"]} noPadding>
      <div style={{ padding: "24px 32px", maxWidth: 900, fontFamily: S.fontUI }}>

        <p style={{ fontSize: 13, color: S.textSub, marginBottom: 24, lineHeight: 1.6 }}>
          Configure chart-of-accounts codes for each journal entry type and hedge standard.
          These mappings are required before journal entries can be generated from
          effectiveness runs or settlements. UNIQUE per entry_type + standard pair.
        </p>

        {mappings.length > 0 && (
          <div
            style={{
              border: `1px solid ${S.rim}`,
              borderRadius: 4,
              marginBottom: 32,
              overflow: "auto",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: S.bgDeep }}>
                  {["Entry Type", "Standard", "Debit Acct", "Credit Acct", "Label", "ERP", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        fontFamily: S.fontMono,
                        color: S.textSub,
                        fontSize: 11,
                        letterSpacing: "0.06em",
                        borderBottom: `1px solid ${S.rim}`,
                      }}
                    >
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr
                    key={m.id}
                    style={{ borderBottom: `1px solid ${S.rim}`, cursor: "pointer" }}
                    onClick={() => handleEdit(m)}
                  >
                    <td style={{ padding: "8px 12px", fontFamily: S.fontMono, color: S.text }}>{m.entry_type}</td>
                    <td style={{ padding: "8px 12px", color: S.textSub }}>{m.standard}</td>
                    <td style={{ padding: "8px 12px", fontFamily: S.fontMono, color: S.accent }}>{m.debit_account}</td>
                    <td style={{ padding: "8px 12px", fontFamily: S.fontMono, color: S.accent }}>{m.credit_account}</td>
                    <td style={{ padding: "8px 12px", color: S.textSub }}>{m.account_label}</td>
                    <td style={{ padding: "8px 12px", color: S.textSub }}>{m.erp_system}</td>
                    <td style={{ padding: "8px 12px", color: S.accent, fontSize: 11 }}>Edit</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 4,
            padding: 20,
          }}
        >
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              letterSpacing: "0.06em",
              color: S.textSub,
              marginBottom: 16,
              textTransform: "uppercase",
            }}
          >
            {mappings.find((m) => m.entry_type === editing.entry_type && m.standard === editing.standard)
              ? "Edit Mapping"
              : "Add Mapping"}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 6 }}>ENTRY TYPE</label>
              <select
                value={editing.entry_type}
                onChange={(e) => setEditing((p) => ({ ...p, entry_type: e.target.value }))}
                style={{ width: "100%", background: S.bgDeep, border: `1px solid ${S.rim}`, color: S.text, padding: "6px 10px", fontSize: 13, borderRadius: 3 }}
              >
                {ENTRY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 6 }}>STANDARD</label>
              <select
                value={editing.standard}
                onChange={(e) => setEditing((p) => ({ ...p, standard: e.target.value }))}
                style={{ width: "100%", background: S.bgDeep, border: `1px solid ${S.rim}`, color: S.text, padding: "6px 10px", fontSize: 13, borderRadius: 3 }}
              >
                {STANDARDS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 6 }}>DEBIT ACCOUNT</label>
              <input
                value={editing.debit_account}
                onChange={(e) => setEditing((p) => ({ ...p, debit_account: e.target.value }))}
                placeholder="e.g. 1200"
                style={{ width: "100%", background: S.bgDeep, border: `1px solid ${S.rim}`, color: S.text, padding: "6px 10px", fontSize: 13, fontFamily: S.fontMono, borderRadius: 3, boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 6 }}>CREDIT ACCOUNT</label>
              <input
                value={editing.credit_account}
                onChange={(e) => setEditing((p) => ({ ...p, credit_account: e.target.value }))}
                placeholder="e.g. 3400"
                style={{ width: "100%", background: S.bgDeep, border: `1px solid ${S.rim}`, color: S.text, padding: "6px 10px", fontSize: 13, fontFamily: S.fontMono, borderRadius: 3, boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 6 }}>LABEL (OPTIONAL)</label>
              <input
                value={editing.account_label}
                onChange={(e) => setEditing((p) => ({ ...p, account_label: e.target.value }))}
                placeholder="e.g. OCI — FX Hedging Reserve"
                style={{ width: "100%", background: S.bgDeep, border: `1px solid ${S.rim}`, color: S.text, padding: "6px 10px", fontSize: 13, borderRadius: 3, boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 6 }}>ERP SYSTEM</label>
              <select
                value={editing.erp_system}
                onChange={(e) => setEditing((p) => ({ ...p, erp_system: e.target.value }))}
                style={{ width: "100%", background: S.bgDeep, border: `1px solid ${S.rim}`, color: S.text, padding: "6px 10px", fontSize: 13, borderRadius: 3 }}
              >
                {ERP_SYSTEMS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
            <button
              onClick={handleSave}
              disabled={saving || !editing.debit_account || !editing.credit_account}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 20px",
                background: saving ? S.bgSub : S.accent,
                color: "#000", border: "none", borderRadius: 3,
                fontSize: 13, fontFamily: S.fontMono,
                cursor: saving ? "not-allowed" : "pointer",
                letterSpacing: "0.04em",
              }}
            >
              <Save size={14} />
              {saving ? "SAVING..." : "SAVE MAPPING"}
            </button>
            {success && <span style={{ fontSize: 12, color: "var(--accent-green)", fontFamily: S.fontMono }}>&#x2713; Saved</span>}
            {error && <span style={{ fontSize: 12, color: "var(--accent-red)" }}>{error}</span>}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
