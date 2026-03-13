"use client";

import { T } from "@/lib/design/tokens";

interface Props {
  token: string;
  userId?: string;
}

export default function StudioTab({ token, userId }: Props) {
  void token;
  void userId;
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
        REPORT STUDIO
      </span>
    </div>
  );
}
