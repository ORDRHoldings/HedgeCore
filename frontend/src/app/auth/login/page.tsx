"use client";

import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import { loginThunk } from "../../../lib/store/slices/authSlice";
import type { RootState, AppDispatch } from "../../../lib/store";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { loading, error } = useSelector((s: RootState) => s.auth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(loginThunk({ username, password }));
    if (loginThunk.fulfilled.match(result)) {
      router.push("/");  // Redirect to landing page instead of dashboard
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-900 to-teal-500">
      <div className="w-full max-w-sm">
        {/* Logo Section */}
        <div className="mb-6 text-center">
          <div className="mb-2 flex items-center justify-center">
            <span className="text-4xl font-bold text-white">Hedge</span>
            <span className="text-4xl font-bold text-teal-200">Calc</span>
          </div>
          <p className="text-sm text-white/80">Institutional FX Risk Infrastructure</p>
        </div>

        <Card title="Sign in to HedgeCalc">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="demo"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="demo"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}

            {/* Demo Credentials Hint */}
            <div className="rounded bg-blue-50 border border-blue-200 px-3 py-2">
              <p className="text-xs text-blue-700">
                <strong>Demo credentials:</strong> <code className="bg-white px-1.5 py-0.5 rounded">demo</code> / <code className="bg-white px-1.5 py-0.5 rounded">demo</code>
              </p>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
