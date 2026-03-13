"use client";

import { T } from "@/lib/design/tokens";

interface Props {
  token: string;
}

export default function SavedTab({ token }: Props) {
  void token;
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
        SAVED REPORTS
      </span>
    </div>
  );
}
