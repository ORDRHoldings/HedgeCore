"use client";

import { useState, useEffect } from "react";
import { FunctionSquare } from "lucide-react";
import { fetchFormula, type WikiFormula } from "@/lib/hedgewiki";

const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel: "var(--bg-panel)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
} as const;

interface WikiFormulaCardProps {
  slug: string;
  className?: string;
  style?: React.CSSProperties;
}

export function WikiFormulaCard({ slug, className, style }: WikiFormulaCardProps) {
  const [formula, setFormula] = useState<WikiFormula | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFormula(slug).then(f => { setFormula(f); setLoading(false); });
  }, [slug]);

  if (loading) {
    return (
      <div className={className} style={{
        background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 12,
        fontFamily: S.fontUI, ...style,
      }}>
        <div style={{ height: 12, background: S.bgSub, borderRadius: 4, width: "60%" }} />
      </div>
    );
  }

  if (!formula) return null;

  return (
    <div className={className} style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 12,
      fontFamily: S.fontUI, ...style,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <FunctionSquare size={14} style={{ color: S.cyan }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: S.primary }}>{formula.title}</span>
      </div>
      {formula.latex && (
        <pre style={{
          fontFamily: S.fontMono, fontSize: 12, color: S.secondary,
          background: S.bgSub, padding: 8, borderRadius: 4, margin: 0, whiteSpace: "pre-wrap",
        }}>
          {formula.latex}
        </pre>
      )}
      {formula.params && formula.params.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <span style={{ fontSize: 10, fontFamily: S.fontMono, color: S.tertiary }}>PARAMETERS: </span>
          <span style={{ fontSize: 11, color: S.secondary }}>{formula.params.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

export default WikiFormulaCard;
