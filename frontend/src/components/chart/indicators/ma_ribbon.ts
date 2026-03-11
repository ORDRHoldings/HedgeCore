import type { Bar, IndicatorPoint } from "./types";
import { computeEMA } from "./ema";

export interface MARibbonData {
  period: number;
  color: string;
  points: IndicatorPoint[];
}

const RIBBON_PERIODS = [20, 25, 30, 35, 40, 45, 50];
const RIBBON_COLORS = [
  "#EF5350",
  "#FF7043",
  "#FFB300",
  "#66BB6A",
  "#26C6DA",
  "#42A5F5",
  "#7E57C2",
];

export function computeMARibbon(bars: Bar[]): MARibbonData[] {
  return RIBBON_PERIODS.map((p, i) => ({
    period: p,
    color: RIBBON_COLORS[i],
    points: computeEMA(bars, p),
  }));
}
