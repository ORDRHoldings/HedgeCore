"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function ExecutionDeskRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/hedge-desk"); }, [router]);
  return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: 11, color: "var(--text-tertiary)" }}>Redirecting to Hedge Desk…</div>;
}
