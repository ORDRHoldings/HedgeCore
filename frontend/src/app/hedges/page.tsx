"use client";

import { useState } from "react";
import Nav from "../../components/Nav";
import HedgeForm from "../../components/HedgeForm";
import HedgeTable from "../../components/HedgeTable";
import Spinner from "../../components/ui/Spinner";
import Toast from "../../components/ui/Toast";
import { runHedge } from "../../lib/api";
import type { HedgeRequest, HedgeRunResponse } from "../../lib/types";
import HelpPanel from "@/components/layout/HelpPanel";
import { HEDGES_HELP } from "@/lib/helpContent";

export default function HedgesPage() {
  const [result, setResult] = useState<HedgeRunResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (request: HedgeRequest) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await runHedge(request);
      setResult(data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { reason?: string; detail?: string } } })?.response?.data
          ?.reason ??
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Hedge calculation failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Hedge Calculator</h1>

        <div className="space-y-6">
          <HedgeForm onSubmit={handleSubmit} loading={loading} />

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
              <span className="ml-3 text-sm text-gray-600">Running hedge calculation...</span>
            </div>
          )}

          <HedgeTable result={result} />
        </div>

        {error && (
          <Toast message={error} type="error" onClose={() => setError(null)} />
        )}
      </main>
    </div>
  
    <HelpPanel config={HEDGES_HELP} storageKey="hedges" />
    </div>
  );
}
