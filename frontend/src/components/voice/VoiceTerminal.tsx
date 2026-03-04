"use client";

/**
 * VoiceTerminal — Floating voice assistant powered by Claude (Anthropic Messages API).
 *
 * Voice pipeline (browser-native, no API keys required):
 *   Mic → SpeechRecognition (Web Speech API, Chrome/Edge) → text
 *      → WebSocket → backend → Claude claude-sonnet-4-6
 *      → text transcript → SpeechSynthesis (browser TTS) → speaker
 *
 * Text input is always available as a fallback (and on Firefox/Safari).
 * Mounted globally in RootLayout. Rendered only for authenticated users.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { MicIcon, MicOffIcon, XIcon, Volume2Icon, AlertCircleIcon, LoaderIcon, VolumeXIcon } from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:      "#FFFFFF",
  sub:     "#F1F5F9",
  rim:     "#E2E8F0",
  blue:    "#1C62F2",
  blueDim: "rgba(28,98,242,0.08)",
  blueBdr: "rgba(28,98,242,0.20)",
  primary: "#0F172A",
  muted:   "#94A3B8",
  green:   "#22C55E",
  amber:   "#F59E0B",
  red:     "#EF4444",
  mono:    "'JetBrains Mono','IBM Plex Mono',monospace",
  ui:      "'Inter','IBM Plex Sans',sans-serif",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────
type Status = "idle" | "connecting" | "ready" | "listening" | "thinking" | "speaking" | "error";

interface TranscriptLine {
  id:   number;
  role: "user" | "assistant" | "system";
  text: string;
}

interface FnEvent {
  name:   string;
  status: "calling" | "done";
}

let _lineId = 0;

// ── Speech Recognition shim ───────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionCtor = new () => any;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface VoiceTerminalProps {
  token: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function VoiceTerminal({ token }: VoiceTerminalProps) {
  const [open,       setOpen]       = useState(false);
  const [status,     setStatus]     = useState<Status>("idle");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [fn,         setFn]         = useState<FnEvent | null>(null);
  const [errMsg,     setErrMsg]     = useState<string | null>(null);
  const [textInput,  setTextInput]  = useState("");
  const [voiceOn,    setVoiceOn]    = useState(true); // TTS toggle

  const wsRef          = useRef<WebSocket | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const transcriptEnd  = useRef<HTMLDivElement | null>(null);
  // Mirror of status for use inside WS closures (avoids stale state capture)
  const statusRef      = useRef<Status>("idle");
  const voiceOnRef     = useRef(true);

  // ── Keep refs in sync ────────────────────────────────────────────────────
  useEffect(() => { statusRef.current = status; },  [status]);
  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);

  // ── Scroll transcript to bottom ──────────────────────────────────────────
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => { disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addLine(role: TranscriptLine["role"], text: string) {
    setTranscript(prev => [...prev, { id: ++_lineId, role, text }]);
  }

  // ── Text-to-speech ────────────────────────────────────────────────────────
  function speakText(text: string) {
    if (!voiceOnRef.current || typeof window === "undefined" || !window.speechSynthesis) return;
    // Cancel any in-progress speech
    window.speechSynthesis.cancel();

    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.95;
    utt.pitch = 1.0;
    // Prefer a natural English voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Samantha"))
    ) ?? voices.find(v => v.lang.startsWith("en")) ?? null;
    if (preferred) utt.voice = preferred;

    utt.onstart = () => setStatus("speaking");
    utt.onend   = () => {
      if (statusRef.current === "speaking") setStatus("ready");
    };
    utt.onerror = () => {
      if (statusRef.current === "speaking") setStatus("ready");
    };

    window.speechSynthesis.speak(utt);
  }

  function stopSpeaking() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (statusRef.current === "speaking") setStatus("ready");
  }

  // ── Connect WebSocket ─────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (wsRef.current) return;
    setStatus("connecting");
    setErrMsg(null);
    addLine("system", "Connecting to ORDR Voice…");

    // Derive WebSocket URL — strip trailing /api from NEXT_PUBLIC_API_URL
    const httpOrigin = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api")
      .replace(/\/api\/?$/, "");
    const wsOrigin = httpOrigin.replace(/^https/, "wss").replace(/^http/, "ws");
    const url = `${wsOrigin}/api/v1/voice/realtime?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      addLine("system", "Handshake OK — awaiting session");
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string);
        handleServerMessage(msg);
      } catch { /* ignore malformed */ }
    };

    ws.onerror = () => {
      setStatus("error");
      setErrMsg("Connection failed — check that the backend is running");
    };

    ws.onclose = (evt) => {
      addLine("system", `WS closed: code=${evt.code}`);
      if (statusRef.current !== "error") setStatus("idle");
      wsRef.current = null;
      stopRecognition();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function handleServerMessage(msg: Record<string, unknown>) {
    const type = msg.type as string;

    if (type === "session_ready") {
      setStatus("ready");
      addLine("system", "ORDR Voice ready — speak or type below");
    } else if (type === "transcript") {
      const role = msg.role as "user" | "assistant";
      const text = (msg.text as string)?.trim();
      if (!text) return;
      if (role === "assistant") {
        setStatus("speaking");
        addLine("assistant", text);
        speakText(text);
      } else {
        addLine("user", text);
      }
    } else if (type === "function_call") {
      setFn({ name: msg.name as string, status: msg.status as "calling" | "done" });
      if (msg.status === "done") setTimeout(() => setFn(null), 1500);
      // While Claude is fetching data, show "thinking"
      if (msg.status === "calling") setStatus("thinking");
    } else if (type === "error") {
      const message = msg.message as string;
      setStatus("error");
      setErrMsg(message);
      addLine("system", `Error: ${message}`);
    }
  }

  // ── SpeechRecognition mic ─────────────────────────────────────────────────
  const startRecognition = useCallback(() => {
    const SpeechRec = getSpeechRecognition();
    if (!SpeechRec) {
      addLine("system", "Speech recognition not supported in this browser — use text input");
      return;
    }
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Stop any ongoing speech when user starts talking
    stopSpeaking();

    const rec = new SpeechRec();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setStatus("listening");
      addLine("system", "Listening…");
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (evt: any) => {
      const text = evt.results[0]?.[0]?.transcript?.trim();
      if (!text) return;
      // Send to backend — transcript will echo back via server message
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "text", content: text }));
        addLine("user", text);
      }
      setStatus("thinking");
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (evt: any) => {
      if (evt.error === "no-speech") {
        addLine("system", "No speech detected — tap mic and try again");
      } else if (evt.error === "not-allowed" || evt.error === "permission-denied") {
        addLine("system", "Microphone permission denied — use text input below");
      } else {
        addLine("system", `Mic error: ${evt.error}`);
      }
      if (statusRef.current === "listening") setStatus("ready");
    };

    rec.onend = () => {
      recognitionRef.current = null;
      if (statusRef.current === "listening") setStatus("ready");
    };

    recognitionRef.current = rec;
    rec.start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopRecognition() {
    recognitionRef.current?.stop();
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    if (statusRef.current === "listening") setStatus("ready");
  }

  function disconnect() {
    stopRecognition();
    stopSpeaking();
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("idle");
  }

  // ── Toggle mic ───────────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    if (status === "listening") {
      stopRecognition();
    } else if (status === "ready") {
      startRecognition();
    } else if (status === "speaking") {
      stopSpeaking();
      startRecognition();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, startRecognition]);

  // ── Open / close panel ───────────────────────────────────────────────────
  const openPanel = useCallback(() => {
    setOpen(true);
    if (!wsRef.current) connect();
  }, [connect]);

  const closePanel = useCallback(() => {
    setOpen(false);
    disconnect();
    setTranscript([]);
    setErrMsg(null);
    setFn(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Send text message ─────────────────────────────────────────────────────
  const sendText = useCallback(() => {
    const text = textInput.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    // Interrupt any ongoing speech
    stopSpeaking();
    wsRef.current.send(JSON.stringify({ type: "text", content: text }));
    addLine("user", text);
    setTextInput("");
    setStatus("thinking");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textInput]);

  // ── Derived UI ────────────────────────────────────────────────────────────
  const dotColor =
    status === "error"      ? T.red   :
    status === "listening"  ? T.green :
    status === "speaking"   ? T.blue  :
    status === "thinking"   ? T.amber :
    status === "ready"      ? T.green :
    status === "connecting" ? T.amber :
    T.muted;

  const dotPulse = status === "listening" || status === "speaking" || status === "thinking";

  const micEnabled = status === "ready" || status === "listening" || status === "speaking";
  const inputEnabled = status === "ready" || status === "listening" || status === "thinking";

  const statusLabel =
    status === "idle"       ? "Click ↗ to open"          :
    status === "connecting" ? "Connecting…"               :
    status === "ready"      ? "Tap mic or type below"     :
    status === "listening"  ? "Listening… tap to stop"    :
    status === "thinking"   ? "ORDR is thinking…"         :
    status === "speaking"   ? "ORDR is speaking…"         :
                              "Error — check connection";

  const hasSpeechRec = !!getSpeechRecognition();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Floating trigger button ──────────────────────────────────────── */}
      {!open && (
        <button
          onClick={openPanel}
          aria-label="Open ORDR Voice assistant"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 9998,
            width: 48, height: 48, borderRadius: "50%",
            background: T.blue,
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 20px rgba(28,98,242,0.35)",
            transition: "transform 120ms, box-shadow 120ms",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
        >
          <MicIcon size={20} color="#fff" strokeWidth={2} />
        </button>
      )}

      {/* ── Voice panel ──────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          width: 360, height: 520,
          background: T.bg,
          border: `1px solid ${T.rim}`,
          borderRadius: 6,
          boxShadow: "0 8px 40px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>

          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px",
            background: T.sub,
            borderBottom: `1px solid ${T.rim}`,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Status dot */}
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: dotColor,
                animation: dotPulse ? "voice-pulse 1.2s ease-out infinite" : "none",
              }} />
              <span style={{
                fontFamily: T.mono, fontSize: 11, fontWeight: 700,
                letterSpacing: "0.18em", color: T.primary,
              }}>
                ORDR VOICE
              </span>
              <span style={{
                fontFamily: T.mono, fontSize: 9, letterSpacing: "0.1em",
                color: T.muted,
              }}>
                {status.toUpperCase()}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* TTS toggle */}
              <button
                onClick={() => { stopSpeaking(); setVoiceOn(v => !v); }}
                aria-label={voiceOn ? "Mute voice" : "Unmute voice"}
                title={voiceOn ? "Mute spoken replies" : "Enable spoken replies"}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", padding: 2, opacity: 0.6,
                }}
              >
                {voiceOn
                  ? <Volume2Icon size={13} color={T.blue} />
                  : <VolumeXIcon size={13} color={T.muted} />
                }
              </button>
              <button
                onClick={closePanel}
                aria-label="Close voice assistant"
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", padding: 2,
                }}
              >
                <XIcon size={14} color={T.muted} />
              </button>
            </div>
          </div>

          {/* Transcript */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "12px 14px",
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            {transcript.length === 0 && status === "connecting" && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                color: T.muted, fontFamily: T.mono, fontSize: 11,
              }}>
                <LoaderIcon size={12} style={{ animation: "spin 1s linear infinite" }} />
                Connecting…
              </div>
            )}

            {transcript.map(line => (
              <div key={line.id} style={{
                alignSelf:
                  line.role === "user"   ? "flex-end" :
                  line.role === "system" ? "center"   : "flex-start",
                maxWidth: "85%",
              }}>
                {line.role === "system" ? (
                  <span style={{
                    fontFamily: T.mono, fontSize: 10, color: T.muted,
                    letterSpacing: "0.08em",
                  }}>
                    {line.text}
                  </span>
                ) : (
                  <div style={{
                    padding: "8px 12px",
                    background: line.role === "user" ? T.blue : T.sub,
                    borderRadius: line.role === "user" ? "12px 12px 3px 12px" : "3px 12px 12px 12px",
                    border: line.role === "user" ? "none" : `1px solid ${T.rim}`,
                  }}>
                    <p style={{
                      margin: 0,
                      fontFamily: T.ui, fontSize: 13, lineHeight: 1.5,
                      color: line.role === "user" ? "#fff" : T.primary,
                    }}>
                      {line.text}
                    </p>
                  </div>
                )}
              </div>
            ))}

            {/* Thinking / function-call indicator */}
            {(fn || status === "thinking") && (
              <div style={{
                alignSelf: "center",
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px",
                background: T.blueDim,
                border: `1px solid ${T.blueBdr}`,
                borderRadius: 10,
              }}>
                {fn?.status === "done"
                  ? <Volume2Icon size={10} color={T.blue} />
                  : <LoaderIcon size={10} color={T.blue} style={{ animation: "spin 1s linear infinite" }} />
                }
                <span style={{ fontFamily: T.mono, fontSize: 9, color: T.blue, letterSpacing: "0.1em" }}>
                  {fn
                    ? (fn.status === "calling" ? `Calling ${fn.name}…` : `${fn.name} done`)
                    : "ORDR is thinking…"
                  }
                </span>
              </div>
            )}

            {/* Error + Reconnect */}
            {errMsg && (
              <div style={{
                display: "flex", flexDirection: "column", gap: 6,
                padding: "8px 10px",
                background: "rgba(239,68,68,0.06)",
                border: "1px solid rgba(239,68,68,0.20)",
                borderRadius: 4,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <AlertCircleIcon size={12} color={T.red} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontFamily: T.ui, fontSize: 12, color: T.red }}>{errMsg}</span>
                </div>
                <button
                  onClick={() => { setErrMsg(null); setTranscript([]); connect(); }}
                  style={{
                    alignSelf: "flex-start",
                    fontFamily: T.mono, fontSize: 10, letterSpacing: "0.1em",
                    background: T.red, color: "#fff", border: "none",
                    borderRadius: 3, padding: "4px 10px", cursor: "pointer",
                  }}
                >
                  RECONNECT
                </button>
              </div>
            )}

            <div ref={transcriptEnd} />
          </div>

          {/* Controls */}
          <div style={{
            borderTop: `1px solid ${T.rim}`,
            padding: "10px 14px",
            flexShrink: 0,
          }}>
            {/* Mic button row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <button
                onClick={toggleMic}
                disabled={!micEnabled}
                aria-label={status === "listening" ? "Stop microphone" : "Start microphone"}
                title={!hasSpeechRec ? "Speech recognition not supported in this browser" : undefined}
                style={{
                  width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                  background: status === "listening"
                    ? "rgba(239,68,68,0.10)"
                    : T.blueDim,
                  border: `1px solid ${status === "listening" ? "rgba(239,68,68,0.30)" : T.blueBdr}`,
                  cursor: micEnabled ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: micEnabled ? 1 : 0.4,
                  transition: "all 150ms",
                }}
              >
                {status === "listening"
                  ? <MicOffIcon size={16} color={T.red} />
                  : <MicIcon    size={16} color={T.blue} />
                }
              </button>
              <span style={{
                fontFamily: T.mono, fontSize: 10, color: T.muted,
                letterSpacing: "0.08em", flex: 1,
              }}>
                {statusLabel}
              </span>
            </div>

            {/* Text input */}
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") sendText(); }}
                placeholder="Type a message…"
                disabled={!inputEnabled}
                style={{
                  flex: 1, fontFamily: T.mono, fontSize: 12, color: T.primary,
                  background: T.sub, border: `1px solid ${T.rim}`,
                  borderRadius: 3, padding: "7px 10px", outline: "none",
                  minWidth: 0,
                  opacity: inputEnabled ? 1 : 0.5,
                }}
              />
              <button
                onClick={sendText}
                disabled={!textInput.trim() || !inputEnabled}
                style={{
                  fontFamily: T.mono, fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "#fff", background: T.blue,
                  border: "none", borderRadius: 3,
                  padding: "7px 12px", cursor: "pointer",
                  opacity: (!textInput.trim() || !inputEnabled) ? 0.4 : 1,
                  transition: "opacity 120ms",
                }}
              >
                SEND
              </button>
            </div>

            {/* Browser hint */}
            {!hasSpeechRec && status === "ready" && (
              <p style={{
                margin: "6px 0 0", fontFamily: T.mono, fontSize: 9,
                color: T.muted, letterSpacing: "0.06em",
              }}>
                Voice input requires Chrome or Edge. Text input works in all browsers.
              </p>
            )}
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
