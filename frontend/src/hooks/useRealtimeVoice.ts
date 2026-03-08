/**
 * useRealtimeVoice — React hook for OpenAI Realtime API voice interaction.
 *
 * Manages:
 *   - Ephemeral token acquisition from backend
 *   - WebSocket connection to OpenAI Realtime API
 *   - Microphone capture → PCM16 24kHz → input_audio_buffer.append
 *   - Audio playback via Web Audio API
 *   - Text message sending
 *   - Tool call execution via useRealtimeTools
 */

"use client";

import { useCallback, useRef, useState } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { executeToolCall } from "@/hooks/useRealtimeTools";

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

interface UseRealtimeVoiceOptions {
  token: string;
  onTranscript?: (entry: TranscriptEntry) => void;
  onFunctionCall?: (evt: FunctionCallEvent) => void;
  onError?: (message: string) => void;
}

interface UseRealtimeVoiceReturn {
  connect: () => Promise<void>;
  disconnect: () => void;
  sendText: (text: string) => void;
  toggleMic: () => void;
  isMicOn: boolean;
  status: VoiceStatus;
}

let _entryId = 0;

// ── PCM16 conversion ────────────────────────────────────────────────────────

function float32ToPcm16Base64(float32: Float32Array): string {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToFloat32(base64: string): Float32Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  const pcm16 = new Int16Array(buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useRealtimeVoice(options: UseRealtimeVoiceOptions): UseRealtimeVoiceReturn {
  const { token, onTranscript, onFunctionCall, onError } = options;

  const [status, setStatus] = useState<VoiceStatus>("disconnected");
  const [isMicOn, setIsMicOn] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playbackQueueRef = useRef<any[]>([]);
  const isPlayingRef = useRef(false);
  const statusRef = useRef<VoiceStatus>("disconnected");

  // Partial transcript accumulators
  const assistantTranscriptRef = useRef("");
  const assistantEntryIdRef = useRef(0);

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

  // ── Audio playback ──────────────────────────────────────────────────────

  const playNextChunk = useCallback(() => {
    if (playbackQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      if (statusRef.current === "speaking") updateStatus("ready");
      return;
    }

    isPlayingRef.current = true;
    const chunk = playbackQueueRef.current.shift()!;

    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = playbackCtxRef.current;
    const buffer = ctx.createBuffer(1, chunk.length, 24000);
    buffer.copyToChannel(chunk, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => playNextChunk();
    source.start();
  }, [updateStatus]);

  const enqueueAudio = useCallback(
    (base64: string) => {
      const float32 = base64ToFloat32(base64);
      playbackQueueRef.current.push(float32);
      if (!isPlayingRef.current) {
        updateStatus("speaking");
        playNextChunk();
      }
    },
    [playNextChunk, updateStatus],
  );

  const stopPlayback = useCallback(() => {
    playbackQueueRef.current = [];
    isPlayingRef.current = false;
    playbackCtxRef.current?.close().catch(() => {});
    playbackCtxRef.current = null;
  }, []);

  // ── WebSocket message handler ───────────────────────────────────────────

  const handleMessage = useCallback(
    async (evt: MessageEvent) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(evt.data as string);
      } catch {
        return;
      }

      const type = data.type as string;

      switch (type) {
        case "session.created":
        case "session.updated":
          updateStatus("ready");
          emitTranscript("system", "ORDR Voice ready — speak or type below", true);
          break;

        case "response.audio.delta":
          enqueueAudio(data.delta as string);
          break;

        case "response.audio_transcript.delta": {
          // Streaming assistant transcript
          const delta = data.delta as string;
          assistantTranscriptRef.current += delta;
          emitTranscript(
            "assistant",
            assistantTranscriptRef.current,
            false,
            assistantEntryIdRef.current,
          );
          break;
        }

        case "response.audio_transcript.done": {
          const finalText = (data.transcript as string) ?? assistantTranscriptRef.current;
          emitTranscript("assistant", finalText, true, assistantEntryIdRef.current);
          assistantTranscriptRef.current = "";
          assistantEntryIdRef.current = ++_entryId;
          break;
        }

        case "conversation.item.input_audio_transcription.completed": {
          const userText = (data.transcript as string)?.trim();
          if (userText) emitTranscript("user", userText, true);
          break;
        }

        case "response.function_call_arguments.done": {
          const callId = data.call_id as string;
          const fnName = data.name as string;
          const fnArgs = JSON.parse((data.arguments as string) ?? "{}");

          onFunctionCall?.({ name: fnName, status: "calling" });
          updateStatus("processing");

          const result = await executeToolCall(fnName, fnArgs, token);

          onFunctionCall?.({ name: fnName, status: "done" });

          // Send function result back to OpenAI
          const ws = wsRef.current;
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: callId,
                  output: result,
                },
              }),
            );
            ws.send(JSON.stringify({ type: "response.create" }));
          }
          break;
        }

        case "error": {
          const errData = data.error as Record<string, unknown> | undefined;
          const message = (errData?.message as string) ?? "Unknown error";
          updateStatus("error");
          onError?.(message);
          emitTranscript("system", `Error: ${message}`, true);
          break;
        }

        case "input_audio_buffer.speech_started":
          stopPlayback();
          updateStatus("listening");
          break;

        case "input_audio_buffer.speech_stopped":
          updateStatus("processing");
          break;

        case "response.done":
          // Response complete — if not speaking, go to ready
          if (statusRef.current !== "speaking") updateStatus("ready");
          break;
      }
    },
    [token, updateStatus, emitTranscript, enqueueAudio, stopPlayback, onFunctionCall, onError],
  );

  // ── Microphone ──────────────────────────────────────────────────────────

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 24000 });
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const base64 = float32ToPcm16Base64(inputData);
        ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: base64 }));
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      setIsMicOn(true);
      if (statusRef.current === "ready") updateStatus("listening");
    } catch (err) {
      onError?.("Microphone access denied");
      emitTranscript("system", "Microphone permission denied — use text input", true);
    }
  }, [updateStatus, onError, emitTranscript]);

  const stopMic = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    setIsMicOn(false);
  }, []);

  // ── Connect ─────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (wsRef.current) return;
    updateStatus("connecting");
    emitTranscript("system", "Connecting to ORDR Voice…", true);

    try {
      // 1. Get ephemeral token from backend
      const resp = await dashboardFetch("/v1/voice/token", token, { method: "POST" });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(`Token request failed: ${resp.status} ${detail.slice(0, 200)}`);
      }
      const { token: ephemeralToken } = await resp.json();

      // 2. Connect to OpenAI Realtime
      const model = "gpt-4o-realtime-preview";
      const ws = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${model}`,
        // Pass token via subprotocol headers
        // OpenAI expects: openai-insecure-api-key.<token>, openai-beta.realtime-v1
        [
          "realtime",
          `openai-insecure-api-key.${ephemeralToken}`,
          "openai-beta.realtime-v1",
        ],
      );

      wsRef.current = ws;

      ws.onopen = () => {
        emitTranscript("system", "Connected — initializing session…", true);
      };

      ws.onmessage = handleMessage;

      ws.onerror = () => {
        updateStatus("error");
        onError?.("WebSocket connection failed");
      };

      ws.onclose = () => {
        wsRef.current = null;
        stopMic();
        stopPlayback();
        if (statusRef.current !== "error") updateStatus("disconnected");
      };
    } catch (err) {
      updateStatus("error");
      const msg = err instanceof Error ? err.message : String(err);
      onError?.(msg);
      emitTranscript("system", `Connection failed: ${msg}`, true);
    }
  }, [token, updateStatus, emitTranscript, handleMessage, onError, stopMic, stopPlayback]);

  // ── Disconnect ──────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    stopMic();
    stopPlayback();
    wsRef.current?.close();
    wsRef.current = null;
    updateStatus("disconnected");
  }, [stopMic, stopPlayback, updateStatus]);

  // ── Send text ───────────────────────────────────────────────────────────

  const sendText = useCallback(
    (text: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !text.trim()) return;

      stopPlayback();
      emitTranscript("user", text.trim(), true);
      updateStatus("processing");

      ws.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: text.trim() }],
          },
        }),
      );
      ws.send(JSON.stringify({ type: "response.create" }));
    },
    [emitTranscript, updateStatus, stopPlayback],
  );

  // ── Toggle mic ──────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    if (isMicOn) {
      stopMic();
    } else {
      startMic();
    }
  }, [isMicOn, startMic, stopMic]);

  return { connect, disconnect, sendText, toggleMic, isMicOn, status };
}
