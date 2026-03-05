/**
 * lib/tier/features.ts
 * Tier hierarchy and feature gating utilities.
 */

import type { PlanTier } from "@/types/api";

// Tier ranks — higher = more access
const TIER_RANK: Record<PlanTier, number> = {
  lite: 0,
  smb: 1,
  professional: 1, // same as smb
  enterprise: 2,
};

export function meetsRequirement(userTier: PlanTier, required: PlanTier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[required];
}

// Human-readable tier labels
export const TIER_LABELS: Record<PlanTier, string> = {
  lite:         "FREE",
  smb:          "SMB",
  professional: "PRO",
  enterprise:   "ENTERPRISE",
};

export const TIER_BADGE_COLORS: Record<PlanTier, { bg: string; text: string }> = {
  lite:         { bg: "#F1F5F9", text: "#64748B" },
  smb:          { bg: "#EFF6FF", text: "#1C62F2" },
  professional: { bg: "#EFF6FF", text: "#1C62F2" },
  enterprise:   { bg: "#F0FDF4", text: "#059669" },
};

export const TIER_UPGRADE_LABELS: Record<PlanTier, string> = {
  lite:         "Start SMB Trial →",
  smb:          "Upgrade to Enterprise →",
  professional: "Upgrade to Enterprise →",
  enterprise:   "",
};

// Feature map — minimum tier required per feature
export const FEATURE_TIERS: Record<string, PlanTier> = {
  "audit-lab":        "lite",
  "exposures":        "smb",
  "hedge-plan":       "smb",
  "policies":         "smb",
  "execute":          "smb",
  "team":             "smb",
  "analytics":        "enterprise",
  "governance":       "enterprise",
  "audit-trail":      "enterprise",
  "api-keys":         "enterprise",
  "connectors":       "enterprise",
  "mfa":              "enterprise",
  "scenario-studio":  "enterprise",
  "portfolio-risk":   "enterprise",
};

export type Tier = PlanTier;
