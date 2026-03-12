import "./globals.css";
import ClientProviders from "../components/pipeline/ClientProviders";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <ClientProviders>{children}</ClientProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
