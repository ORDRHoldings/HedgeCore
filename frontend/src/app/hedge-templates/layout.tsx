"use client";

import { ReactNode } from "react";
import { Library } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import PlanGate from "@/components/ui/PlanGate";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <PlanGate minTier="professional">
      <PageShell
        icon={Library}
        title="HEDGE TEMPLATES"
        breadcrumb={["Hedge Desk", "Templates"]}
      >
        {children}
      </PageShell>
    </PlanGate>
  );
}
