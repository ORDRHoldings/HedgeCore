import "./globals.css";
import ClientProviders from "../components/pipeline/ClientProviders";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { SkipToContent } from "@/components/layout/SkipToContent";
import CmdKOverlay from "@/components/intelligence/CmdKOverlay";
import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "ORDR Terminal \u2014 Institutional FX Treasury Platform",
    template: "%s | ORDR Terminal",
  },
  description:
    "Enterprise-grade FX hedge calculation, governance, and audit platform for institutional treasury teams. Deterministic risk engine, 4-eyes approval, WORM audit trail.",
  keywords: [
    "FX hedging",
    "treasury management",
    "hedge accounting",
    "IFRS 9",
    "ASC 815",
    "currency risk",
    "institutional trading",
    "corporate treasury",
    "FX governance",
    "hedge effectiveness",
    "ORDR Terminal",
  ],
  authors: [{ name: "ORDR Terminal", url: "https://orderterminal.com" }],
  creator: "ORDR Terminal",
  metadataBase: new URL("https://ordr-terminal.vercel.app"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://ordr-terminal.vercel.app",
    siteName: "ORDR Terminal",
    title: "ORDR Terminal \u2014 Institutional FX Treasury Platform",
    description:
      "Enterprise FX hedge calculation, governance, and audit. Deterministic engine, 4-eyes approval, WORM audit trail. Built for institutional treasury.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ORDR Terminal \u2014 Institutional FX Treasury Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ORDR Terminal \u2014 Institutional FX Treasury Platform",
    description:
      "Enterprise FX hedge calculation, governance, and audit platform for institutional treasury teams.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SkipToContent />
        <ThemeProvider>
          <main id="main-content">
            <ClientProviders>{children}</ClientProviders>
          </main>
        </ThemeProvider>
        <CmdKOverlay />
      </body>
    </html>
  );
}
