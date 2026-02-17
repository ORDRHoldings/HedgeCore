"use client";

import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { logout } from "../../../lib/store/slices/authSlice";

export default function LogoutPage() {
  const dispatch = useDispatch();
  const router = useRouter();

  useEffect(() => {
    dispatch(logout());
    router.push("/auth/login");
  }, [dispatch, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-gray-600">Signing out...</p>
    </div>
  );
}
