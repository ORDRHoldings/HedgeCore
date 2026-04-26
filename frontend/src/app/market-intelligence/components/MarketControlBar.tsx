"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { S } from "../types";

function utcNow(): string {
  const d = new Date();
  return (
    d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "UTC",
    }) + " UTC"
  );
}

export default function MarketControlBar() {
  const [utcClock, setUtcClock] = useState("");

  useEffect(() => {
    setUtcClock(utcNow());
    const id = setInterval(() => setUtcClock(utcNow()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        height: 44,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 24px",
        background: S.bgDeep,
        borderBottom: `1px solid ${S.rim}`,
      }}
    >
      {/* Brand */}
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: 14,
          fontWeight: 700,
          color: S.primary,
          letterSpacing: "0.1em",
        }}
      >
        MARKET INTELLIGENCE
      </span>

      <div style={{ flex: 1 }} />

      {/* Live badge */}
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 700,
          padding: "2px 8px",
          borderRadius: 3,
          background: "rgba(5,150,105,0.12)",
          color: S.green,
          letterSpacing: "0.08em",
        }}
      >
        LIVE
      </span>

      {/* UTC clock */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: S.fontMono,
          fontSize: 13,
          color: S.secondary,
        }}
      >
        <Clock size={14} style={{ color: S.tertiary }} />
        {utcClock}
      </div>
    </div>
  );
}
