"use client";

import { ReactNode } from "react";
import { GitMerge } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import PlanGate from "@/components/ui/PlanGate";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <PlanGate minTier="professional">
      <PageShell
        icon={GitMerge}
        title="NATURAL HEDGING OPTIMIZER"
        breadcrumb={["Hedge Desk", "Natural Hedging"]}
      >
        {children}
      </PageShell>
    </PlanGate>
  );
}
