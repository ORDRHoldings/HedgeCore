"use client";
/**
 * TierGateClient — client-side tier gate fallback.
 * Used by TierGate when server-side tier cannot be determined.
 */

import { useAuthStore } from "@/lib/auth/store";
import type { PlanTier } from "@/types/api";
import { meetsRequirement } from "@/lib/tier/features";
import { BlurredPreview } from "./BlurredPreview";

interface Props {
  requiredTier: PlanTier;
  featureName?: string;
  silent?: boolean;
  children: React.ReactNode;
}

export default function TierGateClient({
  requiredTier,
  featureName,
  silent,
  children,
}: Props) {
  const user = useAuthStore((s) => s.user);

  // Still loading — show nothing to avoid flash
  if (!user) return null;

  if (user.is_superuser || meetsRequirement(user.plan_tier, requiredTier)) {
    return <>{children}</>;
  }

  if (silent) return null;
  return <BlurredPreview requiredTier={requiredTier} featureName={featureName} />;
}
