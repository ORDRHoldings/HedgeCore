/**
 * @jest-environment jsdom
 */
import { render } from "@testing-library/react";
import { Icon } from "@/components/ui/Icon";
import { LayoutDashboard } from "lucide-react";

describe("Icon", () => {
  it("renders with default size 20", () => {
    const { container } = render(<Icon icon={LayoutDashboard} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("height")).toBe("20");
  });

  it("applies sharp stroke attributes", () => {
    const { container } = render(<Icon icon={LayoutDashboard} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("stroke-linecap")).toBe("square");
    expect(svg?.getAttribute("stroke-linejoin")).toBe("miter");
    expect(svg?.getAttribute("stroke-width")).toBe("1.5");
  });

  it("accepts custom size", () => {
    const { container } = render(<Icon icon={LayoutDashboard} size={16} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("16");
  });

  it("accepts custom color", () => {
    const { container } = render(<Icon icon={LayoutDashboard} color="#1C62F2" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("stroke")).toBe("#1C62F2");
  });
});
