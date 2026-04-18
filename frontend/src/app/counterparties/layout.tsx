"use client";

import { ReactNode } from "react";
import { Users } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import PlanGate from "@/components/ui/PlanGate";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <PlanGate minTier="professional">
      <PageShell
        icon={Users}
        title="COUNTERPARTY HUB"
        breadcrumb={["Risk", "Counterparties"]}
      >
        {children}
      </PageShell>
    </PlanGate>
  );
}
