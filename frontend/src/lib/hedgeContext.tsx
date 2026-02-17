"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type {
  CalculateResponse,
  PolicyConfig,
  TradeRow,
  HedgeRow,
  MarketSnapshot,
} from "../api/types";

export interface LastInputs {
  policy: PolicyConfig;
  trades: TradeRow[];
  hedges: HedgeRow[];
  market: MarketSnapshot;
  fixtureId: string | null;
}

interface HedgeContextType {
  result: CalculateResponse | null;
  lastInputs: LastInputs | null;
  setCalculation: (r: CalculateResponse, inputs: LastInputs) => void;
  clearCalculation: () => void;
}

const HedgeContext = createContext<HedgeContextType>({
  result: null,
  lastInputs: null,
  setCalculation: () => {},
  clearCalculation: () => {},
});

export function HedgeProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<CalculateResponse | null>(null);
  const [lastInputs, setLastInputs] = useState<LastInputs | null>(null);

  const setCalculation = useCallback(
    (r: CalculateResponse, inputs: LastInputs) => {
      setResult(r);
      setLastInputs(inputs);
    },
    [],
  );

  const clearCalculation = useCallback(() => {
    setResult(null);
    setLastInputs(null);
  }, []);

  return (
    <HedgeContext.Provider value={{ result, lastInputs, setCalculation, clearCalculation }}>
      {children}
    </HedgeContext.Provider>
  );
}

export function useHedge() {
  return useContext(HedgeContext);
}
