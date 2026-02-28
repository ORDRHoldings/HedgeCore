/**
 * risk-pulse-scoring.test.ts
 *
 * Unit tests for the deterministic scoring functions in lib/market/riskScoring.ts.
 * Zero I/O — all tests run against pure functions.
 */

import {
  directionalImpact,
  shockImpact,
  scoreToRegime,
  rollingStats,
  clamp,
  computeRiskPulse,
  FACTOR_BASELINES,
  type RawMacroInputs,
  type FactorHistorySeries,
} from "../../lib/market/riskScoring";

// ── clamp ─────────────────────────────────────────────────────────────────────

describe("clamp", () => {
  it("returns value unchanged when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it("clamps to lower bound", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });
  it("clamps to upper bound", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
  it("handles lo === hi", () => {
    expect(clamp(7, 5, 5)).toBe(5);
  });
});

// ── directionalImpact ─────────────────────────────────────────────────────────

describe("directionalImpact", () => {
  it("z=0 yields 0.25 (baseline stress)", () => {
    expect(directionalImpact(0)).toBeCloseTo(0.25);
  });
  it("z=+3 yields 1.0 (maximum stress)", () => {
    expect(directionalImpact(3)).toBeCloseTo(1.0);
  });
  it("z=-1 yields 0.0 (floor)", () => {
    expect(directionalImpact(-1)).toBeCloseTo(0.0);
  });
  it("z=-3 yields 0.0 (clamped floor, not negative)", () => {
    expect(directionalImpact(-3)).toBeCloseTo(0.0);
  });
  it("z=+1 yields 0.5 (moderate stress)", () => {
    expect(directionalImpact(1)).toBeCloseTo(0.5);
  });
  it("z=+2 yields 0.75", () => {
    expect(directionalImpact(2)).toBeCloseTo(0.75);
  });
  it("output is always in [0, 1]", () => {
    for (let z = -5; z <= 5; z += 0.5) {
      const v = directionalImpact(z);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

// ── shockImpact ───────────────────────────────────────────────────────────────

describe("shockImpact", () => {
  it("z=0 yields 0 (no shock)", () => {
    expect(shockImpact(0)).toBeCloseTo(0);
  });
  it("z=+3 yields 1.0 (maximum shock)", () => {
    expect(shockImpact(3)).toBeCloseTo(1.0);
  });
  it("z=-3 yields 1.0 (symmetric — shock in either direction)", () => {
    expect(shockImpact(-3)).toBeCloseTo(1.0);
  });
  it("z=+1.5 yields 0.5", () => {
    expect(shockImpact(1.5)).toBeCloseTo(0.5);
  });
  it("output is always in [0, 1]", () => {
    for (let z = -5; z <= 5; z += 0.5) {
      const v = shockImpact(z);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

// ── scoreToRegime ─────────────────────────────────────────────────────────────

describe("scoreToRegime", () => {
  it("0.0 → Low", ()      => { expect(scoreToRegime(0.0)).toBe("Low");      });
  it("1.9 → Low", ()      => { expect(scoreToRegime(1.9)).toBe("Low");      });
  it("2.0 → Guarded", ()  => { expect(scoreToRegime(2.0)).toBe("Guarded");  });
  it("3.9 → Guarded", ()  => { expect(scoreToRegime(3.9)).toBe("Guarded");  });
  it("4.0 → Elevated", () => { expect(scoreToRegime(4.0)).toBe("Elevated"); });
  it("5.9 → Elevated", () => { expect(scoreToRegime(5.9)).toBe("Elevated"); });
  it("6.0 → High", ()     => { expect(scoreToRegime(6.0)).toBe("High");     });
  it("7.9 → High", ()     => { expect(scoreToRegime(7.9)).toBe("High");     });
  it("8.0 → Crisis", ()   => { expect(scoreToRegime(8.0)).toBe("Crisis");   });
  it("10.0 → Crisis", ()  => { expect(scoreToRegime(10.0)).toBe("Crisis");  });
});

// ── rollingStats ──────────────────────────────────────────────────────────────

describe("rollingStats", () => {
  const baseline = FACTOR_BASELINES.vix;  // { mean: 18.5, std: 5.5 }

  it("returns baseline when history has <3 samples", () => {
    expect(rollingStats([], baseline)).toEqual(baseline);
    expect(rollingStats([20], baseline)).toEqual(baseline);
    expect(rollingStats([20, 22], baseline)).toEqual(baseline);
  });

  it("returns rolling stats when history has ≥3 samples", () => {
    const history = [18, 20, 22, 24];
    const result = rollingStats(history, baseline);
    expect(result.mean).toBeCloseTo(21.0);
    expect(result.std).toBeGreaterThan(0);
    expect(result.std).not.toBe(baseline.std);
  });

  it("std has a floor (does not collapse to 0 on constant series)", () => {
    const constantHistory = [20, 20, 20, 20, 20];
    const result = rollingStats(constantHistory, baseline);
    expect(result.std).toBeGreaterThan(0);
    // Floor is 15% of baseline std
    expect(result.std).toBeGreaterThanOrEqual(baseline.std * 0.15 - 0.001);
  });
});

// ── computeRiskPulse ──────────────────────────────────────────────────────────

const NEUTRAL_INPUTS: RawMacroInputs = {
  vix:        FACTOR_BASELINES.vix.mean,
  us10y:      FACTOR_BASELINES.us10y.mean,
  dxy:        FACTOR_BASELINES.dxy.mean,
  brent:      FACTOR_BASELINES.brent.mean,
  gold:       FACTOR_BASELINES.gold.mean,
  vix_vol:    FACTOR_BASELINES.vix_vol.mean,
  news_score: FACTOR_BASELINES.news_score.mean,
};

const EMPTY_HISTORY: FactorHistorySeries = {
  vix: [], us10y: [], dxy: [], brent: [], gold: [],
};

const BASE_OPTS = {
  newsCount24h:       5,
  highImpactEvents:   1,
  mediumImpactEvents: 2,
  quality:            "LIVE" as const,
  computedAt:         Date.now(),
  dataAge_ms:         100,
};

describe("computeRiskPulse — structure", () => {
  it("returns a snapshot with all required fields", () => {
    const snap = computeRiskPulse(NEUTRAL_INPUTS, EMPTY_HISTORY, [], BASE_OPTS, {});
    expect(typeof snap.score).toBe("number");
    expect(snap.factors).toHaveLength(7);
    expect(snap.regime).toBeDefined();
    expect(Array.isArray(snap.sparkline)).toBe(true);
  });

  it("score is between 0.0 and 10.0", () => {
    const snap = computeRiskPulse(NEUTRAL_INPUTS, EMPTY_HISTORY, [], BASE_OPTS, {});
    expect(snap.score).toBeGreaterThanOrEqual(0);
    expect(snap.score).toBeLessThanOrEqual(10);
  });

  it("all factor weights sum to 1.0", () => {
    const snap   = computeRiskPulse(NEUTRAL_INPUTS, EMPTY_HISTORY, [], BASE_OPTS, {});
    const sumW   = snap.factors.reduce((s, f) => s + f.weight, 0);
    expect(sumW).toBeCloseTo(1.0);
  });

  it("each factor contribution = weight × impact", () => {
    const snap = computeRiskPulse(NEUTRAL_INPUTS, EMPTY_HISTORY, [], BASE_OPTS, {});
    for (const f of snap.factors) {
      expect(f.contribution).toBeCloseTo(f.weight * f.impact, 4);
    }
  });
});

describe("computeRiskPulse — regime", () => {
  it("neutral conditions produce Guarded regime (score ~2.1)", () => {
    const snap = computeRiskPulse(NEUTRAL_INPUTS, EMPTY_HISTORY, [], BASE_OPTS, {});
    // At z=0: directional_impact = 0.25; oil_shock z=0 → shock_impact=0; geo z=0 → 0.25
    // score ≈ (0.25+0.20+0.15+0.15+0.10)×0.25×10 + 0 + 0.05×0.25×10 = 2.125 + 0.125 = 2.25
    expect(snap.score).toBeGreaterThan(1.5);
    expect(snap.score).toBeLessThan(4.0);
    expect(snap.regime).toMatch(/Low|Guarded/);
  });

  it("extreme stress inputs produce Crisis regime", () => {
    const stressed: RawMacroInputs = {
      vix:        50,   // +5.7σ above baseline
      us10y:      6.0,  // +3.1σ
      dxy:        120,  // +4.3σ
      brent:      110,  // +3.6σ absolute shock
      gold:       3200, // +4.5σ
      vix_vol:    10,   // +3.5σ
      news_score: 40,   // +5σ
    };
    const snap = computeRiskPulse(stressed, EMPTY_HISTORY, [], BASE_OPTS, {});
    expect(snap.score).toBeGreaterThanOrEqual(8.0);
    expect(snap.regime).toBe("Crisis");
  });

  it("calm inputs produce Low regime", () => {
    const calm: RawMacroInputs = {
      vix:        10,   // below mean
      us10y:      2.5,
      dxy:        96,
      brent:      78,   // at baseline (no oil shock)
      gold:       1900, // below mean
      vix_vol:    0.5,
      news_score: 0,
    };
    const snap = computeRiskPulse(calm, EMPTY_HISTORY, [], BASE_OPTS, {});
    expect(snap.score).toBeLessThan(2.0);
    expect(snap.regime).toBe("Low");
  });
});

describe("computeRiskPulse — sparkline + delta", () => {
  it("sparkline includes current score", () => {
    const prevScores = [3.0, 3.5, 4.0];
    const snap = computeRiskPulse(NEUTRAL_INPUTS, EMPTY_HISTORY, prevScores, BASE_OPTS, {});
    expect(snap.sparkline[snap.sparkline.length - 1]).toBe(snap.score);
  });

  it("deltaScore is null when no previous scores", () => {
    const snap = computeRiskPulse(NEUTRAL_INPUTS, EMPTY_HISTORY, [], BASE_OPTS, {});
    expect(snap.deltaScore).toBeNull();
  });

  it("deltaScore is score difference from previous", () => {
    const prev = [5.0];
    const snap = computeRiskPulse(NEUTRAL_INPUTS, EMPTY_HISTORY, prev, BASE_OPTS, {});
    expect(snap.deltaScore).toBeCloseTo(snap.score - 5.0, 1);
  });

  it("sparkline is capped at 20 entries", () => {
    const long = Array.from({ length: 25 }, (_, i) => i * 0.4);
    const snap = computeRiskPulse(NEUTRAL_INPUTS, EMPTY_HISTORY, long, BASE_OPTS, {});
    expect(snap.sparkline.length).toBeLessThanOrEqual(20);
  });
});

describe("computeRiskPulse — rolling history", () => {
  it("shifts z-scores when history is provided", () => {
    // History with high VIX values → mean shifts up → current baseline VIX has negative z → lower impact
    const highVixHistory: FactorHistorySeries = {
      vix:   [35, 36, 37, 38, 39],
      us10y: [], dxy: [], brent: [], gold: [],
    };
    const snapWithHistory = computeRiskPulse(NEUTRAL_INPUTS, highVixHistory, [], BASE_OPTS, {});
    const snapNoHistory   = computeRiskPulse(NEUTRAL_INPUTS, EMPTY_HISTORY,  [], BASE_OPTS, {});

    const equityWithHistory = snapWithHistory.factors.find((f) => f.id === "equity_stress")!;
    const equityNoHistory   = snapNoHistory.factors.find((f) => f.id === "equity_stress")!;

    // With high-VIX history, the current (normal) VIX has a negative z → lower impact
    expect(equityWithHistory.zscore).toBeLessThan(equityNoHistory.zscore);
  });
});
