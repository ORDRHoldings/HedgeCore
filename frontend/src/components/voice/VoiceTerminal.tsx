"use client";

/**
 * VoiceTerminal — Floating voice assistant powered by OpenAI Realtime API.
 *
 * Audio pipeline:
 *   Mic → AudioContext (24kHz) → AudioWorklet → Int16 → base64
 *      → WebSocket → backend → OpenAI Realtime API
 *      → PCM16 audio → WebSocket → base64 → Int16 → Float32
 *      → AudioContext → Speaker
 *
 * Mounted globally in RootLayout. Rendered only for authenticated users.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { MicIcon, MicOffIcon, XIcon, Volume2Icon, AlertCircleIcon, LoaderIcon } from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:      "#FFFFFF",
  sub:     "#F1F5F9",
  rim:     "#E2E8F0",
  soft:    "#CBD5E1",
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
type Status = "idle" | "connecting" | "ready" | "listening" | "speaking" | "error";

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

// ── Audio helpers ─────────────────────────────────────────────────────────────
function int16ToFloat32(buffer: ArrayBuffer): Float32Array<ArrayBuffer> {
  const view = new Int16Array(buffer);
  // Allocate explicitly as Float32Array<ArrayBuffer> (required by copyToChannel)
  const out  = new Float32Array(new ArrayBuffer(view.length * 4));
  for (let i = 0; i < view.length; i++) {
    out[i] = view[i] / (view[i] < 0 ? 32768 : 32767);
  }
  return out;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin  = atob(b64);
  const buf  = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
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

  const wsRef          = useRef<WebSocket | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const transcriptEnd  = useRef<HTMLDivElement | null>(null);
  // Mirror of status for use inside WS closures (avoids stale state capture)
  const statusRef      = useRef<Status>("idle");

  // Audio playback queue — must be Float32Array<ArrayBuffer> for copyToChannel
  const playQueueRef   = useRef<Float32Array<ArrayBuffer>[]>([]);
  const playingRef     = useRef(false);

  // ── Keep statusRef in sync so WS closures always see current status ─────
  useEffect(() => { statusRef.current = status; }, [status]);

  // ── Scroll transcript to bottom ──────────────────────────────────────────
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => { disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── PCM16 audio playback ──────────────────────────────────────────────────
  const schedulePlayback = useCallback((samples: Float32Array<ArrayBuffer>) => {
    playQueueRef.current.push(samples);
    if (!playingRef.current) drainQueue();
  }, []);

  function drainQueue() {
    if (!audioCtxRef.current || playQueueRef.current.length === 0) {
      playingRef.current = false;
      return;
    }
    playingRef.current = true;
    const ctx    = audioCtxRef.current;
    const chunk  = playQueueRef.current.shift()!;
    const buf    = ctx.createBuffer(1, chunk.length, 24_000);
    buf.copyToChannel(chunk, 0);
    const src    = ctx.createBufferSource();
    src.buffer   = buf;
    src.connect(ctx.destination);
    src.onended  = drainQueue;
    src.start();
    setStatus("speaking");
    if (playQueueRef.current.length === 0) {
      src.onended = () => { playingRef.current = false; setStatus("ready"); };
    }
  }

  // ── Connect WebSocket ─────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (wsRef.current) return;
    setStatus("connecting");
    setErrMsg(null);
    addLine("system", "Connecting to ORDR Voice...");

    // Initialize AudioContext on connect so text responses can play audio.
    // Must happen inside a user-gesture callback — openPanel satisfies this.
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new AudioContext({ sampleRate: 24_000 });
      } catch { /* non-fatal — audio will be silent */ }
    }

    // Derive WebSocket URL — strip trailing /api from NEXT_PUBLIC_API_URL
    // (that var already contains /api, so we must not double it)
    const httpOrigin = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api")
      .replace(/\/api\/?$/, "");
    const wsOrigin = httpOrigin.replace(/^https/, "wss").replace(/^http/, "ws");
    const url = `${wsOrigin}/api/v1/voice/realtime?token=${encodeURIComponent(token)}`;

    // Show URL in transcript so connection issues are immediately visible
    addLine("system", `WS → ${wsOrigin}/api/v1/voice/realtime`);

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
      setErrMsg("WebSocket error — check DevTools Network → WS tab for details");
      addLine("system", "ws.onerror fired (transport error or server rejected upgrade)");
    };

    ws.onclose = (evt) => {
      addLine("system", `WS closed: code=${evt.code} reason=${evt.reason || "none"}`);
      if (statusRef.current !== "error") setStatus("idle");
      wsRef.current = null;
      stopMic();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function handleServerMessage(msg: Record<string, unknown>) {
    const type = msg.type as string;

    if (type === "session_ready") {
      setStatus("ready");
      addLine("system", "ORDR Voice ready — speak or type below");
    } else if (type === "audio_chunk") {
      const samples = int16ToFloat32(base64ToArrayBuffer(msg.data as string));
      schedulePlayback(samples);
    } else if (type === "transcript") {
      const role = msg.role as "user" | "assistant";
      const text = msg.text as string;
      if (text?.trim()) addLine(role, text.trim());
    } else if (type === "function_call") {
      setFn({ name: msg.name as string, status: msg.status as "calling" | "done" });
      if (msg.status === "done") setTimeout(() => setFn(null), 1500);
    } else if (type === "input_audio_committed") {
      setStatus("ready"); // VAD detected silence — model is processing
    } else if (type === "error") {
      const message = msg.message as string;
      setStatus("error");
      setErrMsg(message);
      addLine("system", `Error: ${message}`);
    }
  }

  function addLine(role: TranscriptLine["role"], text: string) {
    setTranscript(prev => [...prev, { id: ++_lineId, role, text }]);
  }

  // ── Start microphone ──────────────────────────────────────────────────────
  const startMic = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 24_000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 24_000 });
      audioCtxRef.current = ctx;

      await ctx.audioWorklet.addModule("/pcm16-processor.js");

      const source = ctx.createMediaStreamSource(stream);
      const node   = new AudioWorkletNode(ctx, "pcm16-processor");
      workletNodeRef.current = node;

      node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "audio_chunk",
            data: arrayBufferToBase64(e.data),
          }));
        }
      };

      source.connect(node);
      // Note: don't connect node to destination (no mic monitoring)

      setStatus("listening");
      addLine("system", "Microphone active — speak now");
    } catch (err) {
      // Mic failure does NOT kill the session — text input remains usable.
      const reason = err instanceof Error ? err.message : String(err);
      addLine("system", `Microphone unavailable: ${reason} — use text input below`);
      // Stay at "ready" so text input stays enabled
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopMic() {
    workletNodeRef.current?.port.postMessage("stop");
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (status === "listening") setStatus("ready");
  }

  function disconnect() {
    stopMic();
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    playQueueRef.current = [];
    playingRef.current = false;
    setStatus("idle");
  }

  // ── Toggle mic ───────────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    if (status === "listening") {
      stopMic();
    } else if (status === "ready") {
      startMic();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, startMic]);

  // ── Open panel ───────────────────────────────────────────────────────────
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
    if (!textInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "text", content: textInput.trim() }));
    addLine("user", textInput.trim());
    setTextInput("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textInput]);

  // ── Status indicator color ────────────────────────────────────────────────
  const dotColor =
    status === "error"      ? T.red   :
    status === "listening"  ? T.green :
    status === "speaking"   ? T.blue  :
    status === "ready"      ? T.green :
    status === "connecting" ? T.amber :
    T.muted;

  const dotPulse = status === "listening" || status === "speaking";

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
                boxShadow: dotPulse ? `0 0 0 0 ${dotColor}` : "none",
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

            {/* Function call indicator */}
            {fn && (
              <div style={{
                alignSelf: "center",
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px",
                background: T.blueDim,
                border: `1px solid ${T.blueBdr}`,
                borderRadius: 10,
              }}>
                {fn.status === "calling"
                  ? <LoaderIcon size={10} color={T.blue} style={{ animation: "spin 1s linear infinite" }} />
                  : <Volume2Icon size={10} color={T.blue} />
                }
                <span style={{ fontFamily: T.mono, fontSize: 9, color: T.blue, letterSpacing: "0.1em" }}>
                  {fn.status === "calling" ? `Calling ${fn.name}…` : `${fn.name} done`}
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
                disabled={status !== "ready" && status !== "listening"}
                aria-label={status === "listening" ? "Stop microphone" : "Start microphone"}
                style={{
                  width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                  background: status === "listening"
                    ? "rgba(239,68,68,0.10)"
                    : T.blueDim,
                  border: `1px solid ${status === "listening" ? "rgba(239,68,68,0.30)" : T.blueBdr}`,
                  cursor: (status === "ready" || status === "listening") ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: (status === "ready" || status === "listening") ? 1 : 0.4,
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
                {status === "idle"       ? "Click ↗ to open"        :
                 status === "connecting" ? "Connecting…"             :
                 status === "ready"      ? "Tap mic or type below"   :
                 status === "listening"  ? "Listening… tap to stop"  :
                 status === "speaking"   ? "ORDR is speaking…"       :
                                          "Error — check connection" }
              </span>
            </div>

            {/* Text input */}
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") sendText(); }}
                placeholder="Type a message…"
                disabled={status !== "ready" && status !== "listening"}
                style={{
                  flex: 1, fontFamily: T.mono, fontSize: 12, color: T.primary,
                  background: T.sub, border: `1px solid ${T.rim}`,
                  borderRadius: 3, padding: "7px 10px", outline: "none",
                  minWidth: 0,
                }}
              />
              <button
                onClick={sendText}
                disabled={!textInput.trim() || (status !== "ready" && status !== "listening")}
                style={{
                  fontFamily: T.mono, fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "#fff", background: T.blue,
                  border: "none", borderRadius: 3,
                  padding: "7px 12px", cursor: "pointer",
                  opacity: (!textInput.trim() || (status !== "ready" && status !== "listening")) ? 0.4 : 1,
                  transition: "opacity 120ms",
                }}
              >
                SEND
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes voice-pulse {
          0%   { box-shadow: 0 0 0 0 currentColor; }
          70%  { box-shadow: 0 0 0 6px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
