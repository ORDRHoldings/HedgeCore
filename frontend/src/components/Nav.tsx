"use client";

import Link from "next/link";
import { useAuth } from "../lib/authContext";

export default function Nav() {
  const { token, logout } = useAuth();

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold text-gray-900">
          HedgeCalc
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
            Dashboard
          </Link>
          <Link href="/hedge-desk" className="text-sm text-gray-600 hover:text-gray-900">
            Hedges
          </Link>
          <Link href="/market-intelligence" className="text-sm text-blue-600 hover:text-blue-900 font-medium">
            Market Intelligence
          </Link>
          <Link href="/api-health" className="text-sm text-gray-600 hover:text-gray-900">
            API Health
          </Link>
          {token ? (
            <button
              onClick={() => logout()}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Logout
            </button>
          ) : (
            <Link href="/auth/login" className="text-sm text-blue-600 hover:text-blue-800">
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
