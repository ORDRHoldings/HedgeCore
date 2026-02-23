/**
 * mathEngine.ts — Institutional-grade quantitative math library
 * ORDR Terminal · HedgeCore Simulation Engine
 *
 * All functions are pure, side-effect-free, and browser/SSR-safe.
 * References: Hull (2021), Almgren-Chriss (2001), Kyle (1985), Vasicek (1977),
 *             Nelson-Siegel (1987), BCBS 279, ISDA SIMM v2.6
 */

// ── Normal distribution helpers ───────────────────────────────────────────────

/**
 * Standard normal CDF using Abramowitz & Stegun approximation 26.2.17
 * Max error: 7.5e-8
 */
export function normCDF(x: number): number {
  if (!isFinite(x)) return x > 0 ? 1 : 0;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t * (0.319381530 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 + t * 1.330274429))));
  const pdf = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

/**
 * Standard normal PDF
 */
export function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Inverse normal CDF (quantile function)
 * Beasley-Springer-Moro approximation
 */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
  const b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
  const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209,
             0.0276438810333863, 0.0038405729373609, 0.0003951896511349,
             0.0000321767881768, 0.0000002888167364, 0.0000003960315187];

  const y = p - 0.5;
  if (Math.abs(y) < 0.42) {
    const r = y * y;
    return y * (((a[3] * r + a[2]) * r + a[1]) * r + a[0]) /
               ((((b[3] * r + b[2]) * r + b[1]) * r + b[0]) * r + 1);
  }

  let r = p < 0.5 ? p : 1 - p;
  r = Math.sqrt(-Math.log(r));
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] * Math.pow(r, i);
  return p < 0.5 ? -x : x;
}

// ── GARCH(1,1) Volatility ─────────────────────────────────────────────────────

/**
 * Fits GARCH(1,1) model: σ²_t = ω + α·ε²_{t-1} + β·σ²_{t-1}
 * Uses moment matching: typical EM params α=0.09, β=0.90
 * ω = σ²_long × (1 - α - β)
 *
 * @param returns - Array of log returns
 * @param alpha   - ARCH coefficient (default 0.09)
 * @param beta    - GARCH coefficient (default 0.90)
 * @returns Annualised conditional volatility estimate
 */
export function garch11Vol(returns: number[], alpha = 0.09, beta = 0.90): number {
  if (returns.length < 2) return 0;
  const n = returns.length;
  const mean = returns.reduce((s, r) => s + r, 0) / n;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);

  const omega = variance * (1 - alpha - beta);
  let sigma2 = variance;

  // Iterate GARCH recursion
  for (let i = 1; i < returns.length; i++) {
    const eps2 = (returns[i - 1] - mean) ** 2;
    sigma2 = omega + alpha * eps2 + beta * sigma2;
  }

  // Annualise: multiply daily variance by 252
  return Math.sqrt(sigma2 * 252);
}

/**
 * GARCH(1,1) persistence = α + β
 * High persistence (>0.97) is common in EM FX
 */
export function garchPersistence(alpha = 0.09, beta = 0.90): number {
  return alpha + beta;
}

/**
 * GARCH(1,1) long-run (unconditional) variance
 * σ²_∞ = ω / (1 - α - β)
 */
export function garchLongRunVol(omega: number, alpha: number, beta: number): number {
  const persistence = alpha + beta;
  if (persistence >= 1) return Infinity;
  return Math.sqrt(omega / (1 - persistence) * 252);
}

// ── Nelson-Siegel-Svensson (NSS) Forward Curve ────────────────────────────────

/**
 * NSS forward rate function:
 * f(τ) = β₀ + β₁·exp(-τ/λ₁) + β₂·(τ/λ₁)·exp(-τ/λ₁) + β₃·(τ/λ₂)·exp(-τ/λ₂)
 *
 * @param tau    - Tenor in years
 * @param beta   - [β₀, β₁, β₂, β₃] level, slope, curvature, second hump
 * @param lambda - [λ₁, λ₂] decay parameters
 * @returns Instantaneous forward rate at tenor τ
 */
export function nssFwdRate(
  tau: number,
  beta: [number, number, number, number],
  lambda: [number, number]
): number {
  if (tau <= 0) return beta[0] + beta[1];
  const [b0, b1, b2, b3] = beta;
  const [l1, l2] = lambda;
  const e1 = Math.exp(-tau / l1);
  const e2 = Math.exp(-tau / l2);
  return b0 + b1 * e1 + b2 * (tau / l1) * e1 + b3 * (tau / l2) * e2;
}

/**
 * NSS zero-coupon yield (spot rate) — integral of forward rate
 * y(τ) = β₀ + β₁·[(1-exp(-τ/λ₁))/(τ/λ₁)]
 *        + β₂·[(1-exp(-τ/λ₁))/(τ/λ₁) - exp(-τ/λ₁)]
 *        + β₃·[(1-exp(-τ/λ₂))/(τ/λ₂) - exp(-τ/λ₂)]
 */
export function nssSpotRate(
  tau: number,
  beta: [number, number, number, number],
  lambda: [number, number]
): number {
  if (tau <= 0) return beta[0] + beta[1];
  const [b0, b1, b2, b3] = beta;
  const [l1, l2] = lambda;
  const e1 = Math.exp(-tau / l1);
  const e2 = Math.exp(-tau / l2);
  const f1 = (1 - e1) / (tau / l1);
  const f2 = (1 - e2) / (tau / l2);
  return b0 + b1 * f1 + b2 * (f1 - e1) + b3 * (f2 - e2);
}

// ── Covered Interest Parity ───────────────────────────────────────────────────

/**
 * Continuous CIP forward rate:
 * F(T) = S × exp((r_d - r_f) × T)
 */
export function continuousCIP(spot: number, rd: number, rf: number, T: number): number {
  return spot * Math.exp((rd - rf) * T);
}

/**
 * Discrete CIP forward rate:
 * F(T) = S × (1 + r_quote × T) / (1 + r_base × T)
 */
export function discreteCIP(spot: number, rQuote: number, rBase: number, T: number): number {
  return spot * (1 + rQuote * T) / (1 + rBase * T);
}

/**
 * Forward points = F(T) - S (in price terms)
 */
export function forwardPoints(spot: number, rQuote: number, rBase: number, T: number): number {
  return discreteCIP(spot, rQuote, rBase, T) - spot;
}

// ── Garman-Kohlhagen FX Option Pricing ───────────────────────────────────────

export interface GKResult {
  price: number;
  delta: number;   // ∂C/∂S
  gamma: number;   // ∂²C/∂S²
  vega: number;    // ∂C/∂σ (per 1% vol change)
  theta: number;   // ∂C/∂t (per calendar day)
  rho: number;     // ∂C/∂r_d (per 1% rate change)
}

/**
 * Garman-Kohlhagen (1983) FX option pricing
 *
 * C = S·e^{-r_f·T}·N(d₁) - K·e^{-r_d·T}·N(d₂)
 * P = K·e^{-r_d·T}·N(-d₂) - S·e^{-r_f·T}·N(-d₁)
 *
 * d₁ = [ln(S/K) + (r_d - r_f + σ²/2)·T] / (σ·√T)
 * d₂ = d₁ - σ·√T
 */
export function garmanKohlhagen(
  S: number,     // Current spot
  K: number,     // Strike
  T: number,     // Time to expiry (years)
  rd: number,    // Domestic risk-free rate
  rf: number,    // Foreign risk-free rate
  sigma: number, // Implied volatility (annualised)
  optionType: "call" | "put"
): GKResult {
  if (T <= 0) {
    const intrinsic = optionType === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return { price: intrinsic, delta: optionType === "call" ? (S > K ? 1 : 0) : (K > S ? -1 : 0), gamma: 0, vega: 0, theta: 0, rho: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (rd - rf + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const erf = Math.exp(-rf * T);
  const erd = Math.exp(-rd * T);
  const nd1 = normCDF(d1);
  const nd2 = normCDF(d2);
  const npd1 = normPDF(d1);

  let price: number, delta: number, rho: number;

  if (optionType === "call") {
    price = S * erf * nd1 - K * erd * nd2;
    delta = erf * nd1;
    rho = K * T * erd * nd2 / 100;
  } else {
    price = K * erd * normCDF(-d2) - S * erf * normCDF(-d1);
    delta = -erf * normCDF(-d1);
    rho = -K * T * erd * normCDF(-d2) / 100;
  }

  const gamma = erf * npd1 / (S * sigma * sqrtT);
  const vega = S * erf * npd1 * sqrtT / 100;   // per 1% vol move
  const theta = (
    -(S * erf * npd1 * sigma) / (2 * sqrtT)
    + (optionType === "call"
      ? (rf * S * erf * nd1 - rd * K * erd * nd2)
      : (-rf * S * erf * normCDF(-d1) + rd * K * erd * normCDF(-d2)))
  ) / 365;

  return { price, delta, gamma, vega, theta, rho };
}

// ── Cornish-Fisher VaR ────────────────────────────────────────────────────────

export interface CornishFisherResult {
  var95: number;
  var99: number;
  cvar95: number;
  cvar99: number;
  skewness: number;
  kurtosis: number;     // excess kurtosis
  cfAdjustment95: number;
  cfAdjustment99: number;
  normalVar95: number;
  normalVar99: number;
}

/**
 * Cornish-Fisher expansion for adjusted VaR quantile:
 * z_CF = z + (z²-1)·γ₁/6 + (z³-3z)·γ₂/24 - (2z³-5z)·γ₁²/36
 *
 * Where γ₁ = skewness, γ₂ = excess kurtosis
 *
 * VaR_CF = -μ - σ · z_CF
 */
export function cornishFisherVaR(
  returns: number[],
  notional = 1
): CornishFisherResult {
  const n = returns.length;
  if (n < 4) {
    return { var95: 0, var99: 0, cvar95: 0, cvar99: 0, skewness: 0, kurtosis: 0,
             cfAdjustment95: 0, cfAdjustment99: 0, normalVar95: 0, normalVar99: 0 };
  }

  const mean = returns.reduce((s, r) => s + r, 0) / n;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);

  const skewness = returns.reduce((s, r) => s + ((r - mean) / std) ** 3, 0) / n;
  const kurtosis = returns.reduce((s, r) => s + ((r - mean) / std) ** 4, 0) / n - 3;

  const cfQuantile = (p: number): number => {
    const z = normInv(p);
    return z + (z ** 2 - 1) * skewness / 6
             + (z ** 3 - 3 * z) * kurtosis / 24
             - (2 * z ** 3 - 5 * z) * skewness ** 2 / 36;
  };

  const z95 = normInv(0.95);
  const z99 = normInv(0.99);
  const cf95 = cfQuantile(0.95);
  const cf99 = cfQuantile(0.99);

  const normalVar95 = Math.abs(-mean - std * z95) * notional;
  const normalVar99 = Math.abs(-mean - std * z99) * notional;
  const var95 = Math.abs(-mean - std * cf95) * notional;
  const var99 = Math.abs(-mean - std * cf99) * notional;

  // CVaR (Expected Shortfall) via sorted returns
  const sorted = [...returns].sort((a, b) => a - b);
  const idx95 = Math.floor(n * 0.05);
  const idx99 = Math.floor(n * 0.01);
  const cvar95 = Math.abs(sorted.slice(0, Math.max(idx95, 1)).reduce((s, r) => s + r, 0) / Math.max(idx95, 1)) * notional;
  const cvar99 = Math.abs(sorted.slice(0, Math.max(idx99, 1)).reduce((s, r) => s + r, 0) / Math.max(idx99, 1)) * notional;

  return {
    var95, var99, cvar95, cvar99,
    skewness, kurtosis,
    cfAdjustment95: var95 - normalVar95,
    cfAdjustment99: var99 - normalVar99,
    normalVar95, normalVar99,
  };
}

// ── VaR Cone (square-root-of-time scaling) ────────────────────────────────────

export interface VaRConePoint {
  horizon: number;   // days
  label: string;
  var95Normal: number;
  var99Normal: number;
  var99CF: number;
}

/**
 * VaR cone: VaR_T = VaR_1 × √T (square-root-of-time rule)
 * Cornish-Fisher adjusted for long horizons
 */
export function varCone(
  vol: number,        // annualised vol
  notional: number,
  skewness = -0.5,
  kurtosis = 1.0
): VaRConePoint[] {
  const dailyVol = vol / Math.sqrt(252);
  const horizons = [1, 5, 10, 21, 63];
  const labels = ["1D", "5D", "10D", "1M", "3M"];

  return horizons.map((h, i) => {
    const hVol = dailyVol * Math.sqrt(h);
    const z95 = normInv(0.95);
    const z99 = normInv(0.99);
    const cf99 = z99 + (z99 ** 2 - 1) * skewness / 6
                     + (z99 ** 3 - 3 * z99) * kurtosis / 24
                     - (2 * z99 ** 3 - 5 * z99) * skewness ** 2 / 36;
    return {
      horizon: h,
      label: labels[i],
      var95Normal: hVol * z95 * notional,
      var99Normal: hVol * z99 * notional,
      var99CF: hVol * Math.abs(cf99) * notional,
    };
  });
}

// ── t-Copula Tail Dependence ──────────────────────────────────────────────────

/**
 * t-copula upper (= lower) tail dependence coefficient:
 * λ = 2·T_{ν+1}(-√((ν+1)(1-ρ)/(1+ρ)))
 *
 * For t-copula with ν degrees of freedom and linear correlation ρ
 * Captures joint extreme events not captured by linear correlation alone
 *
 * @param rho - Linear (Pearson) correlation
 * @param nu  - Degrees of freedom (lower → heavier tails, fatter joint extremes)
 */
export function tCopulaTailDependence(rho: number, nu: number): number {
  if (rho >= 1) return 1;
  if (rho <= -1) return 0;
  const arg = -Math.sqrt((nu + 1) * (1 - rho) / (1 + rho));
  // Use Student-t CDF approximation for (nu+1) dof
  const tCDF = studentTCDF(arg, nu + 1);
  return 2 * tCDF;
}

/** Student-t CDF approximation via regularised incomplete beta */
function studentTCDF(t: number, nu: number): number {
  const x = nu / (nu + t * t);
  const ibeta = incompleteBeta(nu / 2, 0.5, x);
  return t < 0 ? ibeta / 2 : 1 - ibeta / 2;
}

/** Regularised incomplete beta function — continued fraction approximation */
function incompleteBeta(a: number, b: number, x: number): number {
  if (x < 0 || x > 1) return 0;
  if (x === 0) return 0;
  if (x === 1) return 1;

  const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;

  // Continued fraction (Lentz)
  let f = 1, C = 1, D = 1 - (a + b) * x / (a + 1);
  D = D === 0 ? 1e-30 : 1 / D;
  f = D;

  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    D = 1 + aa * D;
    C = 1 + aa / C;
    D = D === 0 ? 1e-30 : 1 / D;
    f *= D * C;

    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    D = 1 + aa * D;
    C = 1 + aa / C;
    D = D === 0 ? 1e-30 : 1 / D;
    f *= D * C;
    if (Math.abs(D * C - 1) < 1e-8) break;
  }

  return front * f;
}

function lgamma(x: number): number {
  const coeffs = [76.18009172947146, -86.50532032941677, 24.01409824083091,
                  -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const c of coeffs) { y++; ser += c / y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// ── Portfolio VaR via Monte Carlo (Cholesky) ──────────────────────────────────

export interface PortfolioVaRResult {
  var95: number;
  var99: number;
  cvar95: number;
  cvar99: number;
  percentiles: number[];   // [P1, P5, P10, P25, P50, P75, P90, P95, P99]
  diversificationBenefit: number;
}

/**
 * Monte Carlo portfolio VaR using Cholesky decomposition of correlation matrix
 * Simulates correlated FX returns and computes portfolio loss distribution
 *
 * @param positions    - Array of {notionalUSD, vol} for each position
 * @param correlMatrix - n×n correlation matrix
 * @param nSims        - Number of simulations (default 10000)
 */
export function portfolioVaRMC(
  positions: Array<{ notionalUSD: number; vol: number }>,
  correlMatrix: number[][],
  nSims = 10_000
): PortfolioVaRResult {
  const n = positions.length;
  if (n === 0) return { var95: 0, var99: 0, cvar95: 0, cvar99: 0, percentiles: [], diversificationBenefit: 0 };

  // Cholesky decomposition
  const L = choleskyDecompose(correlMatrix);
  const dailyVols = positions.map(p => p.vol / Math.sqrt(252));

  // Simulate portfolio losses
  const losses: number[] = [];
  for (let s = 0; s < nSims; s++) {
    // Draw n independent standard normals
    const z: number[] = [];
    for (let i = 0; i < n; i++) {
      z.push(boxMuller());
    }
    // Correlated normals via Cholesky: y = L·z
    const y: number[] = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        y[i] += L[i][j] * z[j];
      }
    }
    // Portfolio loss = -Σ notional × daily_vol × correlated_shock
    let loss = 0;
    for (let i = 0; i < n; i++) {
      loss -= positions[i].notionalUSD * dailyVols[i] * y[i];
    }
    losses.push(loss);
  }

  losses.sort((a, b) => b - a);  // Descending: worst first

  const idx95 = Math.floor(nSims * 0.05);
  const idx99 = Math.floor(nSims * 0.01);

  const var95 = losses[idx95];
  const var99 = losses[idx99];
  const cvar95 = losses.slice(0, idx95).reduce((s, l) => s + l, 0) / Math.max(idx95, 1);
  const cvar99 = losses.slice(0, idx99).reduce((s, l) => s + l, 0) / Math.max(idx99, 1);

  const pctIndices = [0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99];
  const percentiles = pctIndices.map(p => losses[Math.floor(nSims * (1 - p))]);

  // Diversification benefit vs sum of individual VaRs
  const sumIndividualVar99 = positions.reduce((s, p) => {
    const dv = p.vol / Math.sqrt(252);
    return s + p.notionalUSD * dv * normInv(0.99);
  }, 0);
  const diversificationBenefit = (sumIndividualVar99 - var99) / sumIndividualVar99;

  return { var95, var99, cvar95, cvar99, percentiles, diversificationBenefit };
}

/** Cholesky decomposition: A = L·Lᵀ */
function choleskyDecompose(A: number[][]): number[][] {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(sum, 0)) : (L[j][j] > 0 ? sum / L[j][j] : 0);
    }
  }
  return L;
}

/** Box-Muller transform for N(0,1) */
let _bmSpare: number | null = null;
function boxMuller(): number {
  if (_bmSpare !== null) {
    const v = _bmSpare;
    _bmSpare = null;
    return v;
  }
  let u, v, s;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  const mul = Math.sqrt(-2 * Math.log(s) / s);
  _bmSpare = v * mul;
  return u * mul;
}

// ── FRTB SBM FX Delta Risk Charge (BCBS 457) ─────────────────────────────────

/**
 * FRTB Standardised Approach: FX Delta Risk
 *
 * Risk weight: RW_FX = 15% (BCBS 457 Table 11)
 * Sensitivity: s_k = notional × 1% = notional × 0.01
 * Weighted sensitivity: WS_k = RW × s_k
 * Bucket charge: K = √(Σ_k WS_k² + Σ_{k≠l} ρ × WS_k × WS_l)
 * FX intra-bucket correlation: ρ = 0.0 (all pairs different buckets in FX)
 */
export function frtbFXDeltaCharge(
  positions: Array<{ notionalUSD: number; currency: string }>
): {
  deltaCharge: number;
  weightedSensitivities: Record<string, number>;
  totalRW: number;
} {
  const RW_FX = 0.15;  // BCBS 457 Table 11

  const wsByPair: Record<string, number> = {};
  for (const pos of positions) {
    const sensitivity = pos.notionalUSD * 0.01;  // 1% prescribed shift
    const ws = RW_FX * sensitivity;
    wsByPair[pos.currency] = (wsByPair[pos.currency] ?? 0) + ws;
  }

  // Each currency pair is its own bucket in FRTB FX; intra-bucket ρ=1 for same pair
  // Cross-bucket correlation γ=0.60 for FRTB FX (BCBS 457 §B.21)
  const currencies = Object.keys(wsByPair);
  const gamma = 0.60;

  let charge2 = 0;
  for (let i = 0; i < currencies.length; i++) {
    charge2 += wsByPair[currencies[i]] ** 2;
    for (let j = i + 1; j < currencies.length; j++) {
      charge2 += 2 * gamma * wsByPair[currencies[i]] * wsByPair[currencies[j]];
    }
  }

  const deltaCharge = Math.sqrt(Math.max(charge2, 0));
  const totalRW = Object.values(wsByPair).reduce((s, ws) => s + Math.abs(ws), 0);

  return { deltaCharge, weightedSensitivities: wsByPair, totalRW };
}

// ── Vasicek Short Rate Simulation ─────────────────────────────────────────────

/**
 * Vasicek (1977) mean-reverting short rate model:
 * dr = κ(θ - r)dt + σ·dW
 *
 * Analytical solution:
 * r(t) = r₀·e^{-κt} + θ(1-e^{-κt}) + σ·∫₀ᵗ e^{-κ(t-s)}dW_s
 *
 * Conditional distribution: r(t)|r₀ ~ N(E[r(t)], Var[r(t)])
 * E[r(t)] = θ + (r₀-θ)·e^{-κt}
 * Var[r(t)] = σ²(1-e^{-2κt})/(2κ)
 *
 * @param r0      - Initial short rate
 * @param kappa   - Mean reversion speed (typical: 0.1–0.5)
 * @param theta   - Long-run mean rate
 * @param sigma   - Vol of short rate
 * @param T       - Time horizon (years)
 * @param nSteps  - Simulation steps
 * @param nPaths  - Number of paths
 */
export function vasicekSimulate(
  r0: number,
  kappa: number,
  theta: number,
  sigma: number,
  T: number,
  nSteps: number,
  nPaths: number
): number[][] {
  const dt = T / nSteps;
  const sqrtDt = Math.sqrt(dt);
  const results: number[][] = [];

  for (let p = 0; p < nPaths; p++) {
    const path: number[] = [r0];
    let r = r0;
    for (let s = 0; s < nSteps; s++) {
      r += kappa * (theta - r) * dt + sigma * sqrtDt * boxMuller();
      path.push(r);
    }
    results.push(path);
  }
  return results;
}

// ── Hedge Effectiveness Regression (Johnson 1960 / Stein 1961) ───────────────

export interface HedgeEffectivenessResult {
  rSquared: number;
  beta: number;           // Minimum-variance hedge ratio
  intercept: number;
  tStat: number;
  pValue: number;
  effectivenessPct: number;
  hedgeRatioOptimal: number;
}

/**
 * OLS regression: ΔHedge = α + β·ΔExposure + ε
 * R² = hedge effectiveness measure
 *
 * Minimum variance hedge ratio:
 * h* = Cov(ΔS, ΔF) / Var(ΔF) = ρ·σ_S/σ_F
 */
export function hedgeEffectivenessRegression(
  exposureChanges: number[],
  hedgeChanges: number[]
): HedgeEffectivenessResult {
  const n = exposureChanges.length;
  if (n < 3) {
    return { rSquared: 0, beta: 0, intercept: 0, tStat: 0, pValue: 1, effectivenessPct: 0, hedgeRatioOptimal: 0 };
  }

  const meanX = exposureChanges.reduce((s, x) => s + x, 0) / n;
  const meanY = hedgeChanges.reduce((s, y) => s + y, 0) / n;

  let ssXX = 0, ssXY = 0, ssYY = 0;
  for (let i = 0; i < n; i++) {
    const dx = exposureChanges[i] - meanX;
    const dy = hedgeChanges[i] - meanY;
    ssXX += dx * dx;
    ssXY += dx * dy;
    ssYY += dy * dy;
  }

  const beta = ssXX > 0 ? ssXY / ssXX : 0;
  const intercept = meanY - beta * meanX;
  const rSquared = ssXX > 0 && ssYY > 0 ? (ssXY * ssXY) / (ssXX * ssYY) : 0;

  // Residual standard error
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const resid = hedgeChanges[i] - (intercept + beta * exposureChanges[i]);
    sse += resid * resid;
  }
  const mse = sse / (n - 2);
  const seBeta = Math.sqrt(mse / ssXX);
  const tStat = seBeta > 0 ? beta / seBeta : 0;

  // p-value from t-distribution (two-sided)
  const pValue = 2 * studentTCDF(-Math.abs(tStat), n - 2);

  // Minimum-variance hedge ratio
  const sigmaX = Math.sqrt(ssXX / (n - 1));
  const sigmaY = Math.sqrt(ssYY / (n - 1));
  const corr = sigmaX > 0 && sigmaY > 0 ? ssXY / Math.sqrt(ssXX * ssYY) : 0;
  const hedgeRatioOptimal = sigmaY > 0 ? corr * sigmaX / sigmaY : 0;

  return { rSquared, beta, intercept, tStat, pValue, effectivenessPct: rSquared * 100, hedgeRatioOptimal };
}

// ── Expected Shortfall (Conditional VaR) ──────────────────────────────────────

/**
 * Parametric Expected Shortfall (CVaR) under normality:
 * ES_α = μ + σ · φ(Φ⁻¹(α)) / (1 - α)
 *
 * Historical ES from sorted returns
 */
export function expectedShortfall(returns: number[], confidence: number, notional = 1): number {
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = Math.floor((1 - confidence) * sorted.length);
  if (cutoff === 0) return Math.abs(sorted[0]) * notional;
  const tailMean = sorted.slice(0, cutoff).reduce((s, r) => s + r, 0) / cutoff;
  return Math.abs(tailMean) * notional;
}

// ── Heston Stochastic Volatility Moments ──────────────────────────────────────

/**
 * Simplified Heston (1993) moment approximations for vol surface shape
 *
 * Parameters:
 * - v0: initial variance
 * - kappa: mean reversion speed of variance
 * - theta: long-run variance
 * - xi: vol of vol (volatility of variance)
 * - rho_sv: correlation between spot and variance processes
 */
export function hestonMoments(
  v0: number,      // Initial variance
  kappa: number,   // Mean reversion
  theta: number,   // Long-run variance
  xi: number,      // Vol of vol
  rho_sv: number,  // Spot-vol correlation (typically negative, e.g. -0.7)
  T: number
): { meanVol: number; volOfVol: number; skewAdjustment: number } {
  // E[V(T)] = θ + (v₀ - θ)e^{-κT}
  const meanVar = theta + (v0 - theta) * Math.exp(-kappa * T);
  const meanVol = Math.sqrt(Math.max(meanVar, 0));

  // Variance of V(T): Var[V(T)] = v₀ξ²e^{-κT}(1-e^{-κT})/κ + θξ²(1-e^{-κT})²/(2κ)
  const eKappaT = Math.exp(-kappa * T);
  const varV = v0 * xi ** 2 * eKappaT * (1 - eKappaT) / kappa
             + theta * xi ** 2 * (1 - eKappaT) ** 2 / (2 * kappa);
  const volOfVol = Math.sqrt(Math.max(varV, 0));

  // Skew approximation: S ≈ ρ_sv × ξ / (κ × σ) × (1 - e^{-κT}) (Heston skew formula)
  const skewAdjustment = rho_sv * xi / (kappa * Math.sqrt(meanVar)) * (1 - eKappaT);

  return { meanVol, volOfVol, skewAdjustment };
}

// ── IFRS 9 Effectiveness Test ─────────────────────────────────────────────────

export interface IFRS9EffectivenessResult {
  ratio: number;            // Hedge effectiveness ratio
  passes80125: boolean;     // IFRS 9.6.4.1 bright-line test
  prospectiveGBM: number;   // GBM-based prospective test
  hedgeRatioOptimal: number;
  recommendation: "EFFECTIVE" | "BORDERLINE" | "INEFFECTIVE" | "OVER_HEDGED";
}

/**
 * IFRS 9 hedge effectiveness test
 * Prospective: GBM simulation over remaining tenor
 * Retrospective: dollar-offset method
 *
 * ε = ΔFair_value_hedge_instrument / ΔFair_value_hedged_item
 * IFRS 9.6.4.1: 80% ≤ ε ≤ 125%
 */
export function ifrs9EffectivenessTest(
  hedgeNotional: number,
  exposureNotional: number,
  vol: number,
  T: number,
  correlation = 0.99
): IFRS9EffectivenessResult {
  // Dollar-offset ratio
  const ratio = hedgeNotional / Math.max(exposureNotional, 1);
  const passes80125 = ratio >= 0.80 && ratio <= 1.25;

  // GBM prospective: simulate spot shock and compute hedged/unhedged
  const sigmaT = vol * Math.sqrt(T);
  // At 1σ adverse move: hedged vs unhedged P&L ratio
  const spot = 1;
  const shockedSpot = spot * Math.exp(-sigmaT);
  const unhedgedPnl = exposureNotional * (shockedSpot - spot);
  const hedgePnl = -hedgeNotional * (shockedSpot - spot) * correlation;
  const prospectiveGBM = Math.abs(unhedgedPnl) > 0
    ? Math.abs((unhedgedPnl + hedgePnl) / unhedgedPnl) * 100
    : 100;

  const hedgeRatioOptimal = correlation;

  const recommendation: IFRS9EffectivenessResult["recommendation"] =
    ratio > 1.25 ? "OVER_HEDGED" :
    ratio >= 0.80 ? "EFFECTIVE" :
    ratio >= 0.70 ? "BORDERLINE" : "INEFFECTIVE";

  return { ratio, passes80125, prospectiveGBM, hedgeRatioOptimal, recommendation };
}

// ── SA-CCR EAD (BCBS 279) ─────────────────────────────────────────────────────

export interface SACCRResult {
  rc: number;          // Replacement cost
  pfe: number;         // Potential future exposure
  addOn: number;       // Aggregate add-on
  multiplier: number;
  ead: number;         // EAD = 1.4 × (RC + PFE)
  rwa: number;         // Risk-weighted assets (×100% for FX)
}

/**
 * SA-CCR per BCBS 279:
 * EAD = α × (RC + PFE)
 * α = 1.4
 * PFE = multiplier × AggregateAddOn
 * AddOn_FX = SF_FX × |N| × MF
 * SF_FX = 4%
 * MF = √(min(M, 1year) / 1year) for un-margined
 */
export function saCCREAD(params: {
  mtm: number;         // Mark-to-market value (can be negative)
  notionalUSD: number;
  maturityYears: number;
  collateral?: number;
}): SACCRResult {
  const { mtm, notionalUSD, maturityYears, collateral = 0 } = params;
  const alpha = 1.4;
  const SF_FX = 0.04;
  const MF = Math.sqrt(Math.min(maturityYears, 1));

  const rc = Math.max(mtm - collateral, 0);
  const addOn = SF_FX * Math.abs(notionalUSD) * MF;

  // Multiplier
  const floorMult = 0.05;
  const multiplier = mtm >= 0
    ? 1
    : Math.min(1, floorMult + (1 - floorMult) * Math.exp(mtm / (2 * (1 - floorMult) * addOn)));

  const pfe = multiplier * addOn;
  const ead = alpha * (rc + pfe);
  const rwa = ead * 1.0;  // FX counterparty risk weight depends on rating; use 1.0 (100%)

  return { rc, pfe, addOn, multiplier, ead, rwa };
}
