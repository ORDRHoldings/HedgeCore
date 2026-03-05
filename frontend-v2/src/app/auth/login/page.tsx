"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth/store";

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
  title: {
    fontSize: 18,
    fontWeight: 600,
    color: "var(--text-primary, #0F172A)",
    textAlign: "center" as const,
    marginBottom: 32,
    fontFamily: "var(--font-heading,'Manrope',sans-serif)",
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
    display: "flex",
    alignItems: "center",
    background: "var(--bg-sub, #F1F5F9)",
    border: "1px solid var(--border-rim, #E2E8F0)",
    borderRadius: 8,
    marginBottom: 20,
    transition: "border-color 0.15s",
  },
  inputWrapperFocus: {
    borderColor: "var(--accent-cyan, #1C62F2)",
    background: "var(--bg-panel, #FFFFFF)",
  },
  input: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    padding: "12px 14px",
    fontSize: 15,
    color: "var(--text-primary, #0F172A)",
    fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
    width: "100%",
  },
  eyeBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "0 12px",
    fontSize: 16,
    color: "var(--text-tertiary, #94A3B8)",
    lineHeight: 1,
    userSelect: "none" as const,
  },
  forgotRow: {
    textAlign: "right" as const,
    marginTop: -12,
    marginBottom: 24,
  },
  forgotBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-tertiary, #94A3B8)",
    fontSize: 12,
    fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
    padding: 0,
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
  signUpRow: {
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
  error: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "var(--accent-red, #DC2626)",
    marginBottom: 16,
    textAlign: "center" as const,
  },
  forgotNotice: {
    background: "var(--bg-sub, #F1F5F9)",
    border: "1px solid var(--border-rim, #E2E8F0)",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "var(--text-secondary, #334155)",
    marginBottom: 16,
    textAlign: "center" as const,
  },
  trustRow: {
    marginTop: 32,
    textAlign: "center" as const,
    fontSize: 12,
    color: "var(--text-tertiary, #94A3B8)",
    fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  },
} as const;

export default function LoginPage() {
  const router = useRouter();
  const { setToken, setUser } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForgotNotice, setShowForgotNotice] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setError("");
    setShowForgotNotice(false);

    try {
      // OAuth2 form login — x-www-form-urlencoded
      const form = new URLSearchParams();
      form.append("username", email.trim());
      form.append("password", password);

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = data.detail;
        if (typeof detail === "string") {
          setError(detail);
        } else if (Array.isArray(detail)) {
          setError(detail[0]?.msg || "Invalid credentials.");
        } else {
          setError("Invalid email or password. Please try again.");
        }
        setLoading(false);
        return;
      }

      const data = await res.json();
      const accessToken: string = data.access_token;

      // Set CSRF cookie if returned
      if (data.csrf_token) {
        document.cookie = `csrf_token=${data.csrf_token}; path=/; SameSite=Lax`;
      }

      setToken(accessToken);

      // Fetch user profile
      const meRes = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (meRes.ok) {
        const userData = await meRes.json();
        setUser(userData);

        // Set user tier and superuser cookies
        document.cookie = `user_tier=${userData.plan_tier ?? "free"}; path=/; SameSite=Lax`;
        document.cookie = `user_su=${userData.is_superuser ? "1" : "0"}; path=/; SameSite=Lax`;
      }

      router.replace("/audit-lab");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>ORDR</div>
        <div style={S.title}>Sign in to ORDR Terminal</div>

        {error && <div style={S.error}>{error}</div>}
        {showForgotNotice && (
          <div style={S.forgotNotice}>
            Password resets are managed by your administrator. Please contact
            your system admin for access.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label style={S.label}>Email</label>
          <div
            style={{
              ...S.inputWrapper,
              ...(emailFocused ? S.inputWrapperFocus : {}),
            }}
          >
            <input
              style={S.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              placeholder="you@company.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <label style={S.label}>Password</label>
          <div
            style={{
              ...S.inputWrapper,
              marginBottom: 8,
              ...(passwordFocused ? S.inputWrapperFocus : {}),
            }}
          >
            <input
              style={S.input}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              placeholder="Your password"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              style={S.eyeBtn}
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>

          <div style={S.forgotRow}>
            <button
              type="button"
              style={S.forgotBtn}
              onClick={() => {
                setShowForgotNotice(true);
                setError("");
              }}
            >
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            style={{ ...S.btnPrimary, opacity: loading ? 0.65 : 1 }}
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign In →"}
          </button>
        </form>

        <div style={S.divider}>
          <div style={S.dividerLine} />
          <span>or</span>
          <div style={S.dividerLine} />
        </div>

        <div style={S.signUpRow}>
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" style={S.link}>
            Sign up
          </Link>
        </div>
      </div>

      <div style={S.trustRow}>🔒 Bank-grade encryption · No credit card required</div>
    </div>
  );
}
