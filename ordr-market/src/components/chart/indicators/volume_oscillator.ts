import type { Bar, IndicatorPoint } from "./types";
import { emaFromValues } from "./ema";
export function computeVolumeOscillator(bars: Bar[], fast = 5, slow = 10): IndicatorPoint[] {
  const vols = bars.map(b => b.v);
  const emaFast = emaFromValues(vols, fast);
  const emaSlow = emaFromValues(vols, slow);
  const offset = emaFast.length - emaSlow.length;
  return emaSlow.map((s, i) => {
    const barIdx = bars.length - emaSlow.length + i;
    return { t: bars[barIdx].t, value: s > 0 ? (emaFast[i + offset] - s) / s * 100 : 0 };
  });
}
