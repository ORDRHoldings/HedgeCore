import type { Bar } from "./types";

export interface ZigzagPoint {
  t: number;
  price: number;
  barIndex: number;
  direction: "up" | "down";
}

export function computeZigzag(bars: Bar[], deviation = 5): ZigzagPoint[] {
  if (bars.length < 3) return [];
  const result: ZigzagPoint[] = [];
  let lastDirection: "up" | "down" | null = null;
  let lastExtreme = bars[0].c;
  let lastExtremeIdx = 0;

  for (let i = 1; i < bars.length; i++) {
    const pct = (Math.abs(bars[i].c - lastExtreme) / (lastExtreme || 1)) * 100;
    if (pct >= deviation) {
      if (bars[i].c > lastExtreme) {
        if (lastDirection === "up") {
          result[result.length - 1] = {
            t: bars[i].t,
            price: bars[i].h,
            barIndex: i,
            direction: "up",
          };
        } else {
          result.push({
            t: bars[lastExtremeIdx].t,
            price: lastExtreme,
            barIndex: lastExtremeIdx,
            direction: "down",
          });
          lastDirection = "up";
        }
        lastExtreme = bars[i].h;
        lastExtremeIdx = i;
      } else {
        if (lastDirection === "down") {
          result[result.length - 1] = {
            t: bars[i].t,
            price: bars[i].l,
            barIndex: i,
            direction: "down",
          };
        } else {
          result.push({
            t: bars[lastExtremeIdx].t,
            price: lastExtreme,
            barIndex: lastExtremeIdx,
            direction: "up",
          });
          lastDirection = "down";
        }
        lastExtreme = bars[i].l;
        lastExtremeIdx = i;
      }
    }
  }

  return result;
}
