/**
 * usePlanRedirect — redirects to /dashboard if user's plan tier
 * is below the required minimum. Call at the top of any page
 * component that requires a minimum plan tier.
 *
 * Returns true if access is allowed, false if redirecting.
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, type PlanTier } from "@/lib/authContext";

const TIER_RANK: Record<PlanTier, number> = {
  lite: -1,
  smb: 0,
  professional: 1,
  enterprise: 2,
};

export function usePlanRedirect(minTier: PlanTier): boolean {
  const { user } = useAuth();
  const router = useRouter();
  const tier: PlanTier = user?.plan_tier ?? "enterprise";
  const allowed = TIER_RANK[tier] >= TIER_RANK[minTier];

  useEffect(() => {
    if (user && !allowed) {
      router.replace("/dashboard");
    }
  }, [user, allowed, router]);

  return allowed;
}
