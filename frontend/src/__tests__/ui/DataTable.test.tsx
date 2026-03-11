/**
 * @jest-environment jsdom
 */
import { render, fireEvent } from "@testing-library/react";
import { DataTable } from "@/components/ui/DataTable";

type Row = { name: string; value: number };

const columns = [
  { key: "name" as const, label: "Name", sortable: true },
  { key: "value" as const, label: "Value", sortable: true },
];

const data: Row[] = [
  { name: "EUR/USD", value: 1.08 },
  { name: "GBP/USD", value: 1.27 },
];

describe("DataTable", () => {
  it("renders all rows", () => {
    const { getByText } = render(<DataTable columns={columns} data={data} />);
    expect(getByText("EUR/USD")).toBeTruthy();
    expect(getByText("GBP/USD")).toBeTruthy();
  });

  it("renders column headers", () => {
    const { getByText } = render(<DataTable columns={columns} data={data} />);
    expect(getByText("Name")).toBeTruthy();
    expect(getByText("Value")).toBeTruthy();
  });

  it("shows empty message when no data", () => {
    const { getByText } = render(<DataTable columns={columns} data={[]} emptyMessage="No positions" />);
    expect(getByText("No positions")).toBeTruthy();
  });

  it("shows loading state", () => {
    const { getByText } = render(<DataTable columns={columns} data={[]} loading />);
    expect(getByText("Loading...")).toBeTruthy();
  });

  it("sorts on header click", () => {
    const { getByText, container } = render(<DataTable columns={columns} data={data} />);
    fireEvent.click(getByText("Name"));
    const cells = container.querySelectorAll("td");
    expect(cells[0]?.textContent).toBe("EUR/USD");
  });

  it("calls onRowClick", () => {
    const fn = jest.fn();
    const { getByText } = render(<DataTable columns={columns} data={data} onRowClick={fn} />);
    fireEvent.click(getByText("EUR/USD"));
    expect(fn).toHaveBeenCalledWith(data[0]);
  });
});
