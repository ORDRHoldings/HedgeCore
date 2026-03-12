"use client";
/**
 * SkipToContent -- keyboard-only skip link for accessibility.
 * Invisible until focused, jumps to #main-content.
 */
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      style={{
        position: "absolute",
        top: -9999,
        left: -9999,
        zIndex: 99999,
        padding: "12px 24px",
        background: "var(--accent-blue, #1C62F2)",
        color: "#FFFFFF",
        fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
        fontSize: 14,
        fontWeight: 700,
        textDecoration: "none",
        borderRadius: 4,
      }}
      onFocus={(e) => {
        e.currentTarget.style.top = "12px";
        e.currentTarget.style.left = "12px";
      }}
      onBlur={(e) => {
        e.currentTarget.style.top = "-9999px";
        e.currentTarget.style.left = "-9999px";
      }}
    >
      Skip to main content
    </a>
  );
}
