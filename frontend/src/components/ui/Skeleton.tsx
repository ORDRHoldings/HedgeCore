"use client";

import React from "react";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = 4,
  className,
  style,
}: SkeletonProps) {
  return (
    <div
      className={`ordr-skeleton-pulse ${className ?? ""}`}
      style={{
        width,
        height,
        borderRadius,
        background: "var(--border-soft)",
        ...style,
      }}
    />
  );
}

interface SkeletonBlockProps {
  rows?: number;
  rowHeight?: number;
  gap?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function SkeletonBlock({
  rows = 4,
  rowHeight = 16,
  gap = 8,
  className,
  style,
}: SkeletonBlockProps) {
  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap, ...style }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={rowHeight} borderRadius={rowHeight / 4} />
      ))}
    </div>
  );
}

interface SkeletonTableProps {
  columns?: number;
  rows?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function SkeletonTable({
  columns = 4,
  rows = 5,
  className,
  style,
}: SkeletonTableProps) {
  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}>
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 12 }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`h-${i}`} height={14} borderRadius={3} width={`${60 + Math.random() * 40}%`} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`r-${r}`} style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 12 }}>
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={`c-${c}`} height={12} borderRadius={3} width={`${40 + Math.random() * 50}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}
