"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Sun, Moon, Menu, X, ChevronDown,
  LayoutGrid, TrendingUp, PieChart, FlaskConical, Globe, BookOpen, Newspaper,
  Building2, ShieldAlert, BarChart3, Landmark, Umbrella, Flame,
} from "lucide-react";
import type { MarketingTheme, ThemeMode } from "./theme";
import { F, PRODUCTS, SOLUTIONS } from "./theme";

/* ── Icon resolver (products) ── */
const PRODUCT_ICONS: Record<string, React.ReactNode> = {
  LayoutGrid: <LayoutGrid size={18} strokeWidth={1.6} />,
  TrendingUp: <TrendingUp size={18} strokeWidth={1.6} />,
  PieChart: <PieChart size={18} strokeWidth={1.6} />,
  FlaskConical: <FlaskConical size={18} strokeWidth={1.6} />,
  Globe: <Globe size={18} strokeWidth={1.6} />,
  BookOpen: <BookOpen size={18} strokeWidth={1.6} />,
  Newspaper: <Newspaper size={18} strokeWidth={1.6} />,
};

/* ── Icon resolver (solutions) ── */
const SOLUTION_ICONS: Record<string, React.ReactNode> = {
  "corporate-treasury": <Building2 size={18} strokeWidth={1.6} />,
  "risk-management": <ShieldAlert size={18} strokeWidth={1.6} />,
  "asset-management": <BarChart3 size={18} strokeWidth={1.6} />,
  banking: <Landmark size={18} strokeWidth={1.6} />,
  insurance: <Umbrella size={18} strokeWidth={1.6} />,
  energy: <Flame size={18} strokeWidth={1.6} />,
};

interface Props {
  theme: MarketingTheme;
  mode: ThemeMode;
  onToggleTheme: () => void;
}

export default function MarketingNav({ theme: T, mode, onToggleTheme }: Props) {
  const dk = mode === "dark";
  const [scrollY, setScrollY] = useState(0);
  const [mob, setMob] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDrop, setOpenDrop] = useState<string | null>(null);
  const dropTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const c = () => setMob(window.innerWidth < 900);
    c();
    window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);

  useEffect(() => {
    const h = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  /* close mobile overlay on route navigate */
  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const navSolid = scrollY > 60;

  const openDropdown = useCallback((name: string) => {
    if (dropTimeout.current) clearTimeout(dropTimeout.current);
    setOpenDrop(name);
  }, []);

  const closeDropdown = useCallback(() => {
    dropTimeout.current = setTimeout(() => setOpenDrop(null), 120);
  }, []);

  /* ── Dropdown renderer ── */
  const renderDropdown = (name: string, children: React.ReactNode) => (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => openDropdown(name)}
      onMouseLeave={closeDropdown}
    >
      <button
        style={{
          fontFamily: F.ui,
          fontSize: 13,
          fontWeight: 500,
          color: T.textSub,
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 0",
        }}
      >
        {name} <ChevronDown size={13} style={{
          transform: openDrop === name ? "rotate(180deg)" : "rotate(0)",
          transition: "transform .2s",
        }} />
      </button>
      {openDrop === name && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          left: name === "Solutions" ? "-60px" : "-20px",
          minWidth: name === "Products" ? 420 : 360,
          background: dk ? "#0c0c14" : "#ffffff",
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: dk ? "0 16px 64px rgba(0,0,0,0.6)" : "0 16px 64px rgba(0,0,0,0.1)",
          padding: "8px",
          zIndex: 200,
        }}>
          {children}
        </div>
      )}
    </div>
  );

  return (
    <>
      <style>{`
        .mktnav-link{position:relative;transition:color .2s}
        .mktnav-link:hover{color:${dk ? "#fff" : "#0f172a"} !important}
        .mktnav-link::after{content:'';position:absolute;bottom:-2px;left:0;right:0;height:1.5px;background:${T.accent};transform:scaleX(0);transition:transform .2s;transform-origin:left}
        .mktnav-link:hover::after{transform:scaleX(1)}
        .mktnav-btn{transition:all .2s cubic-bezier(.4,0,.2,1)}
        .mktnav-btn:hover{transform:translateY(-1px);box-shadow:${dk ? "0 4px 16px rgba(34,211,238,0.2)" : "0 4px 16px rgba(30,58,95,0.15)"}}
        .mktnav-drop-item{transition:background .15s}
        .mktnav-drop-item:hover{background:${dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"} !important}
      `}</style>

      <nav style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: mob ? "0 16px" : "0 48px",
        height: 56,
        background: navSolid
          ? (dk ? "rgba(5,5,8,0.95)" : "rgba(255,255,255,0.95)")
          : "transparent",
        backdropFilter: navSolid ? "blur(20px) saturate(180%)" : "none",
        WebkitBackdropFilter: navSolid ? "blur(20px) saturate(180%)" : "none",
        borderBottom: navSolid ? `1px solid ${T.border}` : "1px solid transparent",
        boxShadow: navSolid ? T.navShadow : "none",
        transition: "background .3s, border-color .3s, box-shadow .3s",
      }}>
        {/* ── Logo ── */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: F.mono,
            fontSize: 13,
            fontWeight: 800,
            background: dk ? "linear-gradient(135deg, #22d3ee, #818cf8)" : T.accent,
            color: dk ? "#000" : "#fff",
          }}>O</div>
          <span style={{
            fontFamily: F.mono,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: T.text,
          }}>ORDR</span>
          <span style={{
            fontFamily: F.mono,
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.06em",
            color: T.textDim,
            display: mob ? "none" : "inline",
          }}>Terminal</span>
        </Link>

        {/* ── Desktop nav ── */}
        {!mob && (
          <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
            {/* Products dropdown */}
            {renderDropdown("Products", (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                {PRODUCTS.map(p => (
                  <Link
                    key={p.slug}
                    href={`/products/${p.slug}`}
                    className="mktnav-drop-item"
                    onClick={() => setOpenDrop(null)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 8,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: `${p.color}12`,
                      color: p.color,
                      flexShrink: 0,
                      marginTop: 1,
                    }}>
                      {PRODUCT_ICONS[p.icon] || <LayoutGrid size={18} />}
                    </div>
                    <div>
                      <div style={{
                        fontFamily: F.ui,
                        fontSize: 13,
                        fontWeight: 600,
                        color: T.text,
                        lineHeight: 1.2,
                      }}>{p.name}</div>
                      <div style={{
                        fontFamily: F.ui,
                        fontSize: 12,
                        color: T.textDim,
                        lineHeight: 1.4,
                        marginTop: 2,
                      }}>
                        {p.desc.length > 60 ? p.desc.slice(0, 58) + "..." : p.desc}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ))}

            {/* Solutions dropdown */}
            {renderDropdown("Solutions", (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {SOLUTIONS.map(s => (
                  <Link
                    key={s.slug}
                    href={`/solutions/${s.slug}`}
                    className="mktnav-drop-item"
                    onClick={() => setOpenDrop(null)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 8,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: dk ? T.accentSoft : T.accentSoft,
                      color: dk ? T.accent : T.accent,
                      flexShrink: 0,
                    }}>
                      {SOLUTION_ICONS[s.slug] || <Building2 size={18} />}
                    </div>
                    <div>
                      <div style={{
                        fontFamily: F.ui,
                        fontSize: 13,
                        fontWeight: 600,
                        color: T.text,
                      }}>{s.name}</div>
                      <div style={{
                        fontFamily: F.ui,
                        fontSize: 12,
                        color: T.textDim,
                        marginTop: 1,
                      }}>{s.desc}</div>
                    </div>
                  </Link>
                ))}
              </div>
            ))}

            <Link href="/pricing" className="mktnav-link" style={{
              fontFamily: F.ui,
              fontSize: 13,
              fontWeight: 500,
              color: T.textSub,
              textDecoration: "none",
              padding: "4px 0",
            }}>Pricing</Link>

            <Link href="/about" className="mktnav-link" style={{
              fontFamily: F.ui,
              fontSize: 13,
              fontWeight: 500,
              color: T.textSub,
              textDecoration: "none",
              padding: "4px 0",
            }}>About</Link>
          </div>
        )}

        {/* ── Right side ── */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              background: dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              border: `1px solid ${dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
              color: dk ? T.accent : T.textSub,
              transition: "all .2s",
            }}
          >
            {dk ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {!mob && (
            <>
              <Link href="/auth/login" style={{
                fontFamily: F.ui,
                fontSize: 13,
                fontWeight: 500,
                color: T.textSub,
                textDecoration: "none",
                padding: "7px 14px",
              }}>Sign In</Link>
              <Link href="/auth/login" className="mktnav-btn" style={{
                fontFamily: F.ui,
                fontSize: 13,
                fontWeight: 600,
                color: T.accentText,
                background: T.accent,
                padding: "7px 20px",
                borderRadius: 8,
                textDecoration: "none",
                border: "none",
              }}>Get Started</Link>
            </>
          )}

          {mob && (
            <button
              onClick={() => setMobileOpen(p => !p)}
              aria-label="Toggle menu"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                background: dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                border: `1px solid ${dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                color: T.text,
              }}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          )}
        </div>
      </nav>

      {/* ── Mobile overlay ── */}
      {mob && mobileOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          top: 56,
          zIndex: 99,
          background: dk ? "rgba(5,5,8,0.98)" : "rgba(255,255,255,0.98)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          overflowY: "auto",
          padding: "24px 20px 40px",
        }}>
          {/* Mobile Products section */}
          <div style={{ marginBottom: 24 }}>
            <div style={{
              fontFamily: F.mono,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: T.textDim,
              marginBottom: 12,
            }}>PRODUCTS</div>
            {PRODUCTS.map(p => (
              <Link
                key={p.slug}
                href={`/products/${p.slug}`}
                onClick={() => setMobileOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 0",
                  textDecoration: "none",
                  color: T.text,
                  borderBottom: `1px solid ${T.border}`,
                }}
              >
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: `${p.color}12`,
                  color: p.color,
                  flexShrink: 0,
                }}>
                  {PRODUCT_ICONS[p.icon] || <LayoutGrid size={18} />}
                </div>
                <span style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 500 }}>{p.name}</span>
              </Link>
            ))}
          </div>

          {/* Mobile Solutions section */}
          <div style={{ marginBottom: 24 }}>
            <div style={{
              fontFamily: F.mono,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: T.textDim,
              marginBottom: 12,
            }}>SOLUTIONS</div>
            {SOLUTIONS.map(s => (
              <Link
                key={s.slug}
                href={`/solutions/${s.slug}`}
                onClick={() => setMobileOpen(false)}
                style={{
                  display: "block",
                  padding: "12px 0",
                  textDecoration: "none",
                  color: T.text,
                  fontFamily: F.ui,
                  fontSize: 14,
                  fontWeight: 500,
                  borderBottom: `1px solid ${T.border}`,
                }}
              >{s.name}</Link>
            ))}
          </div>

          {/* Mobile nav links */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { label: "Pricing", href: "/pricing" },
              { label: "About", href: "/about" },
            ].map(l => (
              <Link
                key={l.label}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                style={{
                  display: "block",
                  padding: "14px 0",
                  textDecoration: "none",
                  color: T.text,
                  fontFamily: F.ui,
                  fontSize: 15,
                  fontWeight: 600,
                  borderBottom: `1px solid ${T.border}`,
                }}
              >{l.label}</Link>
            ))}
          </div>

          {/* Mobile CTAs */}
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 10 }}>
            <Link href="/auth/login" style={{
              display: "block",
              textAlign: "center",
              fontFamily: F.ui,
              fontSize: 15,
              fontWeight: 600,
              color: T.accentText,
              background: T.accent,
              padding: "14px 20px",
              borderRadius: 10,
              textDecoration: "none",
            }}>Get Started</Link>
            <Link href="/auth/login" style={{
              display: "block",
              textAlign: "center",
              fontFamily: F.ui,
              fontSize: 15,
              fontWeight: 500,
              color: T.textSub,
              padding: "14px 20px",
              borderRadius: 10,
              textDecoration: "none",
              border: `1px solid ${T.border}`,
            }}>Sign In</Link>
          </div>
        </div>
      )}
    </>
  );
}
