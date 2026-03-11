"use client";

import { useState } from "react";
import { T } from "@/lib/design/tokens";

interface Column<R> {
  key: keyof R & string;
  label: string;
  sortable?: boolean;
  render?: (value: R[keyof R], row: R) => React.ReactNode;
  width?: string;
}

interface DataTableProps<R> {
  columns: Column<R>[];
  data: R[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: R) => void;
}

export function DataTable<R extends Record<string, unknown>>({
  columns,
  data,
  loading,
  emptyMessage = "No data",
  onRowClick,
}: DataTableProps<R>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null || bv == null) return 0;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      })
    : data;

  const headStyle: React.CSSProperties = {
    fontFamily: T.fontUI,
    fontSize: 12,
    fontWeight: 600,
    color: T.tertiary,
    textAlign: "left" as const,
    padding: "10px 14px",
    borderBottom: `1px solid ${T.rim}`,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    whiteSpace: "nowrap" as const,
    userSelect: "none" as const,
  };

  const cellStyle: React.CSSProperties = {
    fontFamily: T.fontMono,
    fontSize: 13,
    color: T.primary,
    padding: "10px 14px",
    borderBottom: `1px solid ${T.soft}`,
  };

  if (loading) {
    return (
      <div style={{ background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4, padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontFamily: T.fontUI, fontSize: 13, color: T.tertiary }}>Loading...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4, padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontFamily: T.fontUI, fontSize: 13, color: T.tertiary }}>{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div style={{ background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: T.bgSub }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ ...headStyle, cursor: col.sortable ? "pointer" : "default", width: col.width }}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                {col.label}
                {sortKey === col.key && (sortDir === "asc" ? " \u2191" : " \u2193")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ cursor: onRowClick ? "pointer" : "default" }}
            >
              {columns.map((col) => (
                <td key={col.key} style={cellStyle}>
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
