"use client";

import { useState, useEffect } from "react";
import { BookOpen, ExternalLink, ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import { fetchKnowledgeContext, type KnowledgeContext } from "@/lib/hedgewiki";

const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel: "var(--bg-panel)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
} as const;

interface HedgeWikiPanelProps {
  slug: string;
  mode?: "compact" | "full";
  className?: string;
  style?: React.CSSProperties;
}

export function HedgeWikiPanel({ slug, mode = "compact", className, style }: HedgeWikiPanelProps) {
  const [content, setContent] = useState<KnowledgeContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(mode === "full");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchKnowledgeContext(slug).then((data) => {
      if (cancelled) return;
      if (data) {
        setContent(data);
      } else {
        setError(true);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [slug]);

  // Loading skeleton
  if (loading) {
    return (
      <div className={className} style={{
        background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 16,
        fontFamily: S.fontUI, ...style,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: S.tertiary }}>
          <BookOpen size={14} />
          <span style={{ fontFamily: S.fontMono, fontSize: 11 }}>Loading HedgeWiki...</span>
        </div>
        <div style={{ marginTop: 8, height: 12, background: S.bgSub, borderRadius: 4, width: "80%" }} />
        <div style={{ marginTop: 6, height: 12, background: S.bgSub, borderRadius: 4, width: "60%" }} />
      </div>
    );
  }

  // Error / unavailable state
  if (error || !content) {
    return (
      <div className={className} style={{
        background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 12,
        fontFamily: S.fontUI, ...style,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: S.tertiary, fontSize: 12 }}>
          <AlertCircle size={14} />
          <span>Knowledge context unavailable</span>
          <a
            href={`https://hedge-wiki.vercel.app/wiki/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: S.cyan, marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}
          >
            View on HedgeWiki <ExternalLink size={12} />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={className} style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8,
      fontFamily: S.fontUI, overflow: "hidden", ...style,
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
          background: "transparent", border: "none", cursor: "pointer", color: S.primary, textAlign: "left",
        }}
      >
        <BookOpen size={14} style={{ color: S.cyan, flexShrink: 0 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.cyan, flexShrink: 0 }}>HEDGEWIKI</span>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{content.title}</span>
        {expanded ? <ChevronDown size={14} style={{ color: S.tertiary }} /> : <ChevronRight size={14} style={{ color: S.tertiary }} />}
      </button>

      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${S.soft}` }}>
          {/* Definition */}
          {content.definition && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, fontFamily: S.fontMono, color: S.tertiary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                Definition
              </div>
              <p style={{ fontSize: 13, color: S.secondary, lineHeight: 1.6, margin: 0 }}>
                {content.definition}
              </p>
            </div>
          )}

          {/* Economic Intuition — compact mode stops here */}
          {content.economicIntuition && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, fontFamily: S.fontMono, color: S.tertiary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                Economic Intuition
              </div>
              <p style={{ fontSize: 13, color: S.secondary, lineHeight: 1.6, margin: 0 }}>
                {content.economicIntuition}
              </p>
            </div>
          )}

          {/* Full mode sections */}
          {mode === "full" && (
            <>
              {content.mathematicalFramework && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, fontFamily: S.fontMono, color: S.tertiary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                    Mathematical Framework
                  </div>
                  <pre style={{ fontSize: 12, fontFamily: S.fontMono, color: S.secondary, background: S.bgSub, padding: 10, borderRadius: 4, overflow: "auto", margin: 0, whiteSpace: "pre-wrap" }}>
                    {typeof content.mathematicalFramework === 'string' ? content.mathematicalFramework : JSON.stringify(content.mathematicalFramework, null, 2)}
                  </pre>
                </div>
              )}

              {content.governanceAccounting && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, fontFamily: S.fontMono, color: S.tertiary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                    Governance & Accounting
                  </div>
                  <p style={{ fontSize: 13, color: S.secondary, lineHeight: 1.6, margin: 0 }}>
                    {content.governanceAccounting}
                  </p>
                </div>
              )}

              {content.failureModes && content.failureModes.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, fontFamily: S.fontMono, color: S.tertiary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                    Failure Modes
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {content.failureModes.map((fm, i) => (
                      <li key={i} style={{ fontSize: 12, color: S.secondary, marginBottom: 2 }}>{fm}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* Citations */}
          {content.citations && content.citations.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${S.soft}` }}>
              <div style={{ fontSize: 10, fontFamily: S.fontMono, color: S.tertiary, marginBottom: 4 }}>
                CITATIONS
              </div>
              {content.citations.map((c, i) => (
                <div key={i} style={{ fontSize: 11, fontFamily: S.fontMono, color: S.tertiary, marginBottom: 2 }}>
                  [{i + 1}] {c}
                </div>
              ))}
            </div>
          )}

          {/* Footer link */}
          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
            <a
              href={`https://hedge-wiki.vercel.app/wiki/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: S.cyan, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}
            >
              View full article on HedgeWiki <ExternalLink size={11} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default HedgeWikiPanel;
