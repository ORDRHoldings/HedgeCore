"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Menu, X, ChevronDown,
  LayoutGrid, TrendingUp, PieChart, FlaskConical, Globe, BookOpen, Newspaper,
  Building2, ShieldAlert, BarChart3, Landmark, Umbrella, Flame,
} from "lucide-react";
import { C, F, PRODUCTS, SOLUTIONS } from "./theme";

const ICONS: Record<string, React.ReactNode> = {
  LayoutGrid: <LayoutGrid size={16} strokeWidth={1.5} />,
  TrendingUp: <TrendingUp size={16} strokeWidth={1.5} />,
  PieChart: <PieChart size={16} strokeWidth={1.5} />,
  FlaskConical: <FlaskConical size={16} strokeWidth={1.5} />,
  Globe: <Globe size={16} strokeWidth={1.5} />,
  BookOpen: <BookOpen size={16} strokeWidth={1.5} />,
  Newspaper: <Newspaper size={16} strokeWidth={1.5} />,
};

const SOL_ICONS: Record<string, React.ReactNode> = {
  "corporate-treasury": <Building2 size={16} strokeWidth={1.5} />,
  "risk-management": <ShieldAlert size={16} strokeWidth={1.5} />,
  "asset-management": <BarChart3 size={16} strokeWidth={1.5} />,
  banking: <Landmark size={16} strokeWidth={1.5} />,
  insurance: <Umbrella size={16} strokeWidth={1.5} />,
  energy: <Flame size={16} strokeWidth={1.5} />,
};

const NAV_LINKS = [
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export default function MarketingNav() {
  const [mob, setMob] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDrop, setOpenDrop] = useState<string | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const c = () => setMob(window.innerWidth < 900);
    c();
    window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const enter = useCallback((n: string) => {
    if (timeout.current) clearTimeout(timeout.current);
    setOpenDrop(n);
  }, []);
  const leave = useCallback(() => {
    timeout.current = setTimeout(() => setOpenDrop(null), 100);
  }, []);

  const linkStyle: React.CSSProperties = {
    fontFamily: F.ui, fontSize: 14, fontWeight: 500,
    color: C.navTextMuted, textDecoration: "none", padding: "4px 0",
    transition: "color .15s",
  };

  return (
    <>
      <style>{`
        .mnav-link:hover{color:#fff !important}
        .mnav-drop-item{transition:background .12s}
        .mnav-drop-item:hover{background:${C.bgAlt} !important}
      `}</style>

      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: mob ? "0 20px" : "0 48px", height: 56,
        background: C.navBg,
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <span style={{ fontFamily: F.mono, fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "0.06em" }}>ORDR</span>
        </Link>

        {/* Desktop nav */}
        {!mob && (
          <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
            {/* Products dropdown */}
            <div style={{ position: "relative" }} onMouseEnter={() => enter("Products")} onMouseLeave={leave}>
              <button style={{ ...linkStyle, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: openDrop === "Products" ? "#fff" : C.navTextMuted }}>
                Products <ChevronDown size={12} style={{ transform: openDrop === "Products" ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>
              {openDrop === "Products" && (
                <div style={{ position: "absolute", top: "calc(100% + 12px)", left: -20, width: 480, background: "#fff", borderRadius: 8, boxShadow: C.dropdownShadow, padding: 8, zIndex: 200 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                    {PRODUCTS.map(p => (
                      <Link key={p.slug} href={`/products/${p.slug}`} className="mnav-drop-item" onClick={() => setOpenDrop(null)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 6, textDecoration: "none", color: C.text }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: C.accentLight, color: C.accent, flexShrink: 0 }}>
                          {ICONS[p.icon] || <LayoutGrid size={16} />}
                        </div>
                        <div>
                          <div style={{ fontFamily: F.ui, fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</div>
                          <div style={{ fontFamily: F.ui, fontSize: 11, color: C.textMuted, marginTop: 1 }}>{p.desc}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                  <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 4 }}>
                    <Link href="/products" className="mnav-drop-item" onClick={() => setOpenDrop(null)}
                      style={{ display: "block", padding: "8px 12px", borderRadius: 6, textDecoration: "none", fontFamily: F.ui, fontSize: 13, fontWeight: 500, color: C.accent }}>
                      View all products
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Solutions dropdown */}
            <div style={{ position: "relative" }} onMouseEnter={() => enter("Solutions")} onMouseLeave={leave}>
              <button style={{ ...linkStyle, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: openDrop === "Solutions" ? "#fff" : C.navTextMuted }}>
                Solutions <ChevronDown size={12} style={{ transform: openDrop === "Solutions" ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>
              {openDrop === "Solutions" && (
                <div style={{ position: "absolute", top: "calc(100% + 12px)", left: -40, width: 380, background: "#fff", borderRadius: 8, boxShadow: C.dropdownShadow, padding: 8, zIndex: 200 }}>
                  {SOLUTIONS.map(s => (
                    <Link key={s.slug} href={`/solutions/${s.slug}`} className="mnav-drop-item" onClick={() => setOpenDrop(null)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 6, textDecoration: "none", color: C.text }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: C.accentLight, color: C.accent, flexShrink: 0 }}>
                        {SOL_ICONS[s.slug] || <Building2 size={16} />}
                      </div>
                      <div>
                        <div style={{ fontFamily: F.ui, fontSize: 13, fontWeight: 600, color: C.text }}>{s.name}</div>
                        <div style={{ fontFamily: F.ui, fontSize: 11, color: C.textMuted, marginTop: 1 }}>{s.desc}</div>
                      </div>
                    </Link>
                  ))}
                  <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 4 }}>
                    <Link href="/solutions" className="mnav-drop-item" onClick={() => setOpenDrop(null)}
                      style={{ display: "block", padding: "8px 12px", borderRadius: 6, textDecoration: "none", fontFamily: F.ui, fontSize: 13, fontWeight: 500, color: C.accent }}>
                      View all solutions
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {NAV_LINKS.map(l => (
              <Link key={l.label} href={l.href} className="mnav-link" style={linkStyle}>{l.label}</Link>
            ))}
          </div>
        )}

        {/* Right */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!mob && (
            <>
              <Link href="/auth/login" className="mnav-link" style={{ ...linkStyle, marginRight: 4 }}>Sign In</Link>
              <Link href="/auth/login" style={{
                fontFamily: F.ui, fontSize: 13, fontWeight: 600,
                color: C.navBg, background: "#fff",
                padding: "8px 20px", borderRadius: 6,
                textDecoration: "none", transition: "opacity .15s",
              }}>Get Started</Link>
            </>
          )}
          {mob && (
            <button onClick={() => setMobileOpen(p => !p)} aria-label="Menu" style={{
              width: 36, height: 36, borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", background: "rgba(255,255,255,0.1)",
              border: "none", color: "#fff",
            }}>
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          )}
        </div>
      </nav>

      {/* Mobile overlay */}
      {mob && mobileOpen && (
        <div style={{
          position: "fixed", inset: 0, top: 56, zIndex: 99,
          background: "#fff", overflowY: "auto", padding: "24px 20px 40px",
        }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: C.textMuted, marginBottom: 12 }}>PRODUCTS</div>
            {PRODUCTS.map(p => (
              <Link key={p.slug} href={`/products/${p.slug}`} onClick={() => setMobileOpen(false)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", textDecoration: "none", color: C.text, borderBottom: `1px solid ${C.borderLight}` }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: C.accentLight, color: C.accent }}>
                  {ICONS[p.icon] || <LayoutGrid size={16} />}
                </div>
                <span style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 500 }}>{p.name}</span>
              </Link>
            ))}
          </div>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: C.textMuted, marginBottom: 12 }}>SOLUTIONS</div>
            {SOLUTIONS.map(s => (
              <Link key={s.slug} href={`/solutions/${s.slug}`} onClick={() => setMobileOpen(false)}
                style={{ display: "block", padding: "12px 0", textDecoration: "none", color: C.text, fontFamily: F.ui, fontSize: 14, fontWeight: 500, borderBottom: `1px solid ${C.borderLight}` }}>
                {s.name}
              </Link>
            ))}
          </div>
          <div>
            {[...NAV_LINKS].map(l => (
              <Link key={l.label} href={l.href} onClick={() => setMobileOpen(false)}
                style={{ display: "block", padding: "14px 0", textDecoration: "none", color: C.text, fontFamily: F.ui, fontSize: 15, fontWeight: 600, borderBottom: `1px solid ${C.borderLight}` }}>
                {l.label}
              </Link>
            ))}
          </div>
          <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 10 }}>
            <Link href="/auth/login" style={{
              display: "block", textAlign: "center", fontFamily: F.ui, fontSize: 15, fontWeight: 600,
              color: "#fff", background: C.accent, padding: "14px 20px", borderRadius: 8, textDecoration: "none",
            }}>Get Started</Link>
            <Link href="/auth/login" style={{
              display: "block", textAlign: "center", fontFamily: F.ui, fontSize: 15, fontWeight: 500,
              color: C.textSub, padding: "14px 20px", borderRadius: 8, textDecoration: "none", border: `1px solid ${C.border}`,
            }}>Sign In</Link>
          </div>
        </div>
      )}
    </>
  );
}
