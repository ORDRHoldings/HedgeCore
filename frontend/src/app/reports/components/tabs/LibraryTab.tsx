"use client";

import { T } from "@/lib/design/tokens";

interface Props {
  onSelectPreset: (presetId: string) => void;
}

export default function LibraryTab({ onSelectPreset }: Props) {
  void onSelectPreset;
  return (
    <div
      style={{
        padding: 32,
        fontFamily: T.fontMono,
        fontSize: 13,
        color: T.secondary,
        letterSpacing: "0.04em",
      }}
    >
      <span style={{ color: T.tertiary, textTransform: "uppercase" }}>
        TEMPLATE LIBRARY
      </span>
    </div>
  );
}
