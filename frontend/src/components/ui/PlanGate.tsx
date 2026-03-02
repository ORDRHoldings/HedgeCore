"use client";

/**
 * PlanGate — render-gate component.
 * Renders children only if the user's plan tier meets the minimum.
 */
import type { ReactNode } from "react";
import { useAuth, type PlanTier } from "@/lib/authContext";

const TIER_RANK: Record<PlanTier, number> = {
  smb: 0,
  professional: 1,
  enterprise: 2,
};

interface Props {
  minTier: PlanTier;
  children: ReactNode;
  fallback?: ReactNode;
}

export default function PlanGate({ minTier, children, fallback = null }: Props) {
  const { user } = useAuth();
  const tier: PlanTier = user?.plan_tier ?? "enterprise";
  const allowed = TIER_RANK[tier] >= TIER_RANK[minTier];
  return allowed ? <>{children}</> : <>{fallback}</>;
}
