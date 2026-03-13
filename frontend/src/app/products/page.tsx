"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  LayoutGrid, TrendingUp, PieChart, FlaskConical, Globe, BookOpen, Newspaper,
  ArrowRight, Terminal,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { DARK, LIGHT, F, PRODUCTS } from "@/components/marketing/theme";
import type { MarketingTheme, ThemeMode } from "@/components/marketing/theme";

/* ── Icon resolver ── */
const ICONS: Record<string, React.ReactNode> = {
  LayoutGrid: <LayoutGrid size={24} strokeWidth={1.6} />,
  TrendingUp: <TrendingUp size={24} strokeWidth={1.6} />,
  PieChart: <PieChart size={24} strokeWidth={1.6} />,
  FlaskConical: <FlaskConical size={24} strokeWidth={1.6} />,
  Globe: <Globe size={24} strokeWidth={1.6} />,
  BookOpen: <BookOpen size={24} strokeWidth={1.6} />,
  Newspaper: <Newspaper size={24} strokeWidth={1.6} />,
};

/* ── Hooks ── */
function useThemeSync(): { T: MarketingTheme; dk: boolean } {
  const [mode, setMode] = useState<ThemeMode>("dark");
  useEffect(() => {
    const s = localStorage.getItem("ordr_landing_theme");
    if (s === "dark" || s === "light") setMode(s);
    const h = () => {
      const v = localStorage.getItem("ordr_landing_theme");
      if (v === "dark" || v === "light") setMode(v);
    };
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, []);
  return { T: mode === "dark" ? DARK : LIGHT, dk: mode === "dark" };
}

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible: v };
}

/* ═══════════════════════════════════════════════════════
   Products Overview Page
   ═══════════════════════════════════════════════════════ */

export default function ProductsPage() {
  const { T, dk } = useThemeSync();
  const [heroVis, setHeroVis] = useState(false);
  const [mob, setMob] = useState(false);
  const gridView = useInView(0.1);
  const ctaView = useInView(0.15);

  useEffect(() => { setTimeout(() => setHeroVis(true), 80); }, []);
  useEffect(() => {
    const c = () => setMob(window.innerWidth < 768);
    c(); window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);

  return (
    <MarketingLayout>
      <style>{`
        .prod-card{transition:all .35s cubic-bezier(.4,0,.2,1);position:relative;overflow:hidden}
        .prod-card:hover{transform:translateY(-6px);box-shadow:${dk ? "0 16px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(34,211,238,0.15)" : "0 16px 60px rgba(0,0,0,0.08), 0 0 0 1px rgba(30,58,95,0.15)"} !important}
        .prod-card:hover .prod-glow{opacity:1}
        .prod-card:hover .prod-arrow{opacity:1;transform:translateX(0)}
        @keyframes o-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
      `}</style>

      {/* ══════════ HERO ══════════ */}
      <section style={{
        padding: mob ? "40px 20px 48px" : "72px 48px 80px",
        textAlign: "center", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: T.heroGrad, pointerEvents: "none" }} />
        {dk && (
          <div style={{
            position: "absolute", top: "10%", left: "20%", width: 500, height: 500, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(34,211,238,0.05), transparent 60%)",
            pointerEvents: "none", animation: "o-float 12s ease infinite",
          }} />
        )}
        <div style={{
          position: "relative", zIndex: 1, maxWidth: 800, margin: "0 auto",
          opacity: heroVis ? 1 : 0, transform: heroVis ? "translateY(0)" : "translateY(24px)",
          transition: "all .7s ease",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px",
            border: `1px solid ${T.border}`, borderRadius: 100,
            fontFamily: F.mono, fontSize: 12, fontWeight: 600, color: T.textDim,
            background: dk ? "rgba(34,211,238,0.03)" : "rgba(30,58,95,0.03)",
            marginBottom: 24,
          }}>
            <Terminal size={14} />
            Product Suite
          </div>
          <h1 style={{
            fontFamily: F.heading, fontSize: mob ? 40 : 64, fontWeight: 800,
            letterSpacing: "-0.04em", lineHeight: 1.05, margin: 0,
            ...(dk ? {
              background: "linear-gradient(135deg, #f0f0f5 0%, #22d3ee 50%, #818cf8 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            } : { color: T.accent }),
          }}>
            Our Products
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: mob ? 16 : 19, color: T.textSub,
            maxWidth: 600, margin: "20px auto 0", lineHeight: 1.6,
          }}>
            Seven integrated modules. One platform. Zero compromises. Each product is purpose-built for a specific function in the institutional hedge lifecycle.
          </p>
        </div>
      </section>

      {/* ══════════ PRODUCT GRID ══════════ */}
      <section ref={gridView.ref} style={{
        padding: mob ? "0 16px 64px" : "0 48px 96px",
      }}>
        <div style={{
          maxWidth: 1200, margin: "0 auto",
          display: "grid",
          gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)",
          gap: mob ? 14 : 16,
        }}>
          {PRODUCTS.map((p, i) => {
            const visible = gridView.visible;
            const delay = i * 0.08;
            return (
              <Link
                key={p.slug}
                href={p.slug === "hedgewiki" ? "https://hedge-wiki.vercel.app/" : `/products/${p.slug}`}
                {...(p.slug === "hedgewiki" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                style={{ textDecoration: "none", color: "inherit", ...((!mob && i === 6) ? { gridColumn: "2 / 3" } : {}) }}
              >
                <div className="prod-card" style={{
                  background: T.bgCard, padding: mob ? "24px 20px" : "28px 24px",
                  borderRadius: 14, border: `1px solid ${T.borderSoft}`,
                  boxShadow: dk ? "0 2px 20px rgba(0,0,0,0.3)" : "0 1px 8px rgba(0,0,0,0.04)",
                  display: "flex", flexDirection: "column", gap: 14, height: "100%",
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(24px)",
                  transition: `opacity .5s ease ${delay}s, transform .5s cubic-bezier(.4,0,.2,1) ${delay}s, box-shadow .3s, border-color .3s`,
                  cursor: "pointer",
                }}>
                  <div className="prod-glow" style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: 2,
                    background: `linear-gradient(90deg, transparent, ${p.color}, transparent)`,
                    opacity: 0, transition: "opacity .3s",
                  }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                      background: `${p.color}${dk ? "12" : "0a"}`,
                      color: p.color, flexShrink: 0,
                      border: `1px solid ${p.color}${dk ? "20" : "15"}`,
                    }}>
                      {ICONS[p.icon] || <LayoutGrid size={24} />}
                    </div>
                    <div>
                      <div style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", color: T.text }}>{p.name}</div>
                      <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 500, letterSpacing: "0.08em", color: T.textDim, marginTop: 2 }}>{p.short}</div>
                    </div>
                    <div className="prod-arrow" style={{ marginLeft: "auto", color: p.color, opacity: 0, transform: "translateX(-4px)", transition: "all .25s" }}>
                      <ArrowRight size={16} />
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6, flex: 1, margin: 0 }}>{p.desc}</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {p.tags.map(tag => (
                      <span key={tag} style={{
                        fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
                        color: T.tagText, background: T.tagBg, padding: "2px 8px", borderRadius: 4,
                        border: `1px solid ${T.tagBorder}`,
                      }}>{tag}</span>
                    ))}
                  </div>
                  <div style={{
                    fontFamily: F.mono, fontSize: 12, fontWeight: 600, color: p.color,
                    display: "flex", alignItems: "center", gap: 4, marginTop: 4,
                  }}>
                    Learn More <ArrowRight size={14} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ══════════ CTA ══════════ */}
      <section ref={ctaView.ref} style={{
        background: dk ? T.sectionAlt : T.ctaBg,
        padding: mob ? "64px 20px" : "96px 48px",
        textAlign: "center", position: "relative", overflow: "hidden",
      }}>
        {dk && (
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: 700, height: 400, background: "radial-gradient(ellipse, rgba(34,211,238,0.04), transparent 60%)", pointerEvents: "none",
          }} />
        )}
        <div style={{
          position: "relative", zIndex: 1, maxWidth: 600, margin: "0 auto",
          opacity: ctaView.visible ? 1 : 0, transform: ctaView.visible ? "translateY(0)" : "translateY(20px)",
          transition: "all .6s ease",
        }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: mob ? 32 : 48, fontWeight: 800,
            letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0,
            ...(dk ? {
              background: "linear-gradient(135deg, #f0f0f5, #22d3ee, #818cf8)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            } : { color: "#fff" }),
          }}>
            Ready to get started?
          </h2>
          <p style={{
            fontSize: 16, color: dk ? T.textDim : "rgba(255,255,255,0.5)",
            marginTop: 16, lineHeight: 1.6,
          }}>
            Launch the terminal and explore institutional-grade FX hedge governance.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 36, flexWrap: "wrap" }}>
            <Link href="/auth/login" style={{
              fontFamily: F.ui, fontSize: 15, fontWeight: 600,
              color: dk ? "#000" : T.accent, background: dk ? T.accent : "#fff",
              padding: "14px 36px", borderRadius: 10, textDecoration: "none", border: "none",
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: dk ? "0 0 30px rgba(34,211,238,0.2)" : "0 4px 16px rgba(0,0,0,0.1)",
            }}>Get Started <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
