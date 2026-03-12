import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ORDR Market — Professional Charting & Algorithmic Trading",
  description: "Advanced charting, backtesting, and algorithmic trading platform. 77 technical indicators, 55 drawing tools, TradingView-parity chart engine.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
