"use client";

import { useEffect, useRef, useState } from "react";
import { S } from "../types";

interface Props {
  scriptSrc: string;
  config: Record<string, unknown>;
  height?: string | number;
  style?: React.CSSProperties;
}

/**
 * Generic TradingView embed widget via script injection.
 * Distinct from TradingViewEmbed.tsx which uses the tv.js programmatic API.
 */
export default function TradingViewWidget({ scriptSrc, config, height = 400, style }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  const configKey = JSON.stringify(config);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setLoading(true);
    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = `https://s3.tradingview.com/external-embedding/${scriptSrc}`;
    script.async = true;
    script.textContent = JSON.stringify({
      ...config,
      colorTheme: "dark",
      isTransparent: true,
    });

    script.onload = () => setLoading(false);
    script.onerror = () => setLoading(false);

    // TradingView widgets typically render after a brief delay
    const timer = setTimeout(() => setLoading(false), 3000);

    container.appendChild(script);

    return () => {
      clearTimeout(timer);
      if (container) container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptSrc, configKey]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height,
        overflow: "hidden",
        ...style,
      }}
    >
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: S.bgPanel,
            zIndex: 5,
          }}
        >
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              color: S.tertiary,
              letterSpacing: "0.08em",
            }}
          >
            Loading widget...
          </span>
        </div>
      )}
    </div>
  );
}
