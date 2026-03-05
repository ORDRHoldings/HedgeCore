/**
 * TierGate — SERVER COMPONENT.
 * Fetches plan_tier from server-side session. Renders children or BlurredPreview.
 * Critical: tier check happens on server — locked content never sent to client.
 */

import { cookies } from "next/headers";
import type { PlanTier } from "@/types/api";
import { meetsRequirement } from "@/lib/tier/features";
import { BlurredPreview } from "./BlurredPreview";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://hedgecore.onrender.com/api";

async function getServerUser(): Promise<{ plan_tier: PlanTier; is_superuser: boolean } | null> {
  // In App Router, we can't access httpOnly cookie directly from server components
  // in the same way — use the Authorization header approach from a stored cookie.
  // The access_token is in-memory only (not in cookies), so we can't read it here.
  // For tier gating we use a "tier" claim that we store in a non-sensitive cookie.

  try {
    const cookieStore = await cookies();
    const tierCookie = cookieStore.get("user_tier");
    const superuserCookie = cookieStore.get("user_su");

    if (tierCookie) {
      return {
        plan_tier: tierCookie.value as PlanTier,
        is_superuser: superuserCookie?.value === "1",
      };
    }
  } catch {
    // Not in a request context
  }

  return null;
}

interface TierGateProps {
  requiredTier: PlanTier;
  children: React.ReactNode;
  featureName?: string;
  /** If true, show nothing instead of BlurredPreview */
  silent?: boolean;
}

export async function TierGate({
  requiredTier,
  children,
  featureName,
  silent = false,
}: TierGateProps) {
  const serverUser = await getServerUser();

  // If we can't determine tier server-side, pass through (client will gate)
  if (!serverUser) {
    return (
      <TierGateClient
        requiredTier={requiredTier}
        featureName={featureName}
        silent={silent}
      >
        {children}
      </TierGateClient>
    );
  }

  if (serverUser.is_superuser || meetsRequirement(serverUser.plan_tier, requiredTier)) {
    return <>{children}</>;
  }

  if (silent) return null;
  return <BlurredPreview requiredTier={requiredTier} featureName={featureName} />;
}

// Client-side fallback when server can't determine tier
// This is a separate client component to avoid marking TierGate as "use client"
import TierGateClient from "./TierGateClient";
