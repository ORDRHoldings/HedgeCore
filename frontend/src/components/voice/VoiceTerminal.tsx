"use client";

/**
 * VoiceTerminal — Floating voice assistant powered by OpenAI Realtime API.
 *
 * Voice pipeline:
 *   Mic → PCM16 24kHz → OpenAI Realtime WebSocket → GPT-4o
 *       → audio response → Web Audio API → speaker
 *
 * Tool calls (calculate_hedge, get_spot_rate, etc.) are executed by the
 * browser against the backend API via dashboardFetch, then results are
 * sent back to OpenAI for the model to interpret.
 *
 * Dual-mode: voice + text input through the same Realtime session.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  MicIcon,
  MicOffIcon,
  XIcon,
  Volume2Icon,
  AlertCircleIcon,
  LoaderIcon,
  VolumeXIcon,
  ShieldAlertIcon,
  InfoIcon,
} from "lucide-react";

const DISCLOSURE_STORAGE_KEY = "ordr_voice_ai_disclosure_ack_v1";
const AI_DISCLOSURE_TEXT =
  "ORDR Voice is an AI assistant powered by OpenAI. Conversations are " +
  "recorded to a tamper-evident audit chain for compliance with MiFID II " +
  "Article 16(7) and the EU AI Act Article 52. Click Acknowledge to continue.";
import {
  useRealtimeVoice,
  type TranscriptEntry,
  type FunctionCallEvent,
  type PendingConfirmation,
  type VoiceStatus,
} from "@/hooks/useRealtimeVoice";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg: "#FFFFFF",
  sub: "#F1F5F9",
  rim: "#E2E8F0",
  blue: "#1C62F2",
  blueDim: "rgba(28,98,242,0.08)",
  blueBdr: "rgba(28,98,242,0.20)",
  primary: "#0F172A",
  muted: "#94A3B8",
  green: "#22C55E",
  amber: "#F59E0B",
  red: "#EF4444",
  mono: "'JetBrains Mono','IBM Plex Mono',monospace",
  ui: "'Inter','IBM Plex Sans',sans-serif",
} as const;

// ── Props ─────────────────────────────────────────────────────────────────────
interface VoiceTerminalProps {
  token: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function VoiceTerminal({ token }: VoiceTerminalProps) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [fn, setFn] = useState<FunctionCallEvent | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [disclosureAcked, setDisclosureAcked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(DISCLOSURE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const transcriptEnd = useRef<HTMLDivElement | null>(null);

  // ── Realtime Voice hook ─────────────────────────────────────────────────
  const handleTranscript = useCallback((entry: TranscriptEntry) => {
    setTranscript((prev) => {
      // For streaming (non-final) entries, update in place
      if (!entry.final) {
        const idx = prev.findIndex((e) => e.id === entry.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = entry;
          return updated;
        }
      }
      // For final entries or new entries, check if updating existing
      const idx = prev.findIndex((e) => e.id === entry.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = entry;
        return updated;
      }
      return [...prev, entry];
    });
  }, []);

  const handleFunctionCall = useCallback((evt: FunctionCallEvent) => {
    setFn(evt);
    if (evt.status === "done") setTimeout(() => setFn(null), 1500);
  }, []);

  const handleError = useCallback((message: string) => {
    setErrMsg(message);
  }, []);

  const handleConfirmRequired = useCallback((p: PendingConfirmation) => {
    setPending(p);
  }, []);

  const { connect, disconnect, sendText, toggleMic, isMicOn, status, acknowledgeDisclosure } =
    useRealtimeVoice({
      token,
      onTranscript: handleTranscript,
      onFunctionCall: handleFunctionCall,
      onConfirmRequired: handleConfirmRequired,
      onError: handleError,
    });

  const handleAcknowledgeDisclosure = useCallback(() => {
    acknowledgeDisclosure(AI_DISCLOSURE_TEXT);
    try {
      window.localStorage.setItem(DISCLOSURE_STORAGE_KEY, "1");
    } catch {
      // localStorage may be disabled — still treat as acked for this session
    }
    setDisclosureAcked(true);
  }, [acknowledgeDisclosure]);

  // ── Scroll to bottom on new transcript ──────────────────────────────────
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Open / close panel ──────────────────────────────────────────────────
  const openPanel = useCallback(() => {
    setOpen(true);
    connect();
  }, [connect]);

  const closePanel = useCallback(() => {
    setOpen(false);
    disconnect();
    setTranscript([]);
    setErrMsg(null);
    setFn(null);
    if (pending) {
      pending.deny();
      setPending(null);
    }
  }, [disconnect, pending]);

  const handleApprove = useCallback(() => {
    if (!pending) return;
    pending.approve();
    setPending(null);
  }, [pending]);

  const handleDeny = useCallback(() => {
    if (!pending) return;
    pending.deny();
    setPending(null);
  }, [pending]);

  // ── Send text message ───────────────────────────────────────────────────
  const handleSendText = useCallback(() => {
    const text = textInput.trim();
    if (!text) return;
    sendText(text);
    setTextInput("");
  }, [textInput, sendText]);

  // ── Derived UI ──────────────────────────────────────────────────────────
  const dotColor = getDotColor(status);
  const dotPulse =
    status === "listening" || status === "speaking" || status === "processing";
  const micEnabled =
    status === "ready" || status === "listening" || status === "speaking";
  const inputEnabled =
    status === "ready" || status === "listening" || status === "processing";

  const statusLabel = getStatusLabel(status, isMicOn);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={openPanel}
          aria-label="Open ORDR Voice assistant"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9998,
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: T.blue,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 20px rgba(28,98,242,0.35)",
            transition: "transform 120ms, box-shadow 120ms",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform =
              "scale(1.08)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          }}
        >
          <MicIcon size={20} color="#fff" strokeWidth={2} />
        </button>
      )}

      {/* Voice panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9999,
            width: 360,
            height: 520,
            background: T.bg,
            border: `1px solid ${T.rim}`,
            borderRadius: 6,
            boxShadow:
              "0 8px 40px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              background: T.sub,
              borderBottom: `1px solid ${T.rim}`,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: dotColor,
                  animation: dotPulse
                    ? "voice-pulse 1.2s ease-out infinite"
                    : "none",
                }}
              />
              <span
                style={{
                  fontFamily: T.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  color: T.primary,
                }}
              >
                ORDR VOICE
              </span>
              <span
                style={{
                  fontFamily: T.mono,
                  fontSize: 12,
                  letterSpacing: "0.1em",
                  color: T.muted,
                }}
              >
                {status.toUpperCase()}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Voice output toggle */}
              <button
                onClick={() => setVoiceOn((v) => !v)}
                aria-label={voiceOn ? "Mute voice" : "Unmute voice"}
                title={voiceOn ? "Mute spoken replies" : "Enable spoken replies"}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: 2,
                  opacity: 0.6,
                }}
              >
                {voiceOn ? (
                  <Volume2Icon size={13} color={T.blue} />
                ) : (
                  <VolumeXIcon size={13} color={T.muted} />
                )}
              </button>
              <button
                onClick={closePanel}
                aria-label="Close voice assistant"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: 2,
                }}
              >
                <XIcon size={14} color={T.muted} />
              </button>
            </div>
          </div>

          {/* Transcript */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {!disclosureAcked && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "10px 12px",
                  background: T.blueDim,
                  border: `1px solid ${T.blueBdr}`,
                  borderRadius: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <InfoIcon
                    size={13}
                    color={T.blue}
                    style={{ flexShrink: 0, marginTop: 1 }}
                  />
                  <div
                    style={{
                      fontFamily: T.ui,
                      fontSize: 12,
                      lineHeight: 1.45,
                      color: T.primary,
                    }}
                  >
                    {AI_DISCLOSURE_TEXT}
                  </div>
                </div>
                <button
                  onClick={handleAcknowledgeDisclosure}
                  style={{
                    alignSelf: "flex-end",
                    fontFamily: T.mono,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    background: T.blue,
                    color: "#fff",
                    border: "none",
                    borderRadius: 3,
                    padding: "5px 12px",
                    cursor: "pointer",
                  }}
                >
                  ACKNOWLEDGE
                </button>
              </div>
            )}

            {transcript.length === 0 && status === "connecting" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: T.muted,
                  fontFamily: T.mono,
                  fontSize: 12,
                }}
              >
                <LoaderIcon
                  size={12}
                  style={{ animation: "spin 1s linear infinite" }}
                />
                Connecting…
              </div>
            )}

            {transcript.map((line) => (
              <div
                key={line.id}
                style={{
                  alignSelf:
                    line.role === "user"
                      ? "flex-end"
                      : line.role === "system"
                        ? "center"
                        : "flex-start",
                  maxWidth: "85%",
                }}
              >
                {line.role === "system" ? (
                  <span
                    style={{
                      fontFamily: T.mono,
                      fontSize: 12,
                      color: T.muted,
                      letterSpacing: "0.08em",
                    }}
                  >
                    {line.text}
                  </span>
                ) : (
                  <div
                    style={{
                      padding: "8px 12px",
                      background: line.role === "user" ? T.blue : T.sub,
                      borderRadius:
                        line.role === "user"
                          ? "12px 12px 3px 12px"
                          : "3px 12px 12px 12px",
                      border:
                        line.role === "user"
                          ? "none"
                          : `1px solid ${T.rim}`,
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontFamily: T.ui,
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: line.role === "user" ? "#fff" : T.primary,
                      }}
                    >
                      {line.text}
                    </p>
                  </div>
                )}
              </div>
            ))}

            {/* Thinking / function-call indicator */}
            {(fn || status === "processing") && (
              <div
                style={{
                  alignSelf: "center",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  background: T.blueDim,
                  border: `1px solid ${T.blueBdr}`,
                  borderRadius: 10,
                }}
              >
                {fn?.status === "done" ? (
                  <Volume2Icon size={10} color={T.blue} />
                ) : (
                  <LoaderIcon
                    size={10}
                    color={T.blue}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                )}
                <span
                  style={{
                    fontFamily: T.mono,
                    fontSize: 12,
                    color: T.blue,
                    letterSpacing: "0.1em",
                  }}
                >
                  {fn
                    ? fn.status === "calling"
                      ? `Calling ${fn.name}…`
                      : `${fn.name} done`
                    : "ORDR is thinking…"}
                </span>
              </div>
            )}

            {/* Mutating-tool confirmation gate */}
            {pending && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "10px 12px",
                  background: "rgba(245,158,11,0.06)",
                  border: "1px solid rgba(245,158,11,0.30)",
                  borderRadius: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <ShieldAlertIcon
                    size={13}
                    color={T.amber}
                    style={{ flexShrink: 0, marginTop: 1 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: T.mono,
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        color: T.amber,
                        marginBottom: 4,
                      }}
                    >
                      CONFIRM ACTION
                    </div>
                    <div
                      style={{
                        fontFamily: T.ui,
                        fontSize: 12,
                        color: T.primary,
                        lineHeight: 1.4,
                        wordBreak: "break-word",
                      }}
                    >
                      ORDR wants to call <strong>{pending.name}</strong>
                      {Object.keys(pending.arguments).length > 0 && (
                        <>
                          {" "}with{" "}
                          <code
                            style={{
                              fontFamily: T.mono,
                              fontSize: 11,
                              background: T.sub,
                              padding: "1px 4px",
                              borderRadius: 2,
                              color: T.primary,
                            }}
                          >
                            {JSON.stringify(pending.arguments)}
                          </code>
                        </>
                      )}
                      .
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button
                    onClick={handleDeny}
                    style={{
                      fontFamily: T.mono,
                      fontSize: 12,
                      letterSpacing: "0.08em",
                      background: "transparent",
                      color: T.muted,
                      border: `1px solid ${T.rim}`,
                      borderRadius: 3,
                      padding: "5px 12px",
                      cursor: "pointer",
                    }}
                  >
                    DENY
                  </button>
                  <button
                    onClick={handleApprove}
                    style={{
                      fontFamily: T.mono,
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      background: T.amber,
                      color: "#fff",
                      border: "none",
                      borderRadius: 3,
                      padding: "5px 12px",
                      cursor: "pointer",
                    }}
                  >
                    CONFIRM
                  </button>
                </div>
              </div>
            )}

            {/* Error + Reconnect */}
            {errMsg && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: "8px 10px",
                  background: "rgba(239,68,68,0.06)",
                  border: "1px solid rgba(239,68,68,0.20)",
                  borderRadius: 4,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 6,
                  }}
                >
                  <AlertCircleIcon
                    size={12}
                    color={T.red}
                    style={{ flexShrink: 0, marginTop: 1 }}
                  />
                  <span
                    style={{ fontFamily: T.ui, fontSize: 12, color: T.red }}
                  >
                    {errMsg}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setErrMsg(null);
                    setTranscript([]);
                    connect();
                  }}
                  style={{
                    alignSelf: "flex-start",
                    fontFamily: T.mono,
                    fontSize: 12,
                    letterSpacing: "0.1em",
                    background: T.red,
                    color: "#fff",
                    border: "none",
                    borderRadius: 3,
                    padding: "4px 10px",
                    cursor: "pointer",
                  }}
                >
                  RECONNECT
                </button>
              </div>
            )}

            <div ref={transcriptEnd} />
          </div>

          {/* Controls */}
          <div
            style={{
              borderTop: `1px solid ${T.rim}`,
              padding: "10px 14px",
              flexShrink: 0,
            }}
          >
            {/* Mic button row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <button
                onClick={toggleMic}
                disabled={!micEnabled}
                aria-label={isMicOn ? "Stop microphone" : "Start microphone"}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: isMicOn ? "rgba(239,68,68,0.10)" : T.blueDim,
                  border: `1px solid ${isMicOn ? "rgba(239,68,68,0.30)" : T.blueBdr}`,
                  cursor: micEnabled ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: micEnabled ? 1 : 0.4,
                  transition: "all 150ms",
                }}
              >
                {isMicOn ? (
                  <MicOffIcon size={16} color={T.red} />
                ) : (
                  <MicIcon size={16} color={T.blue} />
                )}
              </button>
              <span
                style={{
                  fontFamily: T.mono,
                  fontSize: 12,
                  color: T.muted,
                  letterSpacing: "0.08em",
                  flex: 1,
                }}
              >
                {statusLabel}
              </span>
            </div>

            {/* Text input */}
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendText();
                }}
                placeholder="Type a message…"
                disabled={!inputEnabled}
                style={{
                  flex: 1,
                  fontFamily: T.mono,
                  fontSize: 12,
                  color: T.primary,
                  background: T.sub,
                  border: `1px solid ${T.rim}`,
                  borderRadius: 3,
                  padding: "7px 10px",
                  outline: "none",
                  minWidth: 0,
                  opacity: inputEnabled ? 1 : 0.5,
                }}
              />
              <button
                onClick={handleSendText}
                disabled={!textInput.trim() || !inputEnabled}
                style={{
                  fontFamily: T.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "#fff",
                  background: T.blue,
                  border: "none",
                  borderRadius: 3,
                  padding: "7px 12px",
                  cursor: "pointer",
                  opacity: !textInput.trim() || !inputEnabled ? 0.4 : 1,
                  transition: "opacity 120ms",
                }}
              >
                SEND
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes voice-pulse {
          0%   { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
          70%  { box-shadow: 0 0 0 6px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getDotColor(status: VoiceStatus): string {
  switch (status) {
    case "error":
      return T.red;
    case "listening":
      return T.green;
    case "speaking":
      return T.blue;
    case "processing":
      return T.amber;
    case "ready":
      return T.green;
    case "connecting":
      return T.amber;
    default:
      return T.muted;
  }
}

function getStatusLabel(status: VoiceStatus, isMicOn: boolean): string {
  switch (status) {
    case "disconnected":
      return "Click to open";
    case "connecting":
      return "Connecting…";
    case "ready":
      return isMicOn ? "Listening — speak or type" : "Tap mic or type below";
    case "listening":
      return "Listening… speak now";
    case "processing":
      return "ORDR is thinking…";
    case "speaking":
      return "ORDR is speaking…";
    case "error":
      return "Error — check connection";
    default:
      return "";
  }
}
