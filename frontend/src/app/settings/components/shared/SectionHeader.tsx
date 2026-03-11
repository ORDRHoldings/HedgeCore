"use client";
import { S } from "../../types/settings";

export default function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
      letterSpacing: "0.09em", color: S.tertiary,
      borderBottom: `1px solid ${S.soft}`, paddingBottom: 6, marginBottom: 14,
      textTransform: "uppercase",
    }}>
      {label}
    </div>
  );
}
