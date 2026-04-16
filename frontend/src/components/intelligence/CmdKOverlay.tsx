"use client";
// frontend/src/components/intelligence/CmdKOverlay.tsx
// Global CMD+K overlay for Intelligence tier users.
// Mount once in root layout; renders nothing for non-intelligence tiers.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { queryIntelligence, type QueryResponse } from "@/lib/api/intelligenceClient";
import { Brain, X } from "lucide-react";

const S = {
  mono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  ui:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  deep:  "var(--bg-deep)",
  panel: "var(--bg-panel)",
  rim:   "var(--border-rim)",
  cyan:  "var(--accent-cyan)",
  text1: "var(--text-primary)",
  text2: "var(--text-secondary)",
  amber: "var(--accent-amber,#D97706)",
} as const;

export default function CmdKOverlay() {
  const { user, token } = useAuth();
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState("");
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const inputRef            = useRef<HTMLInputElement>(null);

  const isIntelligence = user?.plan_tier === "intelligence";

  // Keyboard listener — only activates when component is mounted for intelligence users
  useEffect(() => {
    if (!isIntelligence) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isIntelligence]);

  useEffect(() => {
    if (!isIntelligence) return;
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResult(null);
      setError(null);
    }
  }, [open, isIntelligence]);

  const submit = useCallback(async () => {
    if (!query.trim() || busy || !token) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await queryIntelligence(query, token);
      setResult(res);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "Request failed.");
    } finally {
      setBusy(false);
    }
  }, [query, busy, token]);

  // Only render for intelligence tier and when overlay is open
  if (!isIntelligence || !open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.6)", display: "flex",
        alignItems: "flex-start", justifyContent: "center",
        paddingTop: 120,
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          width: 580, maxWidth: "90vw",
          background: S.panel, border: `1px solid ${S.cyan}`,
          borderRadius: 6, overflow: "hidden",
          boxShadow: "0 0 40px rgba(0,0,0,0.8)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${S.rim}` }}>
          <Brain size={14} color={S.cyan} />
          <span style={{ fontFamily: S.mono, fontSize: 11, color: S.cyan, letterSpacing: 1 }}>INTELLIGENCE QUERY</span>
          <div style={{ flex: 1 }} />
          <X size={14} color={S.text2} style={{ cursor: "pointer" }} onClick={() => setOpen(false)} />
        </div>

        {/* Input */}
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${S.rim}` }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="Ask your treasury data... (Enter to submit)"
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              fontFamily: S.mono, fontSize: 13, color: S.text1,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Result */}
        {(busy || result || error) && (
          <div style={{ padding: "12px 14px", maxHeight: 320, overflowY: "auto" }}>
            {busy && (
              <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text2 }}>Querying...</span>
            )}
            {result && (
              <>
                <p style={{ fontFamily: S.ui, fontSize: 13, color: S.text1, margin: "0 0 8px", lineHeight: 1.6 }}>
                  {result.answer}
                </p>
                <div style={{ fontSize: 10, fontFamily: S.mono, color: S.text2 }}>
                  {result.tokens_used} tokens · {result.latency_ms}ms
                </div>
              </>
            )}
            {error && (
              <span style={{ fontFamily: S.mono, fontSize: 12, color: "#ef4444" }}>{error}</span>
            )}
          </div>
        )}

        {/* Advisory disclaimer */}
        <div style={{
          padding: "8px 14px", borderTop: `1px solid ${S.rim}`,
          background: S.deep,
          fontFamily: S.mono, fontSize: 10, color: S.amber,
          letterSpacing: 0.5,
        }}>
          ADVISORY — AI output. Verify before acting. Not financial advice.
        </div>
      </div>
    </div>
  );
}
