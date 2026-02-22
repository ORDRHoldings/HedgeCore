"use client";

import { useState, useMemo, ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T, index: number) => ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
}

export interface DenseTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyFn: (row: T, index: number) => string;
  onRowClick?: (row: T, index: number) => void;
  emptyMessage?: string;
  className?: string;
  compact?: boolean;
}

type SortDir = "asc" | "desc";

export default function DenseTable<T>({
  columns,
  data,
  keyFn,
  onRowClick,
  emptyMessage = "No data",
  className = "",
  compact = false,
}: DenseTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (col: Column<T>) => {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return data;
    const fn = col.sortValue;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const va = fn(a);
      const vb = fn(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [data, sortKey, sortDir, columns]);

  const cellPad = compact ? "px-2 py-1" : "px-3 py-1.5";
  const textSize = compact ? "text-[0.75rem]" : "text-[0.8125rem]";

  if (data.length === 0) {
    return (
      <div className={`text-center py-8 text-xs text-[var(--text-tertiary)] ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--border-rim)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={[
                  cellPad,
                  textSize,
                  "font-medium text-[var(--text-secondary)] uppercase tracking-wider whitespace-nowrap",
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                  col.sortable ? "cursor-pointer select-none hover:text-[var(--text-primary)]" : "",
                ].join(" ")}
                style={col.width ? { width: col.width } : undefined}
                onClick={() => handleSort(col)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    <span className="text-[var(--accent-cyan)]">
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={keyFn(row, i)}
              className={[
                "border-b border-[var(--border-rim)]/50",
                onRowClick
                  ? "cursor-pointer hover:bg-[var(--bg-sub)] transition-colors"
                  : "",
              ].join(" ")}
              onClick={() => onRowClick?.(row, i)}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={[
                    cellPad,
                    textSize,
                    "tabular-nums text-[var(--text-primary)] whitespace-nowrap",
                    col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                  ].join(" ")}
                >
                  {col.render(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
