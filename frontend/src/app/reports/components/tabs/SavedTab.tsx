"use client";

import { useState, useEffect, useCallback } from "react";
import { T } from "@/lib/design/tokens";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { Trash2, Download, ChevronDown } from "lucide-react";

interface Props {
  token: string;
}

interface SavedReport {
  id: string;
  name: string;
  run_id: string;
  created_at: string;
  version: number;
}

export default function SavedTab({ token }: Props) {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardFetch("/v1/reports/saved", token);
      if (res.ok) {
        const data = await res.json();
        setReports(Array.isArray(data) ? data : data.items ?? []);
      } else {
        setReports([]);
      }
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleDelete = async (id: string) => {
    try {
      await dashboardFetch(`/v1/reports/saved/${id}`, token, {
        method: "DELETE",
      });
      await fetchReports();
    } catch {
      // silently handle
    }
  };

  const handleExport = async (id: string, format: "PDF" | "XLSX") => {
    setOpenDropdown(null);
    try {
      const res = await dashboardFetch(
        `/v1/reports/saved/${id}/export?format=${format}`,
        token,
      );
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `report-${id.slice(0, 8)}.${format.toLowerCase()}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch {
      // silently handle
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: "center",
          fontFamily: T.fontMono,
          fontSize: 12,
          color: T.tertiary,
          letterSpacing: "0.1em",
          background: T.bgDeep,
          minHeight: "60vh",
        }}
      >
        LOADING...
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: "center",
          background: T.bgDeep,
          minHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: T.fontMono,
            fontSize: 14,
            color: T.tertiary,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          No saved reports yet
        </span>
        <span
          style={{
            fontFamily: T.fontUI,
            fontSize: 13,
            color: T.tertiary,
          }}
        >
          Reports generated in the Studio tab will appear here.
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: T.bgDeep, minHeight: "60vh" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: T.fontUI,
          fontSize: 13,
        }}
      >
        <thead>
          <tr>
            {["Name", "Run ID", "Date", "Version", "Actions"].map((col) => (
              <th scope="col"
                key={col}
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  fontFamily: T.fontMono,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: T.tertiary,
                  background: T.bgSub,
                  borderBottom: `1px solid ${T.rim}`,
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const isHovered = hoveredRow === report.id;
            return (
              <tr
                key={report.id}
                onMouseEnter={() => setHoveredRow(report.id)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  background: isHovered ? T.bgSub : T.bgPanel,
                  transition: "background 0.1s",
                }}
              >
                <td
                  style={{
                    padding: "10px 14px",
                    color: T.primary,
                    fontWeight: 600,
                    borderBottom: `1px solid ${T.soft}`,
                  }}
                >
                  {report.name}
                </td>
                <td
                  style={{
                    padding: "10px 14px",
                    fontFamily: T.fontMono,
                    fontSize: 12,
                    color: T.secondary,
                    borderBottom: `1px solid ${T.soft}`,
                  }}
                >
                  {report.run_id ? report.run_id.slice(0, 8) : "\u2014"}
                </td>
                <td
                  style={{
                    padding: "10px 14px",
                    color: T.secondary,
                    borderBottom: `1px solid ${T.soft}`,
                  }}
                >
                  {formatDate(report.created_at)}
                </td>
                <td
                  style={{
                    padding: "10px 14px",
                    borderBottom: `1px solid ${T.soft}`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: T.fontMono,
                      fontSize: 11,
                      color: T.accent,
                      background: T.accentDim,
                      borderRadius: 3,
                      padding: "2px 8px",
                      letterSpacing: "0.04em",
                    }}
                  >
                    v{report.version}
                  </span>
                </td>
                <td
                  style={{
                    padding: "10px 14px",
                    borderBottom: `1px solid ${T.soft}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      position: "relative",
                    }}
                  >
                    {/* Re-export dropdown */}
                    <button
                      onClick={() =>
                        setOpenDropdown(
                          openDropdown === report.id ? null : report.id,
                        )
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontFamily: T.fontMono,
                        fontSize: 11,
                        color: T.secondary,
                        background: T.bgSub,
                        border: `1px solid ${T.rim}`,
                        borderRadius: 4,
                        padding: "4px 10px",
                        cursor: "pointer",
                        letterSpacing: "0.04em",
                      }}
                    >
                      <Download size={12} />
                      EXPORT
                      <ChevronDown size={10} />
                    </button>
                    {openDropdown === report.id && (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          marginTop: 4,
                          background: T.bgPanel,
                          border: `1px solid ${T.rim}`,
                          borderRadius: 4,
                          zIndex: 10,
                          overflow: "hidden",
                          minWidth: 100,
                        }}
                      >
                        {(["PDF", "XLSX"] as const).map((fmt) => (
                          <button
                            key={fmt}
                            onClick={() => handleExport(report.id, fmt)}
                            style={{
                              display: "block",
                              width: "100%",
                              padding: "8px 14px",
                              fontFamily: T.fontMono,
                              fontSize: 11,
                              color: T.primary,
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              textAlign: "left",
                              letterSpacing: "0.04em",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background = T.bgSub)
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            {fmt}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Delete button */}
                    <button
                      onClick={() => handleDelete(report.id)}
                      title="Delete report"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "transparent",
                        border: `1px solid ${T.rim}`,
                        borderRadius: 4,
                        padding: "4px 8px",
                        cursor: "pointer",
                        color: T.tertiary,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = T.fail)}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = T.tertiary)
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
