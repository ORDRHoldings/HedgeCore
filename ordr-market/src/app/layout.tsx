import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "ORDR Market — Professional Charting & Algorithmic Trading",
  description: "Advanced charting, backtesting, and algorithmic trading platform. 77 technical indicators, 55 drawing tools, TradingView-parity chart engine.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
