"use client";
/**
 * /welcome — instant redirect to /dashboard.
 * The welcome/onboarding screen has been removed; login now goes straight to dashboard.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

export default function WelcomePage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard"); }, [router]);
  return null;
}
