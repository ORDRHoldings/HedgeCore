"use client";
/**
 * Badge — status / tier indicator chip
 */

interface Props {
  label: string;
  variant?: "default" | "success" | "warn" | "danger" | "pending" | "blue";
  size?: "sm" | "md";
}

const VARIANTS = {
  default:  { bg: "#F1F5F9", text: "#64748B" },
  success:  { bg: "#ECFDF5", text: "#059669" },
  warn:     { bg: "#FFFBEB", text: "#D97706" },
  danger:   { bg: "#FEF2F2", text: "#DC2626" },
  pending:  { bg: "#F8FAFC", text: "#94A3B8" },
  blue:     { bg: "#EFF6FF", text: "#1C62F2" },
};

export function Badge({ label, variant = "default", size = "sm" }: Props) {
  const colors = VARIANTS[variant];
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "var(--font-terminal-mono)",
        fontSize: size === "sm" ? 9 : 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: colors.text,
        background: colors.bg,
        padding: size === "sm" ? "2px 8px" : "4px 10px",
        borderRadius: 2,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export function statusVariant(status: string): Props["variant"] {
  const map: Record<string, Props["variant"]> = {
    NEW: "default",
    POLICY_ASSIGNED: "blue",
    READY_TO_EXECUTE: "warn",
    HEDGED: "success",
    EXECUTED: "success",
    REJECTED: "danger",
    PROPOSED: "warn",
    APPROVED: "success",
    WITHDRAWN: "pending",
    COMPLETED: "success",
    RUNNING: "warn",
    FAILED: "danger",
  };
  return map[status] ?? "default";
}
