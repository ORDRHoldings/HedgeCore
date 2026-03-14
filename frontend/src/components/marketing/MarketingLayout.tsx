"use client";

import type { ReactNode } from "react";
import MarketingNav from "./MarketingNav";
import MarketingFooter from "./MarketingFooter";
import { C, F } from "./theme";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", fontFamily: F.ui }}>
      <MarketingNav />
      <main style={{ paddingTop: 56 }}>{children}</main>
      <MarketingFooter />
    </div>
  );
}
