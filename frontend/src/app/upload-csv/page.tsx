"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import {
  importCsvAudited,
  importExcelAudited,
  getConnectorRunDetail,
  type ConnectorRun,
  type ConnectorRunDetail,
} from "@/api/connectorClient";

type ImportStatus = "idle" | "uploading" | "parsing" | "validating" | "committing" | "complete" | "error";

export default function UploadCsvPage() {
  const router = useRouter();
  const { user, token, isAuthenticated } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [runResult, setRunResult] = useState<ConnectorRunDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [clockStr, setClockStr] = useState("");

  // Clock — client-side only to avoid SSR hydration mismatch
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClockStr(now.toISOString().split("T")[0] + " " + now.toTimeString().split(" ")[0]);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, router]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndSetFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndSetFile(files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    const maxSize = 50 * 1024 * 1024; // 50 MB
    const allowedExtensions = [".csv", ".xlsx", ".xls"];
    const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
      setErrorMessage("Invalid file type. Please upload .csv, .xlsx, or .xls files only.");
      return;
    }

    if (file.size > maxSize) {
      setErrorMessage("File size exceeds 50 MB limit.");
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
    setRunResult(null);
    setImportStatus("idle");
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setErrorMessage(null);
    setRunResult(null);
    setImportStatus("idle");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !token) return;

    try {
      setImportStatus("uploading");
      setErrorMessage(null);

      const fileExtension = "." + selectedFile.name.split(".").pop()?.toLowerCase();
      let result: ConnectorRun;

      await new Promise((resolve) => setTimeout(resolve, 400));
      setImportStatus("parsing");

      if (fileExtension === ".csv") {
        result = await importCsvAudited(selectedFile, token);
      } else {
        result = await importExcelAudited(selectedFile, token);
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
      setImportStatus("validating");

      await new Promise((resolve) => setTimeout(resolve, 300));
      setImportStatus("committing");

      // Fetch detailed results
      const detail = await getConnectorRunDetail(result.id, token);

      setRunResult(detail);
      setImportStatus("complete");
    } catch (error: any) {
      setImportStatus("error");
      setErrorMessage(error.message || "Import failed. Please try again.");
    }
  };

  const handleDownloadTemplate = (format: "csv" | "xlsx") => {
    if (format === "csv") {
      const headers = [
        "record_id",
        "entity",
        "flow_type",
        "currency",
        "amount",
        "value_date",
        "description",
        "status",
      ];
      const example1 = [
        "TXN-001",
        "CORP-MX",
        "AR",
        "USD",
        "150000.00",
        "2026-03-15",
        "Q1 Receivable from US Client",
        "OPEN",
      ];
      const example2 = [
        "TXN-002",
        "CORP-UK",
        "AP",
        "EUR",
        "85000.00",
        "2026-04-01",
        "Supplier payment EUR zone",
        "OPEN",
      ];

      const csvContent = [headers.join(","), example1.join(","), example2.join(",")].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "ordr_position_import_template.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      // For XLSX, we'd need a library like xlsx, so for now just download CSV
      // In production, you'd use SheetJS or similar
      alert("XLSX template generation requires xlsx library. Using CSV format.");
      handleDownloadTemplate("csv");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  const formatDuration = (start: string, end: string | null): string => {
    if (!end) return "—";
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const diff = endTime - startTime;
    if (diff < 1000) return diff + "ms";
    return (diff / 1000).toFixed(2) + "s";
  };

  const getStatusColor = (status: string) => {
    if (status === "COMPLETED") {
      return runResult && runResult.error_count === 0 ? "var(--status-pass)" : "var(--accent-amber)";
    }
    if (status === "FAILED") return "var(--accent-red)";
    return "var(--accent-cyan)";
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const supportedCurrencies = [
    "USD",
    "EUR",
    "GBP",
    "JPY",
    "CHF",
    "CAD",
    "AUD",
    "NZD",
    "MXN",
    "BRL",
    "CLP",
    "COP",
    "ARS",
    "PEN",
    "CZK",
    "HUF",
    "PLN",
    "RON",
    "SEK",
    "NOK",
    "DKK",
    "SGD",
    "HKD",
    "KRW",
    "ZAR",
    "INR",
    "CNY",
  ];

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-deep)",
        color: "var(--text-primary)",
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      {/* Page Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "var(--bg-sub)",
          borderBottom: "1px solid var(--border-rim)",
          boxShadow: "0 2px 0 0 var(--accent-cyan)",
        }}
      >
        <div
          style={{
            maxWidth: "1800px",
            margin: "0 auto",
            padding: "16px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Left: Back Button */}
          <button
            onClick={() => router.push("/input")}
            style={{
              background: "transparent",
              border: "1px solid var(--border-rim)",
              color: "var(--text-secondary)",
              padding: "8px 16px",
              borderRadius: "4px",
              cursor: "pointer",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.5px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-cyan)";
              e.currentTarget.style.color = "var(--accent-cyan)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-rim)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            ← BACK
          </button>

          {/* Center: Title */}
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "10px",
                color: "var(--text-tertiary)",
                fontFamily: "'IBM Plex Mono', monospace",
                letterSpacing: "1px",
                marginBottom: "4px",
              }}
            >
              POSITION DESK › UPLOAD
            </div>
            <h1
              style={{
                fontSize: "18px",
                fontWeight: 600,
                margin: 0,
                fontFamily: "'IBM Plex Mono', monospace",
                letterSpacing: "0.5px",
              }}
            >
              BULK POSITION IMPORT
            </h1>
          </div>

          {/* Right: Branding */}
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "9px",
                color: "var(--text-tertiary)",
                fontFamily: "'IBM Plex Mono', monospace",
                marginBottom: "4px",
              }}
            >
              {clockStr}
            </div>
            <div
              style={{
                fontSize: "10px",
                fontFamily: "'IBM Plex Mono', monospace",
                color: "var(--accent-cyan)",
                letterSpacing: "0.5px",
              }}
            >
              ORDR TERMINAL · POSITION DESK
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        style={{
          maxWidth: "1800px",
          margin: "0 auto",
          padding: "32px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "55% 45%",
            gap: "32px",
          }}
        >
          {/* LEFT COLUMN */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Upload Zone */}
            <div
              style={{
                background: "var(--bg-panel)",
                border: "1px solid var(--border-rim)",
                borderRadius: "6px",
                padding: "24px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: "var(--text-tertiary)",
                  letterSpacing: "1px",
                  marginBottom: "16px",
                }}
              >
                FILE UPLOAD
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />

              {!selectedFile ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    minHeight: "180px",
                    border: isDragOver
                      ? "2px dashed var(--accent-cyan)"
                      : "2px dashed var(--border-soft)",
                    borderRadius: "6px",
                    background: isDragOver
                      ? "rgba(0, 255, 255, 0.05)"
                      : "var(--bg-sub)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    gap: "12px",
                  }}
                >
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isDragOver ? "var(--accent-cyan)" : "var(--text-tertiary)"}
                    strokeWidth="1.5"
                    style={{ transition: "stroke 0.2s" }}
                  >
                    <path d="M7 18a4.6 4.4 0 0 1 0 -9h0a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1" />
                    <polyline points="9 15 12 12 15 15" />
                    <path d="M12 12v9" />
                  </svg>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: isDragOver ? "var(--accent-cyan)" : "var(--text-primary)",
                      fontFamily: "'IBM Plex Mono', monospace",
                      letterSpacing: "0.5px",
                    }}
                  >
                    DROP FILE HERE OR CLICK TO SELECT
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-tertiary)",
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    Accepted: .csv · .xlsx · .xls — Maximum 50 MB
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: "var(--bg-sub)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: "6px",
                    padding: "16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        background: "var(--accent-cyan)",
                        color: "var(--bg-deep)",
                        padding: "4px 8px",
                        borderRadius: "3px",
                        fontSize: "10px",
                        fontWeight: 600,
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      {selectedFile.name.endsWith(".csv") ? "CSV" : "XLSX"}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: 500,
                          color: "var(--text-primary)",
                          marginBottom: "2px",
                        }}
                      >
                        {selectedFile.name}
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "var(--text-tertiary)",
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        {formatFileSize(selectedFile.size)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleClearFile}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--border-rim)",
                      color: "var(--text-secondary)",
                      padding: "6px 12px",
                      borderRadius: "3px",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent-red)";
                      e.currentTarget.style.color = "var(--accent-red)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-rim)";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                  >
                    × CLEAR
                  </button>
                </div>
              )}

              {errorMessage && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "12px",
                    background: "rgba(255, 68, 68, 0.1)",
                    border: "1px solid var(--accent-red)",
                    borderRadius: "4px",
                    fontSize: "11px",
                    color: "var(--accent-red)",
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}
                >
                  {errorMessage}
                </div>
              )}
            </div>

            {/* Pre-import Validation Panel */}
            {selectedFile && (
              <div
                style={{
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border-rim)",
                  borderRadius: "6px",
                  padding: "24px",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: "var(--text-tertiary)",
                    letterSpacing: "1px",
                    marginBottom: "16px",
                  }}
                >
                  PRE-FLIGHT CHECKS
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "var(--status-pass)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        color: "var(--bg-deep)",
                      }}
                    >
                      ✓
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      File format: CSV or XLSX
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background:
                          selectedFile.size < 50 * 1024 * 1024
                            ? "var(--status-pass)"
                            : "var(--accent-red)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        color: "var(--bg-deep)",
                      }}
                    >
                      {selectedFile.size < 50 * 1024 * 1024 ? "✓" : "✗"}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      File size: &lt; 50 MB
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "var(--border-soft)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      ⋯
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      Required columns present:{" "}
                      <span
                        style={{
                          color: "var(--accent-amber)",
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        PENDING
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "8px",
                      padding: "8px 12px",
                      background: "var(--bg-sub)",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    ENCODING: UTF-8 (assumed)
                  </div>
                </div>
              </div>
            )}

            {/* Import Controls */}
            {selectedFile && importStatus !== "complete" && (
              <div
                style={{
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border-rim)",
                  borderRadius: "6px",
                  padding: "24px",
                }}
              >
                <button
                  onClick={handleImport}
                  disabled={importStatus !== "idle"}
                  style={{
                    width: "100%",
                    background:
                      importStatus === "idle"
                        ? "var(--accent-cyan)"
                        : "var(--border-soft)",
                    color: "var(--bg-deep)",
                    border: "none",
                    padding: "14px 24px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: 600,
                    fontFamily: "'IBM Plex Mono', monospace",
                    letterSpacing: "0.5px",
                    cursor: importStatus === "idle" ? "pointer" : "not-allowed",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  {importStatus === "idle" && "VALIDATE & IMPORT"}
                  {importStatus !== "idle" && importStatus !== "error" && (
                    <>
                      <div
                        style={{
                          width: "14px",
                          height: "14px",
                          border: "2px solid var(--bg-deep)",
                          borderTopColor: "transparent",
                          borderRadius: "50%",
                          animation: "spin 0.8s linear infinite",
                        }}
                      />
                      IMPORTING…
                    </>
                  )}
                  {importStatus === "error" && "IMPORT FAILED"}
                </button>

                {importStatus !== "idle" && importStatus !== "error" && (
                  <div
                    style={{
                      marginTop: "16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      fontSize: "10px",
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    <span
                      style={{
                        color:
                          importStatus === "uploading"
                            ? "var(--accent-cyan)"
                            : "var(--text-tertiary)",
                      }}
                    >
                      UPLOADING
                    </span>
                    →
                    <span
                      style={{
                        color:
                          importStatus === "parsing"
                            ? "var(--accent-cyan)"
                            : "var(--text-tertiary)",
                      }}
                    >
                      PARSING
                    </span>
                    →
                    <span
                      style={{
                        color:
                          importStatus === "validating"
                            ? "var(--accent-cyan)"
                            : "var(--text-tertiary)",
                      }}
                    >
                      VALIDATING
                    </span>
                    →
                    <span
                      style={{
                        color:
                          importStatus === "committing"
                            ? "var(--accent-cyan)"
                            : "var(--text-tertiary)",
                      }}
                    >
                      COMMITTING
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Run Result Card */}
            {runResult && importStatus === "complete" && (
              <div
                style={{
                  background: "var(--bg-panel)",
                  border: `2px solid ${getStatusColor(runResult.status)}`,
                  borderRadius: "6px",
                  padding: "24px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "20px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        fontFamily: "'IBM Plex Mono', monospace",
                        color: "var(--text-primary)",
                      }}
                    >
                      IMPORT COMPLETE · RUN-{runResult.id.slice(0, 8).toUpperCase()}
                    </div>
                    <div
                      style={{
                        background: getStatusColor(runResult.status),
                        color: "var(--bg-deep)",
                        padding: "3px 8px",
                        borderRadius: "3px",
                        fontSize: "9px",
                        fontWeight: 600,
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      {runResult.status}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: "16px",
                    marginBottom: "20px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "9px",
                        color: "var(--text-tertiary)",
                        fontFamily: "'IBM Plex Mono', monospace",
                        marginBottom: "4px",
                      }}
                    >
                      TOTAL ROWS
                    </div>
                    <div
                      style={{
                        fontSize: "18px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      {runResult.total_rows}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "9px",
                        color: "var(--text-tertiary)",
                        fontFamily: "'IBM Plex Mono', monospace",
                        marginBottom: "4px",
                      }}
                    >
                      ROWS CREATED
                    </div>
                    <div
                      style={{
                        fontSize: "18px",
                        fontWeight: 600,
                        color: "var(--status-pass)",
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      {runResult.created_ok}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "9px",
                        color: "var(--text-tertiary)",
                        fontFamily: "'IBM Plex Mono', monospace",
                        marginBottom: "4px",
                      }}
                    >
                      ERRORS
                    </div>
                    <div
                      style={{
                        fontSize: "18px",
                        fontWeight: 600,
                        color:
                          runResult.error_count > 0
                            ? "var(--accent-red)"
                            : "var(--text-tertiary)",
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      {runResult.error_count}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "9px",
                        color: "var(--text-tertiary)",
                        fontFamily: "'IBM Plex Mono', monospace",
                        marginBottom: "4px",
                      }}
                    >
                      DURATION
                    </div>
                    <div
                      style={{
                        fontSize: "18px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      {formatDuration(runResult.started_at, runResult.completed_at)}
                    </div>
                  </div>
                </div>

                {runResult.source_hash && (
                  <div
                    style={{
                      padding: "12px",
                      background: "var(--bg-sub)",
                      borderRadius: "4px",
                      marginBottom: "16px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "9px",
                        color: "var(--text-tertiary)",
                        fontFamily: "'IBM Plex Mono', monospace",
                        marginBottom: "6px",
                      }}
                    >
                      SOURCE HASH (SHA-256)
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          fontFamily: "'IBM Plex Mono', monospace",
                          color: "var(--text-secondary)",
                          wordBreak: "break-all",
                        }}
                      >
                        {runResult.source_hash}
                      </div>
                      <button
                        onClick={() => copyToClipboard(runResult.source_hash || "")}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--border-rim)",
                          color: "var(--text-tertiary)",
                          padding: "4px 8px",
                          borderRadius: "3px",
                          cursor: "pointer",
                          fontSize: "9px",
                          fontFamily: "'IBM Plex Mono', monospace",
                          marginLeft: "8px",
                          flexShrink: 0,
                        }}
                      >
                        COPY
                      </button>
                    </div>
                  </div>
                )}

                {runResult.errors && runResult.errors.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <button
                      onClick={() => setShowErrors(!showErrors)}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--accent-red)",
                        color: "var(--accent-red)",
                        padding: "8px 12px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "10px",
                        fontFamily: "'IBM Plex Mono', monospace",
                        width: "100%",
                        marginBottom: showErrors ? "12px" : "0",
                      }}
                    >
                      {showErrors ? "▼" : "►"} VIEW {runResult.errors.length} ERROR
                      {runResult.errors.length !== 1 ? "S" : ""}
                    </button>

                    {showErrors && (
                      <div
                        style={{
                          maxHeight: "300px",
                          overflowY: "auto",
                          background: "var(--bg-sub)",
                          border: "1px solid var(--accent-red)",
                          borderRadius: "4px",
                          padding: "12px",
                        }}
                      >
                        {runResult.errors.map((error, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: "8px",
                              marginBottom: "8px",
                              background: "rgba(255, 68, 68, 0.05)",
                              borderLeft: "2px solid var(--accent-red)",
                              fontSize: "11px",
                              fontFamily: "'IBM Plex Mono', monospace",
                            }}
                          >
                            <div style={{ color: "var(--accent-red)", marginBottom: "4px" }}>
                              Row {error.row_number ?? "N/A"}
                              {error.field_name && ` · Field: ${error.field_name}`}
                            </div>
                            <div style={{ color: "var(--text-secondary)" }}>
                              {error.error_message}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    onClick={() => router.push("/import-history")}
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "1px solid var(--border-rim)",
                      color: "var(--text-secondary)",
                      padding: "10px 16px",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    VIEW IN IMPORT HISTORY →
                  </button>
                  <button
                    onClick={handleClearFile}
                    style={{
                      flex: 1,
                      background: "var(--accent-cyan)",
                      border: "none",
                      color: "var(--bg-deep)",
                      padding: "10px 16px",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: 600,
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    IMPORT ANOTHER FILE
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Required Columns Table */}
            <div
              style={{
                background: "var(--bg-panel)",
                border: "1px solid var(--border-rim)",
                borderRadius: "6px",
                padding: "24px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: "var(--text-tertiary)",
                  letterSpacing: "1px",
                  marginBottom: "16px",
                }}
              >
                REQUIRED COLUMNS
              </div>

              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "11px",
                    fontFamily: "'IBM Plex Sans', sans-serif",
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-rim)" }}>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "8px 8px 8px 0",
                          fontSize: "9px",
                          fontWeight: 600,
                          color: "var(--text-tertiary)",
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        COLUMN
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "8px",
                          fontSize: "9px",
                          fontWeight: 600,
                          color: "var(--text-tertiary)",
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        TYPE
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "8px",
                          fontSize: "9px",
                          fontWeight: 600,
                          color: "var(--text-tertiary)",
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        FORMAT
                      </th>
                      <th
                        style={{
                          textAlign: "center",
                          padding: "8px",
                          fontSize: "9px",
                          fontWeight: 600,
                          color: "var(--text-tertiary)",
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        REQ
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "8px 0 8px 8px",
                          fontSize: "9px",
                          fontWeight: 600,
                          color: "var(--text-tertiary)",
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        DESCRIPTION
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        column: "record_id",
                        type: "STRING",
                        format: "TXN-001",
                        required: true,
                        description:
                          "Unique position identifier. Max 64 chars. Duplicate IDs will be rejected.",
                      },
                      {
                        column: "entity",
                        type: "STRING",
                        format: "CORP-MX",
                        required: true,
                        description:
                          "Legal entity code. Must match registered entities in the system.",
                      },
                      {
                        column: "flow_type",
                        type: "ENUM",
                        format: "AR | AP",
                        required: true,
                        description:
                          "Accounts Receivable (inflow) or Accounts Payable (outflow)",
                      },
                      {
                        column: "currency",
                        type: "ISO 4217",
                        format: "USD, EUR",
                        required: true,
                        description: "3-letter ISO currency code. 27 currencies supported.",
                      },
                      {
                        column: "amount",
                        type: "DECIMAL",
                        format: "150000.00",
                        required: true,
                        description:
                          "Positive decimal. Do not include currency symbols or commas.",
                      },
                      {
                        column: "value_date",
                        type: "DATE",
                        format: "YYYY-MM-DD",
                        required: true,
                        description: "Settlement/maturity date. Must be a future date.",
                      },
                      {
                        column: "description",
                        type: "STRING",
                        format: "Free text",
                        required: false,
                        description: "Optional trade description. Max 255 chars.",
                      },
                      {
                        column: "status",
                        type: "ENUM",
                        format: "OPEN | CLOSED",
                        required: false,
                        description: "Defaults to OPEN if omitted.",
                      },
                    ].map((row, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: "1px solid var(--border-soft)",
                        }}
                      >
                        <td
                          style={{
                            padding: "12px 8px 12px 0",
                            color: "var(--accent-cyan)",
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: "11px",
                            fontWeight: 500,
                          }}
                        >
                          {row.column}
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <span
                            style={{
                              background: "var(--bg-sub)",
                              color: "var(--text-secondary)",
                              padding: "2px 6px",
                              borderRadius: "3px",
                              fontSize: "9px",
                              fontFamily: "'IBM Plex Mono', monospace",
                            }}
                          >
                            {row.type}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "12px 8px",
                            color: "var(--text-tertiary)",
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: "10px",
                          }}
                        >
                          {row.format}
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "center" }}>
                          <span
                            style={{
                              color: row.required
                                ? "var(--accent-red)"
                                : "var(--text-tertiary)",
                              fontSize: "9px",
                              fontWeight: 600,
                              fontFamily: "'IBM Plex Mono', monospace",
                            }}
                          >
                            {row.required ? "YES" : "NO"}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "12px 0 12px 8px",
                            color: "var(--text-secondary)",
                            fontSize: "10px",
                            lineHeight: "1.5",
                          }}
                        >
                          {row.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Data Quality Rules */}
            <div
              style={{
                background: "var(--bg-panel)",
                border: "1px solid var(--border-rim)",
                borderRadius: "6px",
                padding: "24px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: "var(--text-tertiary)",
                  letterSpacing: "1px",
                  marginBottom: "16px",
                }}
              >
                DATA QUALITY RULES
              </div>

              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {[
                  "No duplicate record_id within the same import batch",
                  "amount must be > 0 (absolute value; sign is derived from flow_type)",
                  "value_date must be in ISO 8601 format (YYYY-MM-DD)",
                  "currency must be one of 27 supported ISO codes",
                  'flow_type must be exactly "AR" or "AP" (case-insensitive)',
                  "Empty rows are skipped automatically",
                  "Maximum 5,000 rows per file",
                  "UTF-8 encoding required for CSV files",
                ].map((rule, idx) => (
                  <li
                    key={idx}
                    style={{
                      fontSize: "11px",
                      color: "var(--text-secondary)",
                      paddingLeft: "20px",
                      position: "relative",
                      lineHeight: "1.6",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: "0",
                        color: "var(--accent-cyan)",
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      •
                    </span>
                    {rule}
                  </li>
                ))}
              </ul>
            </div>

            {/* Download Template Section */}
            <div
              style={{
                background: "var(--bg-panel)",
                border: "1px solid var(--border-rim)",
                borderRadius: "6px",
                padding: "24px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: "var(--text-tertiary)",
                  letterSpacing: "1px",
                  marginBottom: "16px",
                }}
              >
                DOWNLOAD TEMPLATE
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => handleDownloadTemplate("csv")}
                  style={{
                    flex: 1,
                    background: "var(--bg-sub)",
                    border: "1px solid var(--border-rim)",
                    color: "var(--text-primary)",
                    padding: "12px 16px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontFamily: "'IBM Plex Mono', monospace",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent-cyan)";
                    e.currentTarget.style.color = "var(--accent-cyan)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-rim)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  CSV TEMPLATE
                </button>
                <button
                  onClick={() => handleDownloadTemplate("xlsx")}
                  style={{
                    flex: 1,
                    background: "var(--bg-sub)",
                    border: "1px solid var(--border-rim)",
                    color: "var(--text-primary)",
                    padding: "12px 16px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontFamily: "'IBM Plex Mono', monospace",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent-cyan)";
                    e.currentTarget.style.color = "var(--accent-cyan)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-rim)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  XLSX TEMPLATE
                </button>
              </div>
            </div>

            {/* Supported Currencies Grid */}
            <div
              style={{
                background: "var(--bg-panel)",
                border: "1px solid var(--border-rim)",
                borderRadius: "6px",
                padding: "24px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: "var(--text-tertiary)",
                  letterSpacing: "1px",
                  marginBottom: "16px",
                }}
              >
                SUPPORTED CURRENCIES (27)
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "8px",
                }}
              >
                {supportedCurrencies.map((currency) => (
                  <div
                    key={currency}
                    style={{
                      padding: "8px 12px",
                      background: "var(--bg-sub)",
                      border: "1px solid var(--border-soft)",
                      borderRadius: "3px",
                      fontSize: "11px",
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: "var(--text-secondary)",
                      textAlign: "center",
                    }}
                  >
                    {currency}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Audit Trail Note */}
        <div
          style={{
            marginTop: "32px",
            padding: "16px 24px",
            background: "rgba(0, 255, 255, 0.05)",
            border: "1px solid var(--accent-cyan)",
            borderRadius: "6px",
            fontSize: "11px",
            color: "var(--text-secondary)",
            lineHeight: "1.6",
          }}
        >
          <strong style={{ color: "var(--accent-cyan)", fontFamily: "'IBM Plex Mono', monospace" }}>
            AUDIT TRAIL:
          </strong>{" "}
          Every import is recorded as an immutable ConnectorRun with SHA-256 file hash, user identity, timestamp, and
          row-level audit entries — fully traceable in the Import History and Governance › Audit Trail.
        </div>
      </div>

      {/* CSS Animation for spinner */}
      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
