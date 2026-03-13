"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { S } from "../types";

interface Props {
  scriptSrc: string;
  config: Record<string, unknown>;
  height?: string | number;
  style?: React.CSSProperties;
}

/**
 * Generic TradingView embed widget via script injection.
 *
 * Uses a standalone DOM node (outside React's tree) to avoid
 * "removeChild" errors when React unmounts while TradingView
 * has injected iframes/scripts into the container.
 */
export default function TradingViewWidget({ scriptSrc, config, height = 400, style }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tvContainerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);

  const configKey = useMemo(() => JSON.stringify(config), [config]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Create a detached container so React never owns its children
    const tvContainer = document.createElement("div");
    tvContainer.style.cssText = "width:100%;height:100%;";
    tvContainerRef.current = tvContainer;
    wrapper.appendChild(tvContainer);

    setLoading(true);

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    tvContainer.appendChild(widgetDiv);

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

    const timer = setTimeout(() => setLoading(false), 3000);

    tvContainer.appendChild(script);

    return () => {
      clearTimeout(timer);
      // Safe cleanup: remove our container from the wrapper.
      // Use try/catch to guard against edge cases where the DOM
      // tree was already torn down by React.
      try {
        if (tvContainer.parentNode) {
          tvContainer.parentNode.removeChild(tvContainer);
        }
      } catch {
        /* already removed */
      }
      tvContainerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptSrc, configKey]);

  return (
    <div
      ref={wrapperRef}
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
