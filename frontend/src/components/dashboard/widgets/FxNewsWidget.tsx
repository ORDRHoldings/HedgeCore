"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, X, ExternalLink, Newspaper } from "lucide-react";
import type { UserContext } from "@/lib/authContext";
import type { FxNewsArticle } from "@/lib/market/types";

const S = {
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel:   "var(--bg-panel)",
  bgDeep:    "var(--bg-deep)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber,#F59E0B)",
  green:     "var(--status-pass,#34d399)",
  red:       "var(--accent-red,#f87171)",
} as const;

const POLL_MS = 300_000;
const MAX_DISPLAY = 10;

function relativeTime(unixSec: number): string {
  const diffMs = Date.now() - unixSec * 1000;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

export default function FxNewsWidget({ onRemove }: Props) {
  const [articles, setArticles] = useState<FxNewsArticle[]>([]);
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNews = useCallback(async () => {
    setFetching(true);
    setError(null);
    try {
      const res = await fetch("/api/market/news/fx");
      const json = await res.json() as { articles?: FxNewsArticle[]; error?: string };
      if (json.error && (!json.articles || json.articles.length === 0)) {
        setError(json.error);
      } else {
        setArticles(json.articles ?? []);
        setLastFetch(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    const id = setInterval(fetchNews, POLL_MS);
    return () => clearInterval(id);
  }, [fetchNews]);

  const displayed = articles.slice(0, MAX_DISPLAY);

  return (
    <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 200 }}>
      {/* Header */}
      <div className="widget-drag-handle" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0, cursor: "grab" }}>
        <span aria-hidden="true" style={{ fontFamily: "monospace", fontSize: 13, color: S.tertiary, cursor: "grab", flexShrink: 0, lineHeight: 1, userSelect: "none" }}>⠿</span>
        <Newspaper size={12} color={S.cyan} />
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.primary, flex: 1, textTransform: "uppercase" }}>
          FX News
        </span>
        {lastFetch && (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{lastFetch}</span>
        )}
        <span style={{
          fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
          color: S.green,
          background: "color-mix(in srgb, var(--status-pass,#34d399) 10%, transparent)",
          border: "1px solid color-mix(in srgb, var(--status-pass,#34d399) 30%, transparent)",
          padding: "1px 5px", borderRadius: 2,
        }}>LIVE</span>
        <button onClick={fetchNews} disabled={fetching} title="Refresh" style={{ background: "transparent", border: "none", cursor: fetching ? "default" : "pointer", padding: 2, display: "flex", alignItems: "center", opacity: fetching ? 0.4 : 1 }}>
          <RefreshCw size={11} color={S.tertiary} />
        </button>
        {onRemove && (
          <button onClick={onRemove} title="Remove widget" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
            <X size={12} color={S.tertiary} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {fetching && articles.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
            LOADING…
          </div>
        ) : error ? (
          <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.red }}>ERROR</span>
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, textAlign: "center" }}>{error}</span>
            <button onClick={fetchNews} style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, background: "transparent", border: `1px solid ${S.cyan}`, padding: "3px 10px", cursor: "pointer" }}>RETRY</button>
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>NO FX NEWS AVAILABLE</span>
          </div>
        ) : (
          <div>
            {displayed.map((article, idx) => (
              <a
                key={article.id}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  padding: "10px 12px",
                  borderBottom: `1px solid ${S.soft}`,
                  background: idx % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.bgSub} 40%, transparent)`,
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: S.fontUI, fontSize: 12, color: S.primary, fontWeight: 500,
                      lineHeight: 1.4,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}>
                      {article.headline}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, fontWeight: 700 }}>
                        {article.source}
                      </span>
                      <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>·</span>
                      <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                        {article.datetime > 0 ? relativeTime(article.datetime) : "—"}
                      </span>
                    </div>
                  </div>
                  <ExternalLink size={10} color={S.tertiary} style={{ flexShrink: 0, marginTop: 3 }} />
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 10px",
        borderTop: `1px solid ${S.soft}`,
        background: S.bgSub,
        fontFamily: S.fontMono,
        fontSize: 12,
        color: S.tertiary,
        display: "flex",
        justifyContent: "space-between",
      }}>
        <span>Finnhub · Forex news</span>
        <span>Indicative only — not investment advice</span>
      </div>
    </div>
  );
}
