import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Archivo, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { CONTENT } from "@/content";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${CONTENT.name} — ${CONTENT.tagline}`,
  description: CONTENT.heroLead,
  openGraph: {
    type: "website",
    siteName: CONTENT.name,
    title: `${CONTENT.name} — ${CONTENT.tagline}`,
    description: CONTENT.heroLead,
  },
  twitter: {
    card: "summary",
    title: `${CONTENT.name} — ${CONTENT.tagline}`,
    description: CONTENT.heroLead,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
