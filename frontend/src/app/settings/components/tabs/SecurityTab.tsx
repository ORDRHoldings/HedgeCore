"use client";
import { useState, useEffect } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { S } from "../../types/settings";
import SectionHeader from "../shared/SectionHeader";

interface MfaStatus   { is_enabled: boolean; enrolled_at: string | null; }
interface MfaSetupData { provisioning_uri: string; backup_codes: string[]; secret: string; }

interface Props { token: string; }

export default function SecurityTab({ token }: Props) {
  const [mfaStatus,      setMfaStatus]      = useState<MfaStatus | null>(null);
  const [loadingStatus,  setLoadingStatus]  = useState(true);
  const [statusError,    setStatusError]    = useState<string | null>(null);
  const [setupData,      setSetupData]      = useState<MfaSetupData | null>(null);
  const [setupLoading,   setSetupLoading]   = useState(false);
  const [setupError,     setSetupError]     = useState<string | null>(null);
  const [activateCode,   setActivateCode]   = useState("");
  const [activateLoading,setActivateLoading]= useState(false);
  const [activateError,  setActivateError]  = useState<string | null>(null);
  const [showDisable,    setShowDisable]    = useState(false);
  const [disableCode,    setDisableCode]    = useState("");
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableError,   setDisableError]   = useState<string | null>(null);
  const [copied,         setCopied]         = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoadingStatus(true);
    dashboardFetch("/v1/mfa/status", token)
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<MfaStatus>;
      })
      .then(data => setMfaStatus(data))
      .catch(() => setStatusError("Failed to load MFA status."))
      .finally(() => setLoadingStatus(false));
  }, [token]);

  const handleSetup = async () => {
    setSetupLoading(true); setSetupError(null);
    try {
      const res = await dashboardFetch("/v1/mfa/setup", token, { method: "POST" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { detail?: string }).detail ?? `HTTP ${res.status}`); }
      setSetupData(await res.json() as MfaSetupData);
    } catch (e: unknown) {
      setSetupError(e instanceof Error ? e.message : "Failed to initiate MFA setup.");
    } finally { setSetupLoading(false); }
  };

  const handleActivate = async () => {
    if (activateCode.length !== 6) { setActivateError("Enter a 6-digit code."); return; }
    setActivateLoading(true); setActivateError(null);
    try {
      const res = await dashboardFetch("/v1/mfa/activate", token, { method: "POST", body: JSON.stringify({ totp_code: activateCode }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { detail?: string }).detail ?? `HTTP ${res.status}`); }
      setMfaStatus({ is_enabled: true, enrolled_at: new Date().toISOString() });
      setSetupData(null); setActivateCode("");
    } catch (e: unknown) {
      setActivateError(e instanceof Error ? e.message : "Activation failed — check your code.");
    } finally { setActivateLoading(false); }
  };

  const handleDisable = async () => {
    if (disableCode.length !== 6) { setDisableError("Enter a 6-digit code."); return; }
    setDisableLoading(true); setDisableError(null);
    try {
      const res = await dashboardFetch("/v1/mfa/disable", token, { method: "DELETE", body: JSON.stringify({ totp_code: disableCode }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { detail?: string }).detail ?? `HTTP ${res.status}`); }
      setMfaStatus({ is_enabled: false, enrolled_at: null });
      setShowDisable(false); setDisableCode("");
    } catch (e: unknown) {
      setDisableError(e instanceof Error ? e.message : "Disable failed — check your code.");
    } finally { setDisableLoading(false); }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  };

  const codeStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, letterSpacing: "0.25em", textAlign: "center",
    color: S.primary, background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
    padding: "10px 14px", outline: "none", width: 160, boxSizing: "border-box",
  };
  const btn = (color: string, disabled?: boolean): React.CSSProperties => ({
    fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
    color: disabled ? S.tertiary : "#000", background: disabled ? S.rim : color,
    border: "none", borderRadius: 2, padding: "8px 20px", cursor: disabled ? "not-allowed" : "pointer",
  });
  const errBox = (msg: string) => (
    <div style={{ background: `color-mix(in srgb, ${S.fail} 8%, transparent)`, border: `1px solid ${S.fail}`, borderLeft: `3px solid ${S.fail}`, borderRadius: 2, padding: "8px 12px", fontFamily: S.fontMono, fontSize: 10, color: S.fail, letterSpacing: "0.06em" }}>
      ✗ {msg}
    </div>
  );

  if (loadingStatus) return <div style={{ padding: "40px 0", textAlign: "center", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, letterSpacing: "0.09em" }}>LOADING MFA STATUS…</div>;
  if (statusError)   return <div style={{ padding: "20px 0" }}>{errBox(statusError)}</div>;

  const enrolledDate = mfaStatus?.enrolled_at
    ? new Date(mfaStatus.enrolled_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SectionHeader label="Multi-Factor Authentication" />

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, letterSpacing: "0.06em" }}>STATUS:</span>
        {mfaStatus?.is_enabled ? (
          <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: S.pass, background: `color-mix(in srgb, ${S.pass} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${S.pass} 30%, transparent)`, borderRadius: 2, padding: "2px 8px" }}>● ENABLED</span>
        ) : (
          <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: S.tertiary, background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2, padding: "2px 8px" }}>○ NOT ENABLED</span>
        )}
      </div>

      {mfaStatus?.is_enabled && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {enrolledDate && <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>Enrolled: <span style={{ fontFamily: S.fontMono, color: S.primary }}>{enrolledDate}</span></div>}
          {!showDisable ? (
            <div>
              <button onClick={() => setShowDisable(true)} style={btn(S.fail)}>DISABLE MFA</button>
              <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, marginTop: 6 }}>Disabling MFA reduces account security. You will be required to enter your authenticator code to confirm.</div>
            </div>
          ) : (
            <div style={{ background: `color-mix(in srgb, ${S.fail} 5%, transparent)`, border: `1px solid color-mix(in srgb, ${S.fail} 20%, transparent)`, borderLeft: `3px solid ${S.fail}`, borderRadius: 2, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.fail, letterSpacing: "0.09em" }}>CONFIRM MFA DISABLE</div>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>Enter your current 6-digit authenticator code to disable MFA.</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="text" inputMode="numeric" maxLength={6} value={disableCode}
                  onChange={e => setDisableCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000" style={codeStyle} autoFocus />
                <button onClick={handleDisable} disabled={disableLoading} style={btn(S.fail, disableLoading)}>{disableLoading ? "DISABLING…" : "CONFIRM DISABLE"}</button>
                <button onClick={() => { setShowDisable(false); setDisableCode(""); setDisableError(null); }} style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: S.secondary, background: "transparent", border: `1px solid ${S.rim}`, borderRadius: 2, padding: "8px 14px", cursor: "pointer" }}>CANCEL</button>
              </div>
              {disableError && errBox(disableError)}
            </div>
          )}
        </div>
      )}

      {!mfaStatus?.is_enabled && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.6 }}>
            Protect your account with a time-based one-time password (TOTP) authenticator app such as Google Authenticator, Authy, or 1Password.
          </div>
          {!setupData ? (
            <div>
              <button onClick={handleSetup} disabled={setupLoading} style={btn(S.cyan, setupLoading)}>{setupLoading ? "GENERATING…" : "SETUP MFA"}</button>
              {setupError && <div style={{ marginTop: 8 }}>{errBox(setupError)}</div>}
            </div>
          ) : (
            <div style={{ background: `color-mix(in srgb, ${S.cyan} 4%, transparent)`, border: `1px solid color-mix(in srgb, ${S.cyan} 15%, transparent)`, borderLeft: `3px solid ${S.cyan}`, borderRadius: 2, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.cyan, letterSpacing: "0.09em" }}>ENROLL AUTHENTICATOR</div>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.6 }}>Enter this secret manually in your authenticator app, then enter the 6-digit code below to activate.</div>
              {setupData.provisioning_uri && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.tertiary, letterSpacing: "0.09em" }}>SCAN QR CODE:</span>
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupData.provisioning_uri)}`}
                      alt="TOTP QR Code"
                      width={160}
                      height={160}
                      style={{ border: `1px solid ${S.rim}`, borderRadius: 2, background: "#fff", padding: 8 }}
                    />
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.tertiary, letterSpacing: "0.09em" }}>TOTP SECRET:</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.cyan, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 2, padding: "8px 12px", letterSpacing: "0.2em", flex: 1, wordBreak: "break-all", lineHeight: 1.6 }}>{setupData.secret}</div>
                  <button onClick={() => handleCopy(setupData.secret)} style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: copied ? S.pass : S.secondary, background: S.bgSub, border: `1px solid ${copied ? S.pass : S.rim}`, borderRadius: 2, padding: "8px 12px", cursor: "pointer", flexShrink: 0 }}>{copied ? "COPIED ✓" : "COPY"}</button>
                </div>
              </div>
              {setupData.backup_codes.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.amber, letterSpacing: "0.09em" }}>BACKUP CODES — STORE SECURELY:</span>
                  <div style={{ background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 2, padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {setupData.backup_codes.map((code, i) => (
                      <span key={i} style={{ fontFamily: S.fontMono, fontSize: 11, color: S.amber, background: `color-mix(in srgb, ${S.amber} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${S.amber} 20%, transparent)`, borderRadius: 2, padding: "2px 8px", letterSpacing: "0.12em" }}>{code}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.tertiary, letterSpacing: "0.09em" }}>ENTER 6-DIGIT CODE TO ACTIVATE:</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="text" inputMode="numeric" maxLength={6} value={activateCode}
                    onChange={e => setActivateCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000" style={codeStyle} autoFocus />
                  <button onClick={handleActivate} disabled={activateLoading || activateCode.length !== 6} style={btn(S.pass, activateLoading || activateCode.length !== 6)}>{activateLoading ? "ACTIVATING…" : "ACTIVATE MFA"}</button>
                </div>
                {activateError && errBox(activateError)}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 2, padding: "10px 14px", fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, lineHeight: 1.6 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.secondary, marginRight: 6, letterSpacing: "0.07em" }}>TOTP</span>
        MFA uses RFC 6238 time-based one-time passwords (30-second window). Compatible with all standard authenticator apps. Backup codes are single-use emergency recovery tokens — each can only be used once.
      </div>
    </div>
  );
}
