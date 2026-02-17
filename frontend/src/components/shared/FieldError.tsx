"use client";

interface Props {
  error?: string;
  warning?: string;
}

export default function FieldError({ error, warning }: Props) {
  if (error) return <p className="text-sm text-[var(--accent-red)] mt-1">{error}</p>;
  if (warning) return <p className="text-sm text-[var(--accent-amber)] mt-1">{warning}</p>;
  return null;
}
