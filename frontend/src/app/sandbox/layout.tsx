"use client";

import { ReactNode } from "react";

export default function SandboxLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-full">
      {/* SIMULATION MODE watermark */}
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
        <span className="text-[6rem] font-extrabold text-[var(--text-primary)] opacity-[0.02] rotate-[-15deg] whitespace-nowrap select-none tracking-widest">
          SIMULATION MODE
        </span>
      </div>
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
