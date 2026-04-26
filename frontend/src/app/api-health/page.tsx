"use client";

import React, { useState } from "react";
import api from "../../lib/api";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

export default function ApiHealthPage() {
  const _isMobile = useIsMobile();
  const [status, setStatus] = useState<string>("unknown");
  const [loading, setLoading] = useState<boolean>(false);

  const checkHealth = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/health");
      setStatus(JSON.stringify(data, null, 2));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setStatus(`Error: ${status || "no response"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-gray-800 px-4">
      <h1 className="text-3xl font-bold mb-6">API Health Check</h1>
      <button
        onClick={checkHealth}
        disabled={loading}
        className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-50"
      >
        {loading ? "Checking..." : "Check API Health"}
      </button>
      <pre className="mt-8 bg-white p-4 rounded shadow-md text-sm overflow-auto w-full" style={{ maxWidth: 400 }}>
        {status}
      </pre>
    </div>
  );
}
