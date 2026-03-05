"use client";

import { useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";
import { useUIStore } from "@/lib/ui/store";
import Sidebar from "@/components/layout/Sidebar";
import VoiceTerminal from "@/components/voice/VoiceTerminal";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, user, isLoading } = useAuthStore();
  const { sidebarWidth } = useUIStore();

  useEffect(() => {
    if (!isLoading && !user && !token) {
      router.replace("/auth/login");
    }
  }, [isLoading, user, token, router]);

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "var(--bg-deep)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: "3px solid var(--border-rim)",
            borderTopColor: "var(--accent-cyan)",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user && !token) {
    return null;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar is self-positioned fixed — no wrapper needed */}
      <Sidebar />

      {/* Main scrollable content area tracks sidebar width */}
      <main
        style={{
          marginLeft: sidebarWidth,
          padding: "32px 40px",
          minHeight: "100vh",
          background: "var(--bg-deep)",
          flex: 1,
          overflowX: "hidden",
          transition: "margin-left 200ms ease",
        }}
      >
        <Suspense fallback={null}>{children}</Suspense>
      </main>
      <VoiceTerminal />
    </div>
  );
}
