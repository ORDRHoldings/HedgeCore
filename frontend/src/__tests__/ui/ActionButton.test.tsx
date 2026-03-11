/**
 * @jest-environment jsdom
 */
import { render, fireEvent } from "@testing-library/react";
import { ActionButton } from "@/components/ui/ActionButton";

describe("ActionButton", () => {
  it("renders children", () => {
    const { getByText } = render(<ActionButton>Click me</ActionButton>);
    expect(getByText("Click me")).toBeTruthy();
  });

  it("calls onClick when not disabled", () => {
    const fn = jest.fn();
    const { getByText } = render(<ActionButton onClick={fn}>Go</ActionButton>);
    fireEvent.click(getByText("Go"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const fn = jest.fn();
    const { getByText } = render(<ActionButton onClick={fn} disabled>Go</ActionButton>);
    fireEvent.click(getByText("Go"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("sets aria-disabled when disabled", () => {
    const { getByText } = render(<ActionButton disabled>Go</ActionButton>);
    expect(getByText("Go").getAttribute("aria-disabled")).toBe("true");
  });

  it("renders secondary variant with border", () => {
    const { getByText } = render(<ActionButton variant="secondary">Go</ActionButton>);
    expect(getByText("Go").style.background).toBe("transparent");
  });

  it("renders ghost variant", () => {
    const { getByText } = render(<ActionButton variant="ghost">Go</ActionButton>);
    expect(getByText("Go").style.background).toBe("transparent");
  });
});
