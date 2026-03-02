"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";

/**
 * Checks whether the current user holds company.edit_settings.
 * Optimistic default: true (server enforces RBAC on PATCH).
 * Attempts a dry-run GET to determine permission before user edits.
 */
export function useSettingsPermissions() {
  const { token, user } = useAuth();
  const [canEditGoverned, setCanEditGoverned] = useState(true);
  const [isAdmin,         setIsAdmin]         = useState(false);

  useEffect(() => {
    if (!token) return;
    // Derive admin status from user roles
    const roles = user?.roles ?? [];
    setIsAdmin(
      roles.some((r: string) => ["admin", "cfo", "head_of_risk", "branch_manager"].includes(r)) ||
      (user as { is_superuser?: boolean } | null)?.is_superuser === true
    );

    // Try fetching user permissions to determine canEditGoverned
    dashboardFetch("/v1/users/me/permissions", token)
      .then(async res => {
        if (!res.ok) return;
        const data = await res.json() as { permissions?: string[] };
        const perms = data.permissions ?? [];
        setCanEditGoverned(perms.includes("company.edit_settings"));
      })
      .catch(() => {
        // Endpoint may not exist — fall back to optimistic true
        setCanEditGoverned(true);
      });
  }, [token, user]);

  return { canEditGoverned, isAdmin };
}
