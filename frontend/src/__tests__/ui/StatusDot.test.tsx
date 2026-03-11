/**
 * @jest-environment jsdom
 */
import { render } from "@testing-library/react";
import { StatusDot } from "@/components/ui/StatusDot";

describe("StatusDot", () => {
  it("renders pass dot", () => {
    const { container } = render(<StatusDot status="pass" />);
    const dot = container.querySelector("[role='img']");
    expect(dot?.style.background).toBe("var(--status-pass)");
  });

  it("renders fail dot", () => {
    const { container } = render(<StatusDot status="fail" />);
    const dot = container.querySelector("[role='img']");
    expect(dot?.style.background).toBe("var(--status-fail)");
  });

  it("renders with label", () => {
    const { getByText } = render(<StatusDot status="pass" label="Active" />);
    expect(getByText("Active")).toBeTruthy();
  });

  it("uses custom size", () => {
    const { container } = render(<StatusDot status="warn" size={12} />);
    const dot = container.querySelector("[role='img']");
    expect(dot?.style.width).toBe("12px");
  });
});
