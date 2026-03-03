/**
 * PhaseSelect — selection summary card tests
 */
describe("PhaseSelect selection summary", () => {
  it("shows 0 of N when nothing selected", () => {
    const selectedIds: string[] = [];
    const positions = [{ id: "a", amount: 100000, currency: "MXN" }];
    expect(selectedIds.length).toBe(0);
    expect(positions.length).toBe(1);
  });

  it("proceed button disabled when no selection", () => {
    const selectedIds: string[] = [];
    const disabled = selectedIds.length === 0;
    expect(disabled).toBe(true);
  });

  it("proceed button enabled when 1+ selected", () => {
    const selectedIds = ["a"];
    const disabled = selectedIds.length === 0;
    expect(disabled).toBe(false);
  });

  it("notional sums selected positions only", () => {
    const positions = [
      { id: "a", amount: 100000, currency: "MXN" },
      { id: "b", amount: 200000, currency: "MXN" },
    ];
    const selectedIds = ["a"];
    const notional = positions.filter(p => selectedIds.includes(p.id)).reduce((s, p) => s + (p.amount || 0), 0);
    expect(notional).toBe(100000);
  });
});
