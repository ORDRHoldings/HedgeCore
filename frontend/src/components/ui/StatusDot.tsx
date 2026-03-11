import { T } from "@/lib/design/tokens";

type Status = "pass" | "fail" | "warn" | "neutral";

const colorMap: Record<Status, string> = {
  pass: T.pass,
  fail: T.fail,
  warn: T.warn,
  neutral: T.tertiary,
};

interface StatusDotProps {
  status: Status;
  size?: number;
  label?: string;
}

export function StatusDot({ status, size = 8, label }: StatusDotProps) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        role="img"
        aria-label={label || status}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: colorMap[status],
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {label && (
        <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.secondary }}>
          {label}
        </span>
      )}
    </span>
  );
}
