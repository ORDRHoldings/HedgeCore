"use client";

import { useState } from "react";
import Button from "./ui/Button";
import Card from "./ui/Card";
import type { HedgeRequest, Scenario } from "../lib/types";

interface HedgeFormProps {
  onSubmit: (request: HedgeRequest) => void;
  loading?: boolean;
}

const DEFAULT_SCENARIOS: Scenario[] = [
  { scenario_id: "stress_down_5", shocks: { equity_move_pct: -0.05, vol_move_pct: 0.1 } },
  { scenario_id: "stress_down_10", shocks: { equity_move_pct: -0.10, vol_move_pct: 0.2 } },
];

export default function HedgeForm({ onSubmit, loading = false }: HedgeFormProps) {
  const [instrumentId, setInstrumentId] = useState("ES_FUT");
  const [quantity, setQuantity] = useState(10);
  const [assetClass, setAssetClass] = useState<"futures" | "perp" | "options">("futures");
  const [underlying, setUnderlying] = useState("SPX");
  const [multiplier, setMultiplier] = useState(50);
  const [spotPrice, setSpotPrice] = useState(4500);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const request: HedgeRequest = {
      positions: [{ instrument_id: instrumentId, quantity }],
      instrument_meta: {
        [instrumentId]: {
          asset_class: assetClass,
          underlying,
          contract_multiplier: multiplier,
        },
      },
      market: {
        prices: { [instrumentId]: spotPrice, [underlying]: spotPrice },
      },
      scenarios: DEFAULT_SCENARIOS,
    };

    onSubmit(request);
  };

  return (
    <Card title="Hedge Calculation Request">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Instrument ID
            </label>
            <input
              type="text"
              value={instrumentId}
              onChange={(e) => setInstrumentId(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Quantity (contracts)
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Asset Class
            </label>
            <select
              value={assetClass}
              onChange={(e) => setAssetClass(e.target.value as "futures" | "perp" | "options")}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="futures">Futures</option>
              <option value="perp">Perpetual</option>
              <option value="options">Options</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Underlying
            </label>
            <input
              type="text"
              value={underlying}
              onChange={(e) => setUnderlying(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Contract Multiplier
            </label>
            <input
              type="number"
              value={multiplier}
              onChange={(e) => setMultiplier(Number(e.target.value))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Spot Price (USD)
            </label>
            <input
              type="number"
              value={spotPrice}
              onChange={(e) => setSpotPrice(Number(e.target.value))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="rounded bg-gray-50 p-3 text-xs text-gray-600">
          <strong>Scenarios:</strong> -5% equity / +10% vol, -10% equity / +20% vol
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Calculating..." : "Run Hedge Calculation"}
        </Button>
      </form>
    </Card>
  );
}
