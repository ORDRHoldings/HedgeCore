"use client";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  style?: React.CSSProperties;
}

const sizeMap = {
  sm: 16,
  md: 24,
  lg: 32,
};

/**
 * Theme-aware loading spinner using CSS variables.
 */
export default function Spinner({ size = "md", style }: SpinnerProps) {
  const px = sizeMap[size];
  return (
    <div
      style={{
        width: px,
        height: px,
        borderRadius: "50%",
        border: "2px solid var(--border-rim)",
        borderTopColor: "var(--accent-blue)",
        animation: "spin 0.6s linear infinite",
        ...style,
      }}
      role="status"
      aria-label="Loading"
    />
  );
}
