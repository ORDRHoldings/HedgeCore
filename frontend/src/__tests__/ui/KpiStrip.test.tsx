/**
 * @jest-environment jsdom
 */
import { render } from "@testing-library/react";
import { KpiStrip } from "@/components/ui/KpiStrip";

const items = [
  { label: "Exposure", value: "$24.8M" },
  { label: "Coverage", value: "67%" },
  { label: "Pending", value: 2 },
];

describe("KpiStrip", () => {
  it("renders all items", () => {
    const { getByText } = render(<KpiStrip items={items} />);
    expect(getByText("Exposure")).toBeTruthy();
    expect(getByText("$24.8M")).toBeTruthy();
    expect(getByText("Coverage")).toBeTruthy();
    expect(getByText("67%")).toBeTruthy();
    expect(getByText("Pending")).toBeTruthy();
    expect(getByText("2")).toBeTruthy();
  });

  it("renders loading skeleton when loading", () => {
    const { container } = render(<KpiStrip items={items} loading />);
    expect(container.textContent).not.toContain("Exposure");
  });

  it("applies custom color to value", () => {
    const colored = [{ label: "P&L", value: "+$142K", color: "var(--status-pass)" }];
    const { getByText } = render(<KpiStrip items={colored} />);
    expect(getByText("+$142K").style.color).toBe("var(--status-pass)");
  });
});
