"use client";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import {
  AllSettings, DEFAULT_SETTINGS, STORAGE_KEY, ServerMeta,
  PolicyLimitSettings, ExecutionSettings,
} from "../types/settings";

export function useSettings() {
  const { token } = useAuth();
  const [settings, setSettings]     = useState<AllSettings>(DEFAULT_SETTINGS);
  const [isDirty,  setDirty]        = useState(false);
  const [saving,   setSaving]       = useState(false);
  const [serverMeta, setServerMeta] = useState<ServerMeta>({});
  const prevSettings                = useRef<AllSettings>(DEFAULT_SETTINGS);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AllSettings;
        setSettings(parsed);
        prevSettings.current = parsed;
      }
    } catch { /* ignore */ }
  }, []);

  // Load governed settings from server (server is source of truth for policy + execution)
  useEffect(() => {
    if (!token) return;
    dashboardFetch("/v1/company/settings", token)
      .then(async res => {
        if (!res.ok) return;
        const data = await res.json() as {
          policy_limits?:      PolicyLimitSettings | null;
          execution_settings?: ExecutionSettings   | null;
          last_modified_at?:   string | null;
          last_modified_by?:   string | null;
        };
        setServerMeta({
          last_modified_at: data.last_modified_at,
          last_modified_by: data.last_modified_by,
        });
        if (data.policy_limits) {
          setSettings(p => ({ ...p, policy: { ...p.policy, ...data.policy_limits! } }));
          prevSettings.current = {
            ...prevSettings.current,
            policy: { ...prevSettings.current.policy, ...data.policy_limits! },
          };
        }
        if (data.execution_settings) {
          setSettings(p => ({ ...p, execution: { ...p.execution, ...data.execution_settings! } }));
          prevSettings.current = {
            ...prevSettings.current,
            execution: { ...prevSettings.current.execution, ...data.execution_settings! },
          };
        }
      })
      .catch(() => { /* non-critical — fall back to localStorage */ });
  }, [token]);

  // Mark dirty on change
  useEffect(() => {
    if (JSON.stringify(settings) !== JSON.stringify(prevSettings.current)) {
      setDirty(true);
    }
  }, [settings]);

  return {
    settings,
    setSettings,
    isDirty,
    setDirty,
    saving,
    setSaving,
    serverMeta,
    setServerMeta,
    prevSettings,
  };
}
