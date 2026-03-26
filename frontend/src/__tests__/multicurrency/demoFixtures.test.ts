import { buildDemoRequest, getDemoRequest } from "../../constants/demoFixtures";

describe("demoFixtures", () => {
  it("builds USDMXN demo request", () => {
    const req = buildDemoRequest("USDMXN");
    expect(req.trades.length).toBeGreaterThan(0);
    expect(req.trades[0].currency).toBe("MXN");
  });

  it("builds EURUSD demo request", () => {
    const req = buildDemoRequest("EURUSD");
    expect(req.trades[0].currency).toBe("EUR");
  });

  it("USDBRL request has NDF execution product", () => {
    const req = buildDemoRequest("USDBRL");
    expect(req.policy.execution_product).toBe("NDF");
  });

  it("EURUSD request has FWD execution product", () => {
    const req = buildDemoRequest("EURUSD");
    expect(req.policy.execution_product).toBe("FWD");
  });

  it("getDemoRequest caches results", () => {
    const r1 = getDemoRequest("USDMXN");
    const r2 = getDemoRequest("USDMXN");
    expect(r1).toBe(r2); // same reference
  });

  it("throws for unknown pair", () => {
    expect(() => buildDemoRequest("UNKNOWN")).toThrow();
  });

  it("all trades have valid structure", () => {
    const req = buildDemoRequest("USDJPY");
    req.trades.forEach(t => {
      expect(t.record_id).toBeTruthy();
      expect(t.currency).toBe("JPY");
      expect(t.amount).toBeGreaterThan(0);
    });
  });

  it("market data is empty — must be populated by autofill", () => {
    const req = buildDemoRequest("USDMXN");
    expect(req.market.spot_rate).toBe(0);
    expect(Object.keys(req.market.forward_points_by_month)).toHaveLength(0);
  });

  it("provider_metadata has no hardcoded fx_rates", () => {
    const req = buildDemoRequest("EURUSD");
    const meta = req.market.provider_metadata as Record<string, unknown>;
    expect(meta.fx_rates).toBeUndefined();
  });
});
