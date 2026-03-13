"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

/**
 * Theme-aware Button using CSS variables.
 * Supports primary, secondary, and danger variants.
 */
export default function Button({
  variant = "primary",
  size = "md",
  children,
  style,
  ...props
}: ButtonProps) {
  const baseStyle: React.CSSProperties = {
    fontFamily: "var(--font-terminal, 'IBM Plex Sans', sans-serif)",
    fontWeight: 600,
    borderRadius: 4,
    cursor: props.disabled ? "not-allowed" : "pointer",
    opacity: props.disabled ? 0.5 : 1,
    transition: "all 100ms",
    border: "none",
    outline: "none",
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: "6px 12px", fontSize: 13 },
    md: { padding: "8px 16px", fontSize: 13 },
    lg: { padding: "12px 24px", fontSize: 14 },
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: "var(--accent-blue)",
      color: "#FFFFFF",
    },
    secondary: {
      background: "transparent",
      color: "var(--text-primary)",
      border: "1px solid var(--border-rim)",
    },
    danger: {
      background: "var(--accent-red)",
      color: "#FFFFFF",
    },
  };

  return (
    <button
      style={{
        ...baseStyle,
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
