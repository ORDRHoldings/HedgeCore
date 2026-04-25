"use client";

import Link from "next/link";
import { ChevronLeft, Shield } from "lucide-react";
import MarketingLayout from "./MarketingLayout";
import { C, F } from "./theme";

interface Props {
  eyebrow: string;
  title: string;
  lastReviewed: string;
  children: React.ReactNode;
}

export default function TrustDocLayout({ eyebrow, title, lastReviewed, children }: Props) {
  return (
    <MarketingLayout>
      <section style={{
        padding: "80px 24px 32px",
        maxWidth: 880, margin: "0 auto",
      }}>
        <Link href="/trust" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: F.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.14em", textTransform: "uppercase",
          color: C.textMuted, textDecoration: "none",
          marginBottom: 28,
        }}>
          <ChevronLeft size={14} /> Trust center
        </Link>

        <div style={{
          fontFamily: F.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.18em", color: C.accent,
          textTransform: "uppercase", marginBottom: 14,
        }}>
          {eyebrow}
        </div>
        <h1 style={{
          fontFamily: F.heading, fontSize: 40, fontWeight: 800,
          letterSpacing: "-0.02em", margin: "0 0 16px",
          color: C.text, lineHeight: 1.15,
        }}>
          {title}
        </h1>
        <div style={{
          fontFamily: F.mono, fontSize: 11,
          color: C.textMuted, marginBottom: 48,
        }}>
          Last reviewed: {lastReviewed}
        </div>
      </section>

      <section style={{
        padding: "0 24px 100px",
        maxWidth: 880, margin: "0 auto",
        fontFamily: F.ui, fontSize: 15, lineHeight: 1.7,
        color: C.text,
      }}>
        {children}
      </section>
    </MarketingLayout>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontFamily: F.heading, fontSize: 24, fontWeight: 800,
      margin: "48px 0 16px", color: C.text,
      paddingBottom: 8, borderBottom: `1px solid ${C.border}`,
    }}>
      {children}
    </h2>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontFamily: F.heading, fontSize: 17, fontWeight: 700,
      margin: "32px 0 10px", color: C.text,
    }}>
      {children}
    </h3>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: F.ui, fontSize: 15, lineHeight: 1.7,
      color: C.textSub, margin: "0 0 16px",
    }}>
      {children}
    </p>
  );
}

export function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul style={{
      paddingLeft: 22, margin: "0 0 20px",
      fontFamily: F.ui, fontSize: 15, lineHeight: 1.7,
      color: C.textSub,
    }}>
      {children}
    </ul>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      fontFamily: F.mono, fontSize: 13,
      background: C.bgAlt, padding: "2px 6px", borderRadius: 3,
      color: C.text,
    }}>
      {children}
    </code>
  );
}

export function Callout({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  const bg = tone === "warn" ? "#FFF7E6" : C.accentLight;
  const bd = tone === "warn" ? "#F59E0B" : C.accent;
  return (
    <div style={{
      borderLeft: `3px solid ${bd}`,
      background: bg,
      padding: "14px 18px",
      margin: "20px 0",
      fontFamily: F.ui, fontSize: 14, color: C.text, lineHeight: 1.6,
      borderRadius: 4,
    }}>
      {children}
    </div>
  );
}

interface Row { label: string; value: React.ReactNode; }
export function StatusTable({ rows }: { rows: Row[] }) {
  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 8,
      overflow: "hidden", margin: "8px 0 28px",
    }}>
      {rows.map((r, i) => (
        <div key={r.label} style={{
          display: "grid",
          gridTemplateColumns: "1fr 2fr",
          gap: 16,
          padding: "14px 18px",
          borderBottom: i < rows.length - 1 ? `1px solid ${C.borderLight}` : "none",
          background: i % 2 === 0 ? C.bg : C.bgAlt,
        }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: C.textMuted,
          }}>
            {r.label}
          </div>
          <div style={{
            fontFamily: F.ui, fontSize: 14, color: C.text,
          }}>
            {r.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Pill({ tone, children }: { tone: "ok" | "warn" | "info" | "muted"; children: React.ReactNode }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    ok:    { bg: "#DCFCE7", fg: "#166534" },
    warn:  { bg: "#FEF3C7", fg: "#92400E" },
    info:  { bg: "#DBEAFE", fg: "#1E40AF" },
    muted: { bg: "#F1F5F9", fg: "#475569" },
  };
  const p = palette[tone];
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px", borderRadius: 999,
      background: p.bg, color: p.fg,
      fontFamily: F.mono, fontSize: 10, fontWeight: 700,
      letterSpacing: "0.08em", textTransform: "uppercase",
    }}>
      {children}
    </span>
  );
}

export { Shield };
