"use client";
/**
 * CsvPreview.tsx -- Item 12
 *
 * Client-side CSV preview component.
 * Parses first 5 rows using Papa Parse, shows detected headers,
 * sample data, and column mapping badges for required columns.
 */

import { useState, useEffect } from "react";
import Papa from "papaparse";
import { Check, AlertTriangle } from "lucide-react";

const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  green:     "var(--status-pass,#22c55e)",
  red:       "var(--accent-red,#f87171)",
} as const;

/* ── Required columns ───────────────────────────────────────────────────────── */

const REQUIRED_COLUMNS = [
  "trade_date",
  "currency_sold",
  "currency_bought",
  "amount_sold",
  "amount_bought",
] as const;

/**
 * Common aliases that map to required column names.
 * This is used for soft-matching -- the backend may accept these aliases too.
 */
const ALIASES: Record<string, string> = {
  date:             "trade_date",
  transaction_date: "trade_date",
  tradedate:        "trade_date",
  ccy_sold:         "currency_sold",
  sell_currency:    "currency_sold",
  sold_currency:    "currency_sold",
  currencysold:     "currency_sold",
  ccy_bought:       "currency_bought",
  buy_currency:     "currency_bought",
  bought_currency:  "currency_bought",
  currencybought:   "currency_bought",
  sell_amount:      "amount_sold",
  sold_amount:      "amount_sold",
  amountsold:       "amount_sold",
  buy_amount:       "amount_bought",
  bought_amount:    "amount_bought",
  amountbought:     "amount_bought",
};

function normalizeHeader(h: string): string {
  const cleaned = h.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ALIASES[cleaned] ?? cleaned;
}

/* ── Props ──────────────────────────────────────────────────────────────────── */

interface CsvPreviewProps {
  file: File;
}

/* ── Component ──────────────────────────────────────────────────────────────── */

export default function CsvPreview({ file }: CsvPreviewProps) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(true);

  useEffect(() => {
    setParsing(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== "string") {
        setError("Unable to read file contents.");
        setParsing(false);
        return;
      }

      // Only parse enough for preview (header + 5 rows)
      const result = Papa.parse(text, {
        preview: 6,   // 1 header + 5 data rows
        skipEmptyLines: true,
      });

      if (result.errors.length > 0 && result.data.length === 0) {
        setError(`Parse error: ${result.errors[0].message}`);
        setParsing(false);
        return;
      }

      const allRows = result.data as string[][];
      if (allRows.length === 0) {
        setError("File appears to be empty.");
        setParsing(false);
        return;
      }

      setHeaders(allRows[0] ?? []);
      setRows(allRows.slice(1));
      setParsing(false);
    };

    reader.onerror = () => {
      setError("Failed to read file.");
      setParsing(false);
    };

    reader.readAsText(file);
  }, [file]);

  // Column mapping status
  const mappedRequired = REQUIRED_COLUMNS.filter(req =>
    headers.some(h => normalizeHeader(h) === req)
  );
  const unmappedRequired = REQUIRED_COLUMNS.filter(req =>
    !headers.some(h => normalizeHeader(h) === req)
  );

  if (parsing) {
    return (
      <div style={{
        padding: "16px 20px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
        background: S.bgSub, border: `1px solid ${S.rim}`,
      }}>
        Parsing CSV...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: "12px 16px",
        background: `color-mix(in srgb, ${S.red} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${S.red} 30%, transparent)`,
        fontFamily: S.fontMono, fontSize: 12, color: S.red,
      }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Column mapping badges */}
      <div>
        <div style={{
          fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
          letterSpacing: "0.1em", color: S.tertiary,
          textTransform: "uppercase", marginBottom: 8,
        }}>
          Required Column Mapping
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {REQUIRED_COLUMNS.map(col => {
            const isMapped = mappedRequired.includes(col);
            return (
              <span
                key={col}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
                  padding: "3px 10px", borderRadius: 2,
                  color: isMapped ? S.green : S.amber,
                  background: isMapped
                    ? `color-mix(in srgb, ${S.green} 10%, transparent)`
                    : `color-mix(in srgb, ${S.amber} 10%, transparent)`,
                  border: `1px solid ${isMapped
                    ? `color-mix(in srgb, ${S.green} 25%, transparent)`
                    : `color-mix(in srgb, ${S.amber} 25%, transparent)`}`,
                }}
              >
                {isMapped ? <Check size={12} /> : <AlertTriangle size={12} />}
                {col}
              </span>
            );
          })}
        </div>
        {unmappedRequired.length > 0 && (
          <div style={{
            fontFamily: S.fontUI, fontSize: 12, color: S.amber, marginTop: 6,
          }}>
            {unmappedRequired.length} required column{unmappedRequired.length > 1 ? "s" : ""} not detected.
            The backend may resolve aliases during import.
          </div>
        )}
        {unmappedRequired.length === 0 && (
          <div style={{
            fontFamily: S.fontUI, fontSize: 12, color: S.green, marginTop: 6,
          }}>
            All required columns detected.
          </div>
        )}
      </div>

      {/* Detected headers */}
      <div>
        <div style={{
          fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
          letterSpacing: "0.1em", color: S.tertiary,
          textTransform: "uppercase", marginBottom: 6,
        }}>
          Detected Headers ({headers.length} columns)
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {headers.map((h, i) => (
            <span
              key={i}
              style={{
                fontFamily: S.fontMono, fontSize: 12,
                padding: "2px 8px", borderRadius: 2,
                color: S.primary, background: S.bgSub,
                border: `1px solid ${S.soft}`,
              }}
            >
              {h}
            </span>
          ))}
        </div>
      </div>

      {/* Sample rows table */}
      <div>
        <div style={{
          fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
          letterSpacing: "0.1em", color: S.tertiary,
          textTransform: "uppercase", marginBottom: 6,
        }}>
          Sample Rows ({rows.length} of first 5)
        </div>
        <div style={{ overflowX: "auto", border: `1px solid ${S.rim}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: headers.length * 120 }}>
            <thead>
              <tr style={{ background: S.bgSub }}>
                {headers.map((h, i) => {
                  const normalized = normalizeHeader(h);
                  const isRequired = (REQUIRED_COLUMNS as readonly string[]).includes(normalized);
                  return (
                    <th key={i} style={{
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: isRequired ? S.cyan : S.tertiary,
                      textAlign: "left", padding: "8px 12px",
                      borderBottom: `1px solid ${S.soft}`, textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}>
                      {h}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: `1px solid ${S.soft}` }}>
                  {headers.map((_, ci) => (
                    <td key={ci} style={{
                      padding: "6px 12px", fontFamily: S.fontMono,
                      fontSize: 12, color: S.secondary,
                      whiteSpace: "nowrap", maxWidth: 200,
                      overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {row[ci] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={headers.length}
                    style={{
                      padding: "20px 12px", fontFamily: S.fontUI,
                      fontSize: 13, color: S.tertiary, textAlign: "center",
                    }}
                  >
                    No data rows found after header.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
