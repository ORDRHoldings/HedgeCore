// src/app/layout.tsx
//
// Root layout — Server Component (no "use client").
//
// Next.js App Router requires the root layout to be a Server Component when
// it renders <html> and <body>.  Marking it "use client" causes React to try
// to hydrate <html>/<body> from client-side JS, which produces hydration
// mismatches and React tree errors.
//
// All client-only dependencies (react-redux Provider, HedgeProvider, shell
// components, SessionLoader) are delegated to the ClientProviders boundary
// component, which carries the single "use client" directive for the entire
// provider tree.

import "./globals.css";
import ClientProviders from "../components/pipeline/ClientProviders";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
