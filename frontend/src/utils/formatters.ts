export function fmtMXN(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'decimal', maximumFractionDigits: 0 }).format(v);
}

export function fmtUSD(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}

export function fmtRate(v: number): string {
  return v.toFixed(4);
}

export function fmtPct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

export function fmtSigma(v: number): string {
  return `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`;
}

export function fmtCompact(v: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}
