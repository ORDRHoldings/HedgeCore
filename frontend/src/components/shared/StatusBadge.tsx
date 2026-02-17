"use client";

type Variant = 'demo' | 'manual' | 'ready' | 'error' | 'warning';

interface Props {
  variant: Variant;
  label: string;
}

const styles: Record<Variant, string> = {
  demo: 'bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border-[var(--accent-amber)]/20',
  manual: 'bg-[var(--bg-sub)] text-[var(--text-secondary)] border-[var(--border-rim)]',
  ready: 'bg-[var(--accent-green)]/10 text-[var(--accent-green)] border-[var(--accent-green)]/20',
  error: 'bg-[var(--accent-red)]/10 text-[var(--accent-red)] border-[var(--accent-red)]/20',
  warning: 'bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border-[var(--accent-amber)]/20',
};

export default function StatusBadge({ variant, label }: Props) {
  return (
    <span className={`inline-block border rounded-full px-3 py-1 text-xs font-medium ${styles[variant]}`}>
      {label}
    </span>
  );
}
