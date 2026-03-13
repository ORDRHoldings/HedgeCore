import { T } from "../../tokens/tokens";

type Variant = "primary" | "secondary" | "ghost";

interface ActionButtonProps {
  variant?: Variant;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  type?: "button" | "submit";
  style?: React.CSSProperties;
}

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: T.accent,
    color: "#FFFFFF",
    border: "none",
  },
  secondary: {
    background: "transparent",
    color: T.primary,
    border: `1px solid ${T.rim}`,
  },
  ghost: {
    background: "transparent",
    color: T.secondary,
    border: "none",
  },
};

/**
 * Action button with T token styling.
 * Supports primary, secondary, and ghost variants.
 */
export function ActionButton({
  variant = "primary",
  disabled = false,
  onClick,
  children,
  type = "button",
  style,
}: ActionButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={{
        fontFamily: T.fontUI,
        fontSize: 13,
        fontWeight: 600,
        padding: "8px 16px",
        borderRadius: 3,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "opacity 100ms",
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}
