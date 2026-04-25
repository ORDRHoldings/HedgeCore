/**
 * useRealtimeVoice — React hook for OpenAI Realtime API via WebRTC.
 *
 * Flow:
 *   1. POST /api/v1/voice/token → ephemeral key
 *   2. RTCPeerConnection: mic track (input) + audio track (output)
 *   3. DataChannel "oai-events": send/receive Realtime events (text, tool calls)
 *   4. SDP offer → POST api.openai.com/v1/realtime/calls → SDP answer
 *
 * Audio is handled natively by WebRTC — no manual PCM16 encoding needed.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { executeToolCall, isMutatingTool } from "@/hooks/useRealtimeTools";

// ── Types ───────────────────────────────────────────────────────────────────

export type VoiceStatus =
  | "disconnected"
  | "connecting"
  | "ready"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export interface TranscriptEntry {
  id: number;
  role: "user" | "assistant" | "system";
  text: string;
  final: boolean;
}

export interface FunctionCallEvent {
  name: string;
  status: "calling" | "done";
}

export interface PendingConfirmation {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  approve: () => void;
  deny: () => void;
}

// ── WORM transcript batching ────────────────────────────────────────────────

interface AuditTurn {
  role: "user" | "assistant";
  text: string;
  at: string;
}

interface AuditToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result_summary: string;
  status: "ok" | "error" | "confirmation_required";
  at: string;
}

interface AuditBuffer {
  session_id: string;
  transport: "openai-realtime";
  model: string;
  session_start: string | null;
  turns: AuditTurn[];
  tool_calls: AuditToolCall[];
  disclosure_ack: boolean;
  disclosure_text: string | null;
  // EU AI Act Art. 14 + SR 11-7 human oversight — user invoked the
  // "talk to a human" escape hatch. Flushed as VOICE_HUMAN_HANDOFF.
  handoff_requested: boolean;
  handoff_reason: string | null;
  // Provenance manifest from POST /v1/voice/token — sent only on the
  // first flush (the one carrying session_start) so auditors can replay
  // exactly which model + prompt + tools were active.
  model_id: string | null;
  instructions_sha256: string | null;
  tools_sha256: string | null;
}

const _FLUSH_TURN_THRESHOLD = 10;
const _MAX_RESULT_SUMMARY_LEN = 240;

// ── Auto-reconnect on ICE failure ───────────────────────────────────────────
// 1s, 3s, 8s backoff — three tries, then surface error. Each reconnect is a
// fresh OpenAI session (the Realtime API has no resume); audit chain shows
// clean session_end → session_start so reviewers can see the gap.
const _RECONNECT_BACKOFFS_MS: readonly number[] = [1000, 3000, 8000];

function _makeBuffer(model: string): AuditBuffer {
  return {
    session_id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    transport: "openai-realtime",
    model,
    session_start: null,
    turns: [],
    tool_calls: [],
    disclosure_ack: false,
    disclosure_text: null,
    handoff_requested: false,
    handoff_reason: null,
    model_id: null,
    instructions_sha256: null,
    tools_sha256: null,
  };
}

interface UseRealtimeVoiceOptions {
  token: string;
  onTranscript?: (entry: TranscriptEntry) => void;
  onFunctionCall?: (evt: FunctionCallEvent) => void;
  onConfirmRequired?: (pending: PendingConfirmation) => void;
  onError?: (message: string) => void;
}

interface UseRealtimeVoiceReturn {
  connect: () => Promise<void>;
  disconnect: () => void;
  sendText: (text: string) => void;
  toggleMic: () => void;
  isMicOn: boolean;
  status: VoiceStatus;
  /**
   * Mark the AI disclosure (EU AI Act Art. 52) as acknowledged by the user.
   * Emits a VOICE_AI_DISCLOSURE_ACK audit event on the next flush.
   */
  acknowledgeDisclosure: (text: string) => void;
  /**
   * Invoke the "talk to a human" escape hatch. Emits a VOICE_HUMAN_HANDOFF
   * audit event then tears down the WebRTC session. Required by EU AI Act
   * Art. 14 (human oversight) and Fed SR 11-7.
   */
  requestHumanHandoff: (reason?: string) => void;
}

let _entryId = 0;

// ── Hook ────────────────────────────────────────────────────────────────────

export function useRealtimeVoice(options: UseRealtimeVoiceOptions): UseRealtimeVoiceReturn {
  const { token, onTranscript, onFunctionCall, onConfirmRequired, onError } = options;

  const [status, setStatus] = useState<VoiceStatus>("disconnected");
  const [isMicOn, setIsMicOn] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const statusRef = useRef<VoiceStatus>("disconnected");
  // Session config received from backend (instructions + tools)
  const sessionConfigRef = useRef<{ instructions: string; tools: Record<string, unknown>[] } | null>(null);

  // Partial transcript accumulator
  const assistantTextRef = useRef("");
  const assistantEntryIdRef = useRef(0);

  // WORM audit buffer — accumulates turns + tool calls, flushed on
  // (a) every _FLUSH_TURN_THRESHOLD finalized turns, (b) disconnect, (c) page hide.
  const auditBufRef = useRef<AuditBuffer | null>(null);

  // Auto-reconnect state. Lives in refs so async ICE callbacks see fresh values.
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<(() => Promise<void>) | null>(null);

  const flushAudit = useCallback(
    async (closeSession: boolean): Promise<void> => {
      const buf = auditBufRef.current;
      if (!buf) return;
      const hasContent =
        buf.session_start !== null ||
        buf.turns.length > 0 ||
        buf.tool_calls.length > 0 ||
        buf.disclosure_ack ||
        buf.handoff_requested;
      // Skip mid-session no-op flushes; on close, always emit session_end.
      if (!closeSession && !hasContent) return;

      const payload: Record<string, unknown> = {
        session_id: buf.session_id,
        transport: buf.transport,
        model: buf.model,
        turns: buf.turns,
        tool_calls: buf.tool_calls,
      };
      if (buf.session_start) {
        payload.session_start = buf.session_start;
        // Manifest fields ride with VOICE_SESSION_START — only sent once.
        if (buf.model_id) payload.model_id = buf.model_id;
        if (buf.instructions_sha256) payload.instructions_sha256 = buf.instructions_sha256;
        if (buf.tools_sha256) payload.tools_sha256 = buf.tools_sha256;
      }
      if (closeSession) payload.session_end = new Date().toISOString();
      if (buf.disclosure_ack) {
        payload.disclosure_ack = true;
        if (buf.disclosure_text) payload.disclosure_text = buf.disclosure_text;
      }
      if (buf.handoff_requested) {
        payload.handoff_requested = true;
        if (buf.handoff_reason) payload.handoff_reason = buf.handoff_reason;
      }

      // Drain so we don't double-log on retries
      buf.session_start = null;
      buf.turns = [];
      buf.tool_calls = [];
      buf.disclosure_ack = false;
      buf.disclosure_text = null;
      buf.handoff_requested = false;
      buf.handoff_reason = null;
      buf.model_id = null;
      buf.instructions_sha256 = null;
      buf.tools_sha256 = null;

      try {
        await dashboardFetch("/v1/voice/transcript", token, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.warn("[ORDR Voice] audit flush failed (non-fatal):", err);
      }
    },
    [token],
  );

  const recordTurn = useCallback(
    (role: "user" | "assistant", text: string) => {
      const buf = auditBufRef.current;
      if (!buf || !text) return;
      buf.turns.push({ role, text, at: new Date().toISOString() });
      if (buf.turns.length >= _FLUSH_TURN_THRESHOLD) {
        void flushAudit(false);
      }
    },
    [flushAudit],
  );

  const recordToolCall = useCallback(
    (
      name: string,
      args: Record<string, unknown>,
      result: string,
      status: "ok" | "error" | "confirmation_required",
    ) => {
      const buf = auditBufRef.current;
      if (!buf) return;
      const summary = result.length > _MAX_RESULT_SUMMARY_LEN
        ? `${result.slice(0, _MAX_RESULT_SUMMARY_LEN)}…`
        : result;
      buf.tool_calls.push({
        name,
        arguments: args,
        result_summary: summary,
        status,
        at: new Date().toISOString(),
      });
    },
    [],
  );

  const updateStatus = useCallback((s: VoiceStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const emitTranscript = useCallback(
    (role: TranscriptEntry["role"], text: string, final: boolean, id?: number) => {
      onTranscript?.({ id: id ?? ++_entryId, role, text, final });
    },
    [onTranscript],
  );

  // ── Auto-reconnect plumbing ─────────────────────────────────────────────

  const cancelReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
  }, []);

  const teardownPeer = useCallback(() => {
    // WebRTC + mic teardown only — no audit flush, no panel close.
    // Used between reconnect attempts so the UX stays continuous (panel
    // open, transcript preserved, disclosure ack already in localStorage).
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.getSenders().forEach((s) => {
      if (s.track) s.track.stop();
    });
    pcRef.current?.close();
    pcRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    setIsMicOn(false);
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return; // already scheduled — don't double-fire on cascading ICE events
    const attemptIdx = reconnectAttemptsRef.current;
    if (attemptIdx >= _RECONNECT_BACKOFFS_MS.length) {
      cancelReconnect();
      teardownPeer();
      updateStatus("error");
      onError?.("Voice connection lost — please reconnect manually.");
      return;
    }
    reconnectAttemptsRef.current = attemptIdx + 1;
    const backoffMs = _RECONNECT_BACKOFFS_MS[attemptIdx];

    emitTranscript(
      "system",
      `Connection lost — retrying (${attemptIdx + 1}/${_RECONNECT_BACKOFFS_MS.length}) in ${Math.round(backoffMs / 1000)}s…`,
      true,
    );
    updateStatus("connecting");

    // Close the broken session cleanly so the audit chain has a session_end.
    void flushAudit(true);
    auditBufRef.current = null;
    teardownPeer();

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      void connectRef.current?.();
    }, backoffMs);
  }, [cancelReconnect, updateStatus, emitTranscript, flushAudit, teardownPeer, onError]);

  // ── Send event via data channel ─────────────────────────────────────────

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    dc.send(JSON.stringify(event));
  }, []);

  // ── Handle incoming Realtime events ─────────────────────────────────────

  const handleEvent = useCallback(
    async (event: Record<string, unknown>) => {
      const type = event.type as string;

      switch (type) {
        case "session.created":
        case "session.updated":
          updateStatus("ready");
          emitTranscript("system", "ORDR Voice ready — speak or type below", true);
          break;

        case "response.audio_transcript.delta":
        case "response.text.delta": {
          const delta = event.delta as string;
          assistantTextRef.current += delta;
          emitTranscript(
            "assistant",
            assistantTextRef.current,
            false,
            assistantEntryIdRef.current,
          );
          break;
        }

        case "response.audio_transcript.done":
        case "response.text.done": {
          const finalText = (event.transcript as string) ?? (event.text as string) ?? assistantTextRef.current;
          emitTranscript("assistant", finalText, true, assistantEntryIdRef.current);
          recordTurn("assistant", finalText);
          assistantTextRef.current = "";
          assistantEntryIdRef.current = ++_entryId;
          break;
        }

        case "conversation.item.input_audio_transcription.completed": {
          const userText = (event.transcript as string)?.trim();
          if (userText) {
            emitTranscript("user", userText, true);
            recordTurn("user", userText);
          }
          break;
        }

        case "response.function_call_arguments.done": {
          const callId = event.call_id as string;
          const fnName = event.name as string;
          const fnArgs = JSON.parse((event.arguments as string) ?? "{}");

          const completeCall = async (
            result: string,
            recordedStatus: "ok" | "error" | "confirmation_required",
          ) => {
            recordToolCall(fnName, fnArgs, result, recordedStatus);
            onFunctionCall?.({ name: fnName, status: "done" });
            sendEvent({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: callId,
                output: result,
              },
            });
            sendEvent({ type: "response.create" });
          };

          // Mutating tools require explicit user click before execution.
          if (isMutatingTool(fnName)) {
            // Audit the request for confirmation immediately so the WORM
            // chain reflects the intent even if the user never decides.
            recordToolCall(
              fnName,
              fnArgs,
              JSON.stringify({ pending: true }),
              "confirmation_required",
            );
            updateStatus("ready");
            onFunctionCall?.({ name: fnName, status: "done" });
            onConfirmRequired?.({
              callId,
              name: fnName,
              arguments: fnArgs,
              approve: async () => {
                onFunctionCall?.({ name: fnName, status: "calling" });
                updateStatus("processing");
                const result = await executeToolCall(fnName, fnArgs, token);
                const status: "ok" | "error" = (() => {
                  try {
                    const parsed = JSON.parse(result);
                    return parsed && typeof parsed === "object" && "error" in parsed
                      ? "error"
                      : "ok";
                  } catch {
                    return "ok";
                  }
                })();
                await completeCall(result, status);
              },
              deny: async () => {
                const denied = JSON.stringify({
                  error: "User denied execution",
                });
                await completeCall(denied, "error");
              },
            });
            break;
          }

          onFunctionCall?.({ name: fnName, status: "calling" });
          updateStatus("processing");

          const result = await executeToolCall(fnName, fnArgs, token);
          const toolStatus: "ok" | "error" = (() => {
            try {
              const parsed = JSON.parse(result);
              return parsed && typeof parsed === "object" && "error" in parsed
                ? "error"
                : "ok";
            } catch {
              return "ok";
            }
          })();
          await completeCall(result, toolStatus);
          break;
        }

        case "error": {
          const errData = event.error as Record<string, unknown> | undefined;
          const message = (errData?.message as string) ?? "Unknown error";
          updateStatus("error");
          onError?.(message);
          emitTranscript("system", `Error: ${message}`, true);
          break;
        }

        case "input_audio_buffer.speech_started":
          updateStatus("listening");
          break;

        case "input_audio_buffer.speech_stopped":
          updateStatus("processing");
          break;

        case "response.audio.started":
          updateStatus("speaking");
          break;

        case "response.done":
          if (statusRef.current !== "speaking") updateStatus("ready");
          break;

        case "response.audio.done":
          updateStatus("ready");
          break;
      }
    },
    [token, updateStatus, emitTranscript, sendEvent, onFunctionCall, onConfirmRequired, onError, recordTurn, recordToolCall],
  );

  // ── Connect ─────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (pcRef.current) return;
    updateStatus("connecting");
    emitTranscript("system", "Connecting to ORDR Voice…", true);

    // Open a fresh audit buffer for this session
    auditBufRef.current = _makeBuffer("gpt-realtime");
    auditBufRef.current.session_start = new Date().toISOString();

    try {
      // 1. Get ephemeral token from backend
      const resp = await dashboardFetch("/v1/voice/token", token, { method: "POST" });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(`Token request failed: ${resp.status} ${detail.slice(0, 200)}`);
      }
      const tokenData = await resp.json();
      const ephemeralKey = tokenData.token;
      // Store session config for session.update after data channel opens
      sessionConfigRef.current = {
        instructions: tokenData.instructions ?? "",
        tools: tokenData.tools ?? [],
      };

      // Stamp the audit buffer with the provenance manifest so the very
      // first flush (carrying session_start) takes it to the WORM chain.
      if (auditBufRef.current) {
        auditBufRef.current.model_id = tokenData.model_id ?? null;
        auditBufRef.current.instructions_sha256 = tokenData.instructions_sha256 ?? null;
        auditBufRef.current.tools_sha256 = tokenData.tools_sha256 ?? null;
        if (tokenData.model_id) {
          auditBufRef.current.model = tokenData.model_id;
        }
      }

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // ICE failure → auto-reconnect with backoff. "disconnected" is a
      // transient warning state (per WebRTC spec, can self-recover); only
      // "failed" is terminal — that's our retry trigger.
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") {
          scheduleReconnect();
        }
      };

      // 3. Set up remote audio playback
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioElRef.current = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // 4. Add local audio track (mic or transceiver fallback — SDP requires audio section)
      let hasMic = false;
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = micStream;
        pc.addTrack(micStream.getTracks()[0]);
        hasMic = true;
        setIsMicOn(true);
      } catch {
        // No mic — add a recvonly audio transceiver so SDP has an audio m= line
        pc.addTransceiver("audio", { direction: "recvonly" });
        emitTranscript("system", "No microphone found — text-only mode", true);
        setIsMicOn(false);
      }

      // 5. Create data channel for events
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.addEventListener("open", () => {
        // Send session.update with instructions + tools
        const cfg = sessionConfigRef.current;
        if (cfg) {
          dc.send(JSON.stringify({
            type: "session.update",
            session: {
              type: "realtime",
              instructions: cfg.instructions,
              tools: cfg.tools,
            },
          }));
        }
        updateStatus("ready");
        emitTranscript("system", "ORDR Voice ready — speak or type below", true);
      });

      dc.addEventListener("message", (e) => {
        try {
          const event = JSON.parse(e.data);
          handleEvent(event);
        } catch {
          // ignore malformed
        }
      });

      // 6. SDP offer → OpenAI → SDP answer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const model = "gpt-realtime";
      const sdpResp = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${model}`,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            "Content-Type": "application/sdp",
          },
        },
      );

      if (!sdpResp.ok) {
        const errText = await sdpResp.text();
        throw new Error(`SDP negotiation failed: ${sdpResp.status} ${errText.slice(0, 200)}`);
      }

      const answerSdp = await sdpResp.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      // Reaching here = SDP exchange succeeded. Reset reconnect counter
      // so a future drop gets the full retry budget again.
      reconnectAttemptsRef.current = 0;

      emitTranscript("system", "Connected — session active", true);
    } catch (err) {
      updateStatus("error");
      const msg = err instanceof Error ? err.message : String(err);
      onError?.(msg);
      emitTranscript("system", `Connection failed: ${msg}`, true);
      // The connection attempt failed before SDP completed — count it as
      // a reconnect attempt and try again unless we've exhausted the budget.
      scheduleReconnect();
    }
  }, [token, updateStatus, emitTranscript, handleEvent, onError, scheduleReconnect]);

  // Keep connectRef pointing at the latest connect closure — scheduleReconnect's
  // setTimeout uses this to break the circular dep between reconnect and connect.
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // ── Disconnect ──────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    // User-initiated disconnect: cancel any pending auto-reconnect first.
    cancelReconnect();

    // Final WORM flush with session_end before tearing down WebRTC
    void flushAudit(true);
    auditBufRef.current = null;

    // Close data channel
    dcRef.current?.close();
    dcRef.current = null;

    // Stop mic tracks
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    setIsMicOn(false);

    // Close peer connection
    pcRef.current?.getSenders().forEach((sender) => {
      if (sender.track) sender.track.stop();
    });
    pcRef.current?.close();
    pcRef.current = null;

    // Clean up audio element
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current = null;
    }

    updateStatus("disconnected");
  }, [updateStatus, flushAudit, cancelReconnect]);

  // Flush audit on tab hide / page unload — survives browser crashes mid-session
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushAudit(false);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [flushAudit]);

  // ── Send text ───────────────────────────────────────────────────────────

  const sendText = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      emitTranscript("user", text.trim(), true);
      recordTurn("user", text.trim());
      updateStatus("processing");

      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: text.trim() }],
        },
      });
      sendEvent({ type: "response.create" });
    },
    [emitTranscript, updateStatus, sendEvent, recordTurn],
  );

  // ── AI disclosure (EU AI Act Art. 52) ───────────────────────────────────

  const acknowledgeDisclosure = useCallback((text: string) => {
    const buf = auditBufRef.current;
    if (!buf) return;
    if (buf.disclosure_ack) return; // already recorded for this session
    buf.disclosure_ack = true;
    buf.disclosure_text = text;
    // Flush soon so the ack reaches the WORM chain even if the user
    // immediately closes the panel.
    void flushAudit(false);
  }, [flushAudit]);

  // ── Human handoff (EU AI Act Art. 14 / SR 11-7) ─────────────────────────

  const requestHumanHandoff = useCallback(
    (reason?: string) => {
      const buf = auditBufRef.current;
      if (buf && !buf.handoff_requested) {
        buf.handoff_requested = true;
        buf.handoff_reason = (reason ?? "").trim() || null;
      }
      // disconnect() flushes with session_end; the handoff flag rides along.
      emitTranscript(
        "system",
        "Voice session ended — a human operator has been notified.",
        true,
      );
      disconnect();
    },
    [emitTranscript, disconnect],
  );

  // ── Toggle mic ──────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const stream = micStreamRef.current;
    if (!stream) return;

    const track = stream.getTracks()[0];
    if (!track) return;

    track.enabled = !track.enabled;
    setIsMicOn(track.enabled);
  }, []);

  return {
    connect,
    disconnect,
    sendText,
    toggleMic,
    isMicOn,
    status,
    acknowledgeDisclosure,
    requestHumanHandoff,
  };
}
