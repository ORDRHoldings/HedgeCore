"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://hedgecore.onrender.com/api";

const S = {
  page: {
    minHeight: "100vh",
    background: "var(--bg-deep, #F8FAFC)",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  },
  card: {
    background: "var(--bg-panel, #FFFFFF)",
    border: "1px solid var(--border-rim, #E2E8F0)",
    borderRadius: 16,
    padding: "48px 40px",
    width: "100%",
    maxWidth: 480,
    boxShadow: "0 4px 24px rgba(15,23,42,0.06)",
  },
  logo: {
    fontFamily: "var(--font-heading,'Manrope',sans-serif)",
    fontSize: 40,
    fontWeight: 800,
    color: "var(--accent-cyan, #1C62F2)",
    letterSpacing: "-1.5px",
    textAlign: "center" as const,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: "var(--text-secondary, #334155)",
    textAlign: "center" as const,
    marginBottom: 36,
    fontWeight: 400,
  },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary, #334155)",
    marginBottom: 6,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  },
  inputWrapper: {
    position: "relative" as const,
    display: "flex",
    alignItems: "center",
    background: "var(--bg-sub, #F1F5F9)",
    border: "1px solid var(--border-rim, #E2E8F0)",
    borderRadius: 8,
    marginBottom: 20,
    transition: "border-color 0.15s",
  },
  inputPrefix: {
    padding: "0 12px",
    fontSize: 16,
    lineHeight: 1,
    color: "var(--text-tertiary, #94A3B8)",
    userSelect: "none" as const,
  },
  input: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    padding: "12px 14px 12px 0",
    fontSize: 15,
    color: "var(--text-primary, #0F172A)",
    fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
    width: "100%",
  },
  btnPrimary: {
    display: "block",
    width: "100%",
    padding: "13px 20px",
    background: "var(--accent-cyan, #1C62F2)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
    cursor: "pointer",
    textAlign: "center" as const,
    letterSpacing: "0.01em",
    transition: "opacity 0.15s",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    margin: "24px 0",
    color: "var(--text-tertiary, #94A3B8)",
    fontSize: 13,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: "var(--border-rim, #E2E8F0)",
  },
  signInRow: {
    textAlign: "center" as const,
    fontSize: 14,
    color: "var(--text-secondary, #334155)",
    marginTop: 4,
  },
  link: {
    color: "var(--accent-cyan, #1C62F2)",
    fontWeight: 600,
    textDecoration: "none",
  },
  freeNote: {
    textAlign: "center" as const,
    fontSize: 12,
    color: "var(--text-tertiary, #94A3B8)",
    marginTop: 20,
    fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  },
  error: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "var(--accent-red, #DC2626)",
    marginBottom: 16,
  },
  trustRow: {
    marginTop: 32,
    textAlign: "center" as const,
    fontSize: 12,
    color: "var(--text-tertiary, #94A3B8)",
    fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  },
} as const;

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showFallback, setShowFallback] = useState(false);

  // Fallback password signup state
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handlePasswordless(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/auth/passwordless/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (res.status === 404 || res.status === 405 || res.status === 422) {
        // Endpoint not ready — show fallback
        setShowFallback(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Failed to send verification code. Please try again.");
        setLoading(false);
        return;
      }

      router.push(`/auth/verify?email=${encodeURIComponent(email.trim())}`);
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  }

  async function handleFallbackSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setError("Account registration is managed by your administrator. Please contact support.");
  }

  if (showFallback) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.logo}>ORDR</div>
          <div style={S.tagline}>Create your account</div>

          {error && <div style={S.error}>{error}</div>}

          <form onSubmit={handleFallbackSignup}>
            <label style={S.label}>Email</label>
            <div style={S.inputWrapper}>
              <span style={S.inputPrefix}>📧</span>
              <input
                style={S.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
            </div>

            <label style={S.label}>Password</label>
            <div style={S.inputWrapper}>
              <span style={S.inputPrefix}>🔑</span>
              <input
                style={S.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                required
                autoComplete="new-password"
              />
            </div>

            <label style={S.label}>Confirm Password</label>
            <div style={S.inputWrapper}>
              <span style={S.inputPrefix}>🔑</span>
              <input
                style={S.input}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                required
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              style={{ ...S.btnPrimary, opacity: loading ? 0.65 : 1 }}
              disabled={loading}
            >
              Create Account →
            </button>
          </form>

          <div style={S.divider}>
            <div style={S.dividerLine} />
            <span>or</span>
            <div style={S.dividerLine} />
          </div>

          <div style={S.signInRow}>
            Already have an account?{" "}
            <Link href="/auth/login" style={S.link}>
              Sign in
            </Link>
          </div>
        </div>
        <div style={S.trustRow}>🔒 Bank-grade encryption · No credit card required</div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>ORDR</div>
        <div style={S.tagline}>See what FX is costing you.</div>

        {error && <div style={S.error}>{error}</div>}

        <form onSubmit={handlePasswordless}>
          <label style={S.label}>Email</label>
          <div style={S.inputWrapper}>
            <span style={S.inputPrefix}>📧</span>
            <input
              style={S.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <button
            type="submit"
            style={{ ...S.btnPrimary, opacity: loading ? 0.65 : 1 }}
            disabled={loading}
          >
            {loading ? "Sending…" : "Send Verification Code →"}
          </button>
        </form>

        <div style={S.divider}>
          <div style={S.dividerLine} />
          <span>or</span>
          <div style={S.dividerLine} />
        </div>

        <div style={S.signInRow}>
          Already have an account?{" "}
          <Link href="/auth/login" style={S.link}>
            Sign in
          </Link>
        </div>

        <div style={S.freeNote}>No credit card. No password. Free forever.</div>
      </div>

      <div style={S.trustRow}>🔒 Bank-grade encryption · No credit card required</div>
    </div>
  );
}
