import type { LucideIcon } from "lucide-react";

interface IconProps {
  icon: LucideIcon;
  size?: number;
  color?: string;
  className?: string;
}

/**
 * ORDR Icon wrapper -- enforces cold, authoritative style.
 * Sharp square caps + miter joins. Never use raw Lucide imports.
 */
export function Icon({ icon: IconComponent, size = 20, color, className }: IconProps) {
  return (
    <IconComponent
      size={size}
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      color={color}
      className={className}
    />
  );
}
