"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { path: "/", label: "Input" },
  { path: "/results", label: "Bank Pack" },
  { path: "/reports", label: "Reports" },
];

export default function Header() {
  const pathname = usePathname();

  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname?.startsWith(path);

  const linkCls = (path: string) =>
    `px-3 py-2 rounded text-sm font-medium transition-colors ${
      isActive(path)
        ? "bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border-b-2 border-[var(--accent-cyan)]"
        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
    }`;

  return (
    <header className="bg-[var(--bg-sub)] text-[var(--text-primary)] border-b border-[var(--border-rim)]">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">HedgeCalc</h1>
          <span className="text-[var(--text-secondary)] text-xs font-mono">
            FX POC &middot; USD/MXN
          </span>
        </div>
        <div className="flex items-center gap-6">
          <nav className="flex gap-2 no-print">
            {NAV_LINKS.map((link) => (
              <Link key={link.path} href={link.path} className={linkCls(link.path)}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="text-[10px] font-mono text-[var(--text-secondary)] tracking-wider opacity-60 hidden md:block">
            Engine v1.0.0 &middot; Deterministic &middot; Snapshot Bound
          </div>
        </div>
      </div>
    </header>
  );
}
