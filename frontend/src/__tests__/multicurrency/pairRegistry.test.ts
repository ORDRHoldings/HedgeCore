import { PAIR_REGISTRY, getPairMeta, getNdfPairs, getPairsByGroup } from "../../constants/pairRegistry";

describe("pairRegistry", () => {
  it("has exactly 26 pairs", () => {
    expect(PAIR_REGISTRY).toHaveLength(26);
  });

  it("has 10 G10 pairs", () => {
    expect(getPairsByGroup("G10")).toHaveLength(10);
  });

  it("has 5 EM_LATAM pairs", () => {
    expect(getPairsByGroup("EM_LATAM")).toHaveLength(5);
  });

  it("has 7 EM_ASIA pairs", () => {
    expect(getPairsByGroup("EM_ASIA")).toHaveLength(7);
  });

  it("has 4 EM_CEEMEA pairs", () => {
    expect(getPairsByGroup("EM_CEEMEA")).toHaveLength(4);
  });

  it("USDMXN is not NDF", () => {
    expect(getPairMeta("USDMXN")?.isNdf).toBe(false);
  });

  it("USDBRL is NDF", () => {
    expect(getPairMeta("USDBRL")?.isNdf).toBe(true);
  });

  it("EURUSD is inverted (quoted as 1 EUR = X USD)", () => {
    expect(getPairMeta("EURUSD")?.isInverted).toBe(true);
  });

  it("USDJPY is not inverted", () => {
    expect(getPairMeta("USDJPY")?.isInverted).toBe(false);
  });

  it("NDF pairs list is non-empty", () => {
    expect(getNdfPairs().length).toBeGreaterThan(0);
  });

  it("all pairs have positive demoSpot", () => {
    PAIR_REGISTRY.forEach(p => {
      expect(p.demoSpot).toBeGreaterThan(0);
    });
  });

  it("all pair IDs are unique", () => {
    const ids = PAIR_REGISTRY.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
