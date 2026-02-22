"use client";

export type ChipStatus =
  | "PASS"
  | "FAIL"
  | "WARN"
  | "BLOCK"
  | "PENDING"
  | "DRAFT"
  | "AUTHORIZED"
  | "REJECTED"
  | "RETURNED";

export interface StatusChipProps {
  status: ChipStatus;
  size?: "sm" | "md";
  className?: string;
}

type ColorSet = { bg: string; text: string; dot: string };

const colorMap: Record<ChipStatus, ColorSet> = {
  PASS:       { bg: "bg-green-50",  text: "text-[var(--accent-green)]", dot: "bg-[var(--accent-green)]" },
  AUTHORIZED: { bg: "bg-green-50",  text: "text-[var(--accent-green)]", dot: "bg-[var(--accent-green)]" },
  FAIL:       { bg: "bg-red-50",    text: "text-[var(--accent-red)]",   dot: "bg-[var(--accent-red)]" },
  REJECTED:   { bg: "bg-red-50",    text: "text-[var(--accent-red)]",   dot: "bg-[var(--accent-red)]" },
  BLOCK:      { bg: "bg-red-50",    text: "text-[var(--accent-red)]",   dot: "bg-[var(--accent-red)]" },
  WARN:       { bg: "bg-amber-50",  text: "text-[var(--accent-amber)]", dot: "bg-[var(--accent-amber)]" },
  PENDING:    { bg: "bg-amber-50",  text: "text-[var(--accent-amber)]", dot: "bg-[var(--accent-amber)]" },
  DRAFT:      { bg: "bg-amber-50",  text: "text-[var(--accent-amber)]", dot: "bg-[var(--accent-amber)]" },
  RETURNED:   { bg: "bg-gray-50",   text: "text-[var(--text-secondary)]", dot: "bg-[var(--text-secondary)]" },
};

const sizeStyles = {
  sm: "px-1.5 py-0.5 text-[0.75rem] gap-1",
  md: "px-2 py-0.5 text-[0.8125rem] gap-1.5",
};

const dotSizes = {
  sm: "w-1 h-1",
  md: "w-1.5 h-1.5",
};

export default function StatusChip({
  status,
  size = "md",
  className = "",
}: StatusChipProps) {
  const colors = colorMap[status];

  return (
    <span
      className={[
        "inline-flex items-center rounded-full font-medium leading-none whitespace-nowrap",
        colors.bg,
        colors.text,
        sizeStyles[size],
        className,
      ].join(" ")}
    >
      <span className={`rounded-full shrink-0 ${colors.dot} ${dotSizes[size]}`} />
      {status}
    </span>
  );
}
