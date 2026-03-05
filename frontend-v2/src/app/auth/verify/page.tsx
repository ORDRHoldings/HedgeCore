"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary, #0F172A)",
    textAlign: "center" as const,
    marginBottom: 8,
    fontFamily: "var(--font-heading,'Manrope',sans-serif)",
  },
  subtitle: {
    fontSize: 14,
    color: "var(--text-secondary, #334155)",
    textAlign: "center" as const,
    marginBottom: 32,
    lineHeight: 1.5,
  },
  emailHighlight: {
    color: "var(--accent-cyan, #1C62F2)",
    fontWeight: 600,
  },
  otpRow: {
    display: "flex",
    gap: 10,
    justifyContent: "center",
    marginBottom: 28,
  },
  otpBox: {
    width: 52,
    height: 60,
    border: "2px solid var(--border-rim, #E2E8F0)",
    borderRadius: 10,
    textAlign: "center" as const,
    fontSize: 24,
    fontWeight: 700,
    color: "var(--text-primary, #0F172A)",
    background: "var(--bg-sub, #F1F5F9)",
    outline: "none",
    fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
    caretColor: "var(--accent-cyan, #1C62F2)",
    transition: "border-color 0.15s",
  },
  otpBoxFocused: {
    borderColor: "var(--accent-cyan, #1C62F2)",
    background: "var(--bg-panel, #FFFFFF)",
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
    transition: "opacity 0.15s",
    marginBottom: 16,
  },
  resendRow: {
    textAlign: "center" as const,
    fontSize: 13,
    color: "var(--text-tertiary, #94A3B8)",
    marginBottom: 20,
  },
  resendBtn: {
    background: "none",
    border: "none",
    color: "var(--accent-cyan, #1C62F2)",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
    padding: 0,
  },
  backLink: {
    display: "block",
    textAlign: "center" as const,
    fontSize: 13,
    color: "var(--text-tertiary, #94A3B8)",
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
  comingSoon: {
    textAlign: "center" as const,
  },
  comingSoonIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  comingSoonTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary, #0F172A)",
    marginBottom: 8,
    fontFamily: "var(--font-heading,'Manrope',sans-serif)",
  },
  comingSoonText: {
    fontSize: 14,
    color: "var(--text-secondary, #334155)",
    marginBottom: 24,
    lineHeight: 1.5,
  },
  linkBtn: {
    display: "inline-block",
    padding: "10px 24px",
    background: "var(--accent-cyan, #1C62F2)",
    color: "#FFFFFF",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
  },
} as const;

const RESEND_COOLDOWN = 30;

function VerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const { setToken, setUser } = useAuthStore();

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCountdown, setResendCountdown] = useState(RESEND_COOLDOWN);
  const [featureNotReady, setFeatureNotReady] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Start resend countdown on mount
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      // Handle paste
      if (value.length > 1) {
        const pasted = value.replace(/\D/g, "").slice(0, 6);
        const newDigits = [...digits];
        for (let i = 0; i < pasted.length && index + i < 6; i++) {
          newDigits[index + i] = pasted[i];
        }
        setDigits(newDigits);
        const nextFocus = Math.min(index + pasted.length, 5);
        inputRefs.current[nextFocus]?.focus();
        return;
      }

      const digit = value.replace(/\D/g, "").slice(-1);
      const newDigits = [...digits];
      newDigits[index] = digit;
      setDigits(newDigits);

      if (digit && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [digits]
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        if (digits[index]) {
          const newDigits = [...digits];
          newDigits[index] = "";
          setDigits(newDigits);
        } else if (index > 0) {
          inputRefs.current[index - 1]?.focus();
        }
      }
    },
    [digits]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent, index: number) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text");
      handleDigitChange(index, text);
    },
    [handleDigitChange]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = digits.join("");
    if (code.length < 6) {
      setError("Please enter all 6 digits.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/auth/passwordless/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      if (res.status === 404 || res.status === 405) {
        setFeatureNotReady(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Invalid or expired code. Please try again.");
        setLoading(false);
        return;
      }

      const data = await res.json();
      const accessToken: string = data.access_token;
      setToken(accessToken);

      // Fetch user profile
      const meRes = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (meRes.ok) {
        const userData = await meRes.json();
        setUser(userData);
        document.cookie = `user_tier=${userData.plan_tier ?? "free"}; path=/; SameSite=Lax`;
        document.cookie = `user_su=${userData.is_superuser ? "1" : "0"}; path=/; SameSite=Lax`;
      }

      router.replace("/audit-lab");
    } catch {
      setError("Network error. Please check your connection.");
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCountdown > 0) return;
    setResendCountdown(RESEND_COOLDOWN);
    setError("");
    try {
      await fetch(`${API_BASE}/auth/passwordless/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Silently ignore
    }
  }

  if (featureNotReady) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.comingSoon}>
            <div style={S.comingSoonIcon}>🚧</div>
            <div style={S.comingSoonTitle}>Feature Coming Soon</div>
            <div style={S.comingSoonText}>
              Passwordless login is not yet available. Please sign in with your
              email and password in the meantime.
            </div>
            <Link href="/auth/login" style={S.linkBtn}>
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>ORDR</div>
        <div style={S.title}>Check your email</div>
        <div style={S.subtitle}>
          We sent a 6-digit code to{" "}
          <span style={S.emailHighlight}>{email || "your email"}</span>.<br />
          It expires in 10 minutes.
        </div>

        {error && <div style={S.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={S.otpRow}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                style={{
                  ...S.otpBox,
                  ...(focusedIndex === i ? S.otpBoxFocused : {}),
                }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={(e) => handlePaste(e, i)}
                onFocus={() => setFocusedIndex(i)}
                onBlur={() => setFocusedIndex(null)}
                autoComplete="one-time-code"
              />
            ))}
          </div>

          <button
            type="submit"
            style={{ ...S.btnPrimary, opacity: loading ? 0.65 : 1 }}
            disabled={loading}
          >
            {loading ? "Verifying…" : "Verify Code →"}
          </button>
        </form>

        <div style={S.resendRow}>
          {resendCountdown > 0 ? (
            <>Resend code in {resendCountdown}s</>
          ) : (
            <>
              Didn&apos;t receive it?{" "}
              <button style={S.resendBtn} onClick={handleResend} type="button">
                Resend code
              </button>
            </>
          )}
        </div>

        <Link href="/auth/login" style={S.backLink}>
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
