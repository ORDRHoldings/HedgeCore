import "./globals.css";
import ClientProviders from "../components/pipeline/ClientProviders";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { SkipToContent } from "@/components/layout/SkipToContent";
import CmdKOverlay from "@/components/intelligence/CmdKOverlay";
import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "ORDR Treasury \u2014 Institutional FX Hedge Platform",
    template: "%s | ORDR Treasury",
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
    "ORDR Treasury",
  ],
  authors: [{ name: "ORDR Treasury", url: "https://orderterminal.com" }],
  creator: "ORDR Treasury",
  metadataBase: new URL("https://ordr-treasury.vercel.app"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://ordr-treasury.vercel.app",
    siteName: "ORDR Treasury",
    title: "ORDR Treasury \u2014 Institutional FX Hedge Platform",
    description:
      "Enterprise FX hedge calculation, governance, and audit. Deterministic engine, 4-eyes approval, WORM audit trail. Built for institutional treasury.",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "ORDR Treasury \u2014 Institutional FX Hedge Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ORDR Treasury \u2014 Institutional FX Hedge Platform",
    description:
      "Enterprise FX hedge calculation, governance, and audit platform for institutional treasury teams.",
    images: ["/og-image.svg"],
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
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
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
