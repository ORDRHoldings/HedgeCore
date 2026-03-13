"use client";

import MarketPulseStrip from "../overview/MarketPulseStrip";
import LeftColumn from "../overview/LeftColumn";
import CenterColumn from "../overview/CenterColumn";
import RightColumn from "../overview/RightColumn";
import BelowFoldModules from "../overview/BelowFoldModules";
import { S } from "../../types";

export default function OverviewTab() {
  return (
    <div style={{ padding: "0 24px" }}>
      {/* Layer 1: Ticker Tape */}
      <div
        style={{
          borderRadius: 6,
          overflow: "hidden",
          border: `1px solid ${S.rim}`,
          marginBottom: 16,
        }}
      >
        <MarketPulseStrip />
      </div>

      {/* Layer 2: Three columns */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 0,
        }}
      >
        <LeftColumn />
        <CenterColumn />
        <RightColumn />
      </div>

      {/* Layers 3-5: Below the fold */}
      <BelowFoldModules />
    </div>
  );
}
