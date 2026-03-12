/**
 * marketOverviewUx.test.ts
 *
 * Tests for the /market-overview page UX fixes:
 * 1. No stale hardcoded fallback prices — error state shown instead
 * 2. Responsive FX heatmap grid (auto-fill minmax)
 * 3. Responsive page layout grid (auto-fill minmax)
 */

import * as fs from "fs";
import * as path from "path";

const PAGE_PATH = path.resolve(
  __dirname,
  "../../app/market-overview/page.tsx"
);
const src = fs.readFileSync(PAGE_PATH, "utf-8");

// ─── 1. No stale hardcoded fallback prices ────────────────────────────────────

describe("market-overview: no stale fallback prices", () => {
  it("does not contain the defaultPairs constant", () => {
    expect(src).not.toContain("const defaultPairs");
  });

  it("does not contain hardcoded EUR/USD rate 1.0847", () => {
    expect(src).not.toContain("1.0847");
  });

  it("does not contain hardcoded GBP/USD rate 1.2710", () => {
    expect(src).not.toContain("1.2710");
  });

  it("does not contain hardcoded USD/JPY rate 149.50", () => {
    expect(src).not.toContain("149.50");
  });

  it("tracks an error state", () => {
    expect(src).toContain("const [error, setError] = useState(false)");
  });

  it("sets error true on non-ok response", () => {
    expect(src).toContain("setError(true)");
  });

  it("resets error on fetch start", () => {
    expect(src).toContain("setError(false)");
  });

  it("imports EmptyState component", () => {
    expect(src).toContain('import EmptyState from "@/components/ui/EmptyState"');
  });

  it("renders EmptyState with 'Unable to load FX data' title on error", () => {
    expect(src).toContain('title="Unable to load FX data"');
  });

  it("EmptyState is of type error", () => {
    expect(src).toContain('type="error"');
  });

  it("provides a Retry action on the error EmptyState", () => {
    expect(src).toContain('label: "Retry"');
  });
});

// ─── 2. Responsive FX heatmap grid ───────────────────────────────────────────

describe("market-overview: responsive FX heatmap grid", () => {
  it("does not use fixed repeat(4, 1fr) for heatmap", () => {
    expect(src).not.toContain("repeat(4, 1fr)");
  });

  it("uses auto-fill minmax(160px, 1fr) for heatmap grid", () => {
    expect(src).toContain("repeat(auto-fill, minmax(160px, 1fr))");
  });
});

// ─── 3. Responsive page layout grid ──────────────────────────────────────────

describe("market-overview: responsive page layout", () => {
  it("does not use fixed 1fr 1fr for page grid", () => {
    expect(src).not.toContain('"1fr 1fr"');
  });

  it("uses auto-fill minmax(400px, 1fr) for page layout", () => {
    expect(src).toContain("repeat(auto-fill, minmax(400px, 1fr))");
  });
});

// ─── 4. FxHeatmap component accepts error + onRetry props ────────────────────

describe("market-overview: FxHeatmap error props", () => {
  it("FxHeatmap accepts error prop", () => {
    expect(src).toContain("error: boolean");
  });

  it("FxHeatmap accepts onRetry prop", () => {
    expect(src).toContain("onRetry: () => void");
  });

  it("passes error and onRetry to FxHeatmap", () => {
    expect(src).toContain("error={error}");
    expect(src).toContain("onRetry={fetchRates}");
  });
});
