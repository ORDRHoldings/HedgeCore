"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";

export default function RootPage() {
  const router = useRouter();
  const { token, user, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;
    if (user || token) {
      router.replace("/dashboard");
    } else {
      router.replace("/auth/login");
    }
  }, [isLoading, user, token, router]);

  return null;
}
