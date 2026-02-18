"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/authContext";

export default function LogoutPage() {
  const { logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    logout();
    router.push("/auth/login");
  }, [logout, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-gray-600">Signing out...</p>
    </div>
  );
}
