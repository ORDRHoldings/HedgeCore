"use client";

/**
 * /pre-trade-tca layout — institutional TCA shell with tab navigation.
 *
 * Tabs:
 *   - ESTIMATOR         → /pre-trade-tca
 *   - ACCURACY REPORT   → /pre-trade-tca/accuracy
 *
 * Gated to professional tier via PlanGate.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { Calculator } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import PlanGate from "@/components/ui/PlanGate";

export default function Layout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAccuracy = pathname?.endsWith("/accuracy") ?? false;

  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      style={{
        padding: "8px 16px",
        borderBottom: active ? "2px solid var(--accent-cyan)" : "2px solid transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
        fontSize: 13,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        textDecoration: "none",
      }}
    >
      {label}
    </Link>
  );

  return (
    <PlanGate minTier="professional">
      <PageShell
        icon={Calculator}
        title="PRE-TRADE TCA"
        breadcrumb={["Trading", "Pre-Trade TCA"]}
      >
        <div
          style={{
            display: "flex",
            gap: 4,
            borderBottom: "1px solid var(--border-rim)",
            marginBottom: 24,
          }}
        >
          {tab("/pre-trade-tca", "ESTIMATOR", !isAccuracy)}
          {tab("/pre-trade-tca/accuracy", "ACCURACY REPORT", isAccuracy)}
        </div>
        {children}
      </PageShell>
    </PlanGate>
  );
}
