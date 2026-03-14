"use client";

import type { ReactNode } from "react";
import MarketingNav from "./MarketingNav";
import MarketingFooter from "./MarketingFooter";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "#FFFFFF", color: "#111111", minHeight: "100vh", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <MarketingNav />
      <main style={{ paddingTop: 56 }}>{children}</main>
      <MarketingFooter />
    </div>
  );
}
