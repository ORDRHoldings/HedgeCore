import type { Bar } from "./types";

export interface FibLevel {
  ratio: number;
  price: number;
  label: string;
}

export interface AutoFibData {
  t: number;
  high: number;
  low: number;
  levels: FibLevel[];
  isUptrend: boolean;
}

const RETRACE_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
const EXTEND_LEVELS = [0, 0.618, 1.0, 1.272, 1.414, 1.618, 2.0, 2.618];

export function computeAutoFib(bars: Bar[], lookback = 50): AutoFibData | null {
  if (bars.length < lookback) return null;
  const recent = bars.slice(-lookback);
  let highIdx = 0, lowIdx = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].h > recent[highIdx].h) highIdx = i;
    if (recent[i].l < recent[lowIdx].l) lowIdx = i;
  }
  const H = recent[highIdx].h;
  const L = recent[lowIdx].l;
  const isUptrend = highIdx > lowIdx;
  const range = H - L;
  const levels: FibLevel[] = RETRACE_LEVELS.map((r) => ({
    ratio: r,
    price: isUptrend ? H - r * range : L + r * range,
    label: `${(r * 100).toFixed(1)}%`,
  }));
  return { t: bars[bars.length - 1].t, high: H, low: L, levels, isUptrend };
}

export function computeAutoFibExtension(bars: Bar[], lookback = 50): AutoFibData | null {
  if (bars.length < lookback) return null;
  const recent = bars.slice(-lookback);
  let highIdx = 0, lowIdx = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].h > recent[highIdx].h) highIdx = i;
    if (recent[i].l < recent[lowIdx].l) lowIdx = i;
  }
  const H = recent[highIdx].h;
  const L = recent[lowIdx].l;
  const isUptrend = highIdx > lowIdx;
  const range = H - L;
  const levels: FibLevel[] = EXTEND_LEVELS.map((r) => ({
    ratio: r,
    price: isUptrend ? L + r * range : H - r * range,
    label: `${(r * 100).toFixed(1)}%`,
  }));
  return { t: bars[bars.length - 1].t, high: H, low: L, levels, isUptrend };
}
