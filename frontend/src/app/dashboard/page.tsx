"use client";

import Nav from "../../components/Nav";
import Card from "../../components/ui/Card";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="grid grid-cols-2 gap-4">
          <Card title="Engine Status">
            <p className="text-sm text-gray-600">HedgeCalc engine is operational.</p>
          </Card>
          <Card title="Recent Runs">
            <p className="text-sm text-gray-600">No recent hedge runs.</p>
          </Card>
        </div>
      </main>
    </div>
  );
}
