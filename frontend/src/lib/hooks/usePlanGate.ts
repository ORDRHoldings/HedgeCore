/**
 * usePlanGate — plan-tier feature gating hook.
 *
 * Reads plan_tier from the authenticated user context and provides
 * helpers to check access levels across smb → professional → enterprise.
 */
import { useAuth, type PlanTier } from "@/lib/authContext";

const TIER_RANK: Record<PlanTier, number> = {
  lite: -1,
  smb: 0,
  professional: 1,
  enterprise: 2,
  intelligence: 3,
};

export function usePlanGate() {
  const { user } = useAuth();
  const tier: PlanTier = user?.plan_tier ?? "enterprise";

  /** True if the user's plan is at least the given minimum tier. */
  const hasAccess = (minTier: PlanTier): boolean =>
    TIER_RANK[tier] >= TIER_RANK[minTier];

  /** True if user is on the SMB plan. */
  const isSmb = tier === "smb";

  /** True if user is on enterprise or professional. */
  const isEnterprise = tier === "enterprise" || tier === "professional";

  return { tier, hasAccess, isSmb, isEnterprise } as const;
}
