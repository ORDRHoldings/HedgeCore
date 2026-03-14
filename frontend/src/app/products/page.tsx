"use client";

import Link from "next/link";
import {
  LayoutGrid, TrendingUp, PieChart, FlaskConical, Globe, BookOpen, Newspaper,
  ArrowRight,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F, PRODUCTS } from "@/components/marketing/theme";

const ICONS: Record<string, React.ReactNode> = {
  LayoutGrid: <LayoutGrid size={22} strokeWidth={1.6} />,
  TrendingUp: <TrendingUp size={22} strokeWidth={1.6} />,
  PieChart: <PieChart size={22} strokeWidth={1.6} />,
  FlaskConical: <FlaskConical size={22} strokeWidth={1.6} />,
  Globe: <Globe size={22} strokeWidth={1.6} />,
  BookOpen: <BookOpen size={22} strokeWidth={1.6} />,
  Newspaper: <Newspaper size={22} strokeWidth={1.6} />,
};

export default function ProductsPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
        <h1 style={{ fontFamily: F.heading, fontSize: 52, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px", color: C.text }}>
          Products
        </h1>
        <p style={{ fontFamily: F.ui, fontSize: 18, color: C.textSub, maxWidth: 600, margin: "0 auto", lineHeight: 1.6 }}>
          Seven integrated modules. One platform. Each product is purpose-built for a specific function in the institutional hedge lifecycle.
        </p>
      </section>

      {/* Product Grid */}
      <section style={{ padding: "0 48px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <div className="prod-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {PRODUCTS.map((p, i) => (
            <Link
              key={p.slug}
              href={p.slug === "hedgewiki" ? "https://hedge-wiki.vercel.app/" : `/products/${p.slug}`}
              {...(p.slug === "hedgewiki" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              style={{ textDecoration: "none", color: "inherit", ...(!!(i === 6) ? { gridColumn: "2 / 3" } : {}) }}
            >
              <div style={{ padding: "28px 24px", border: `1px solid ${C.border}`, borderRadius: 8, height: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: C.bgAlt, color: C.accent }}>
                    {ICONS[p.icon] || <LayoutGrid size={22} />}
                  </div>
                  <div style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", color: C.text }}>{p.name}</div>
                </div>
                <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6, flex: 1, margin: 0 }}>{p.desc}</p>
                <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, color: C.accent, display: "flex", alignItems: "center", gap: 4 }}>
                  Learn More <ArrowRight size={14} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.accent, padding: "80px 48px", textAlign: "center" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>Ready to get started?</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>
          Launch the terminal and explore institutional-grade FX hedge governance.
        </p>
        <Link href="/auth/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.accent, background: "#fff", padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Get Started <ArrowRight size={16} />
        </Link>
      </section>

      <style>{`@media(max-width:768px){ .prod-grid { grid-template-columns: 1fr !important; } }`}</style>
    </MarketingLayout>
  );
}
