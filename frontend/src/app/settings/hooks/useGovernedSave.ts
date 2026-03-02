"use client";
import { useState, useCallback, type MutableRefObject } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import {
  AllSettings, STORAGE_KEY, SettingsTab, DiffField,
  PolicyLimitSettings, ExecutionSettings, ServerMeta, Toast,
} from "../types/settings";

interface Deps {
  settings:     AllSettings;
  activeTab:    SettingsTab;
  prevSettings: MutableRefObject<AllSettings>;
  token:        string | null;
  userEmail:    string | undefined;
  setSaving:    (v: boolean) => void;
  setSettings:  (v: AllSettings) => void;
  setDirty:     (v: boolean) => void;
  setServerMeta:(v: ServerMeta) => void;
  addToast:     (kind: Toast["kind"], msg: string) => void;
  addChangeLog: (tab: string, msg: string) => void;
}

export function useGovernedSave(deps: Deps) {
  const {
    settings, activeTab, prevSettings, token, userEmail,
    setSaving, setSettings, setDirty, setServerMeta, addToast, addChangeLog,
  } = deps;

  const [showDiffModal, setShowDiffModal] = useState(false);
  const [diffFields,    setDiffFields]    = useState<DiffField[]>([]);
  const [pendingSave,   setPendingSave]   = useState<AllSettings | null>(null);

  const buildDiffFields = useCallback((tab: SettingsTab): DiffField[] => {
    const prev = prevSettings.current;
    const curr = settings;
    const fields: DiffField[] = [];

    if (tab === "POLICY_LIMITS") {
      const keys: Array<[keyof PolicyLimitSettings, string]> = [
        ["confirmed_hedge_ratio", "Confirmed Hedge Ratio"],
        ["forecast_hedge_ratio",  "Forecast Hedge Ratio"],
        ["min_trade_size_usd",    "Min Trade Size (USD)"],
        ["max_single_trade_usd",  "Max Trade Size (USD)"],
        ["cooling_off_hours",     "Cooling-Off (hours)"],
        ["spread_bps",            "Spread (bps)"],
        ["required_approvals",    "Required Approvals"],
        ["integrity_threshold",   "Integrity Threshold"],
      ];
      for (const [k, label] of keys) {
        fields.push({ label, before: String(prev.policy[k]), after: String(curr.policy[k]) });
      }
    } else if (tab === "EXECUTION") {
      const keys: Array<[keyof ExecutionSettings, string]> = [
        ["default_product",       "Default Product"],
        ["stress_sigma",          "Stress Sigma"],
        ["max_friction_bps",      "Max Friction (bps)"],
        ["auto_submit_below_usd", "Auto-Submit Below (USD)"],
        ["counterparty_limit_usd","Counterparty Limit (USD)"],
      ];
      for (const [k, label] of keys) {
        fields.push({ label, before: String(prev.execution[k]), after: String(curr.execution[k]) });
      }
    }
    return fields;
  }, [settings, prevSettings]);

  const handleSave = useCallback(async (onLocalSave: () => void) => {
    const isGoverned = activeTab === "POLICY_LIMITS" || activeTab === "EXECUTION";
    if (isGoverned) {
      const fields  = buildDiffFields(activeTab);
      const changed = fields.filter(f => f.before !== f.after);
      if (changed.length === 0) { addToast("success", "No changes to save."); return; }
      setDiffFields(fields);
      setPendingSave({ ...settings, last_saved: new Date().toISOString() });
      setShowDiffModal(true);
      return;
    }
    // Non-governed: localStorage only
    setSaving(true);
    await new Promise(r => setTimeout(r, 200));
    const saved: AllSettings = { ...settings, last_saved: new Date().toISOString() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      setSettings(saved);
      prevSettings.current = saved;
      setDirty(false);
      addChangeLog(activeTab, `Settings saved by ${userEmail ?? "unknown"} — tab: ${activeTab}`);
      addToast("success", "Settings saved.");
      onLocalSave();
    } catch {
      addToast("error", "Failed to save settings — localStorage unavailable.");
    } finally {
      setSaving(false);
    }
  }, [settings, activeTab, userEmail, buildDiffFields, addToast, setSaving, setSettings, setDirty, addChangeLog, prevSettings]);

  const handleConfirmGoverned = useCallback(async () => {
    if (!pendingSave || !token) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (activeTab === "POLICY_LIMITS") {
        body.policy_limits = pendingSave.policy;
      } else if (activeTab === "EXECUTION") {
        body.execution_settings = {
          default_product:        pendingSave.execution.default_product,
          stress_sigma:           pendingSave.execution.stress_sigma,
          max_friction_bps:       pendingSave.execution.max_friction_bps,
          auto_submit_below_usd:  pendingSave.execution.auto_submit_below_usd,
          counterparty_limit_usd: pendingSave.execution.counterparty_limit_usd,
        };
      }
      const res = await dashboardFetch("/v1/company/settings", token, {
        method: "PATCH",
        body:   JSON.stringify(body),
      });
      if (!res.ok) {
        const err    = await res.json().catch(() => ({}));
        const detail = (err as { detail?: string }).detail ?? `HTTP ${res.status}`;
        addToast("error", res.status === 403 ? `Permission denied: ${detail}` : `Failed to save: ${detail}`);
        return;
      }
      const saved = await res.json() as { last_modified_at?: string; last_modified_by?: string };
      setServerMeta({ last_modified_at: saved.last_modified_at, last_modified_by: saved.last_modified_by });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingSave));
      setSettings(pendingSave);
      prevSettings.current = pendingSave;
      setDirty(false);
      addChangeLog(activeTab, `Governed settings saved by ${userEmail ?? "unknown"} — tab: ${activeTab} — server-backed ✓`);
      addToast("success", "Governed settings saved and audit-logged.");
      setShowDiffModal(false);
      setPendingSave(null);
    } catch {
      addToast("error", "Network error saving governed settings.");
    } finally {
      setSaving(false);
    }
  }, [pendingSave, activeTab, token, userEmail, addToast, setSaving, setSettings, setDirty, setServerMeta, addChangeLog, prevSettings]);

  const cancelDiff = useCallback(() => {
    setShowDiffModal(false);
    setPendingSave(null);
  }, []);

  return { showDiffModal, diffFields, pendingSave, handleSave, handleConfirmGoverned, cancelDiff };
}
