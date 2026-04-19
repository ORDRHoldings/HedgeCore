"use client";

import { ReactNode } from "react";
import { FileCheck } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import PlanGate from "@/components/ui/PlanGate";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <PlanGate minTier="professional">
      <PageShell
        icon={FileCheck}
        title="REGULATORY SUBMISSIONS"
        breadcrumb={["Compliance", "Regulatory Submissions"]}
      >
        {children}
      </PageShell>
    </PlanGate>
  );
}
