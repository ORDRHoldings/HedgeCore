"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Mail, Lock, ArrowRight, CheckCircle } from "lucide-react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

type Step = 1 | 2 | 3;

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const fontUI = "var(--font-terminal,'IBM Plex Sans',sans-serif)";
  const fontMono = "var(--font-terminal-mono,'IBM Plex Mono',monospace)";

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setError("Company name is required");
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const resp = await fetch(`${apiUrl}/api/v1/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          admin_email: email,
          admin_password: password,
        }),
      });
      if (resp.status === 201) {
        setStep(3);
      } else if (resp.status === 409) {
        setError("An account with this email already exists.");
      } else {
        const data = await resp.json().catch(() => ({}));
        setError((data as { detail?: string })?.detail || "Signup failed. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-deep)",
        fontFamily: fontUI,
        padding: isMobile ? "12px" : "24px",
      }}
    >
      {/* Logo / title */}
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div
          style={{
            fontFamily: fontMono,
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "0.08em",
          }}
        >
          ORDR TERMINAL
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            marginTop: 4,
          }}
        >
          Create your institutional workspace
        </div>
      </div>

      {/* Card */}
      <div
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border-rim)",
          borderRadius: 8,
          padding: isMobile ? "20px 16px" : "32px 36px",
          width: "100%",
          maxWidth: 420,
        }}
      >
        {/* Step indicator */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 28,
            justifyContent: "center",
          }}
        >
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                width: 28,
                height: 4,
                borderRadius: 2,
                background:
                  step >= s
                    ? "var(--accent-primary, #3b82f6)"
                    : "var(--border-rim)",
              }}
            />
          ))}
        </div>

        {step === 1 && (
          <form onSubmit={handleStep1}>
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Company Name
              </label>
              <div style={{ position: "relative" }}>
                <Building2
                  size={15}
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                  }}
                />
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Corporation"
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "9px 12px 9px 32px",
                    background: "var(--bg-sub)",
                    border: "1px solid var(--border-rim)",
                    borderRadius: 4,
                    color: "var(--text-primary)",
                    fontFamily: fontUI,
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {error && (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--color-red, #ef4444)",
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              style={{
                width: "100%",
                padding: "10px",
                background: "var(--accent-primary, #3b82f6)",
                border: "none",
                borderRadius: 4,
                color: "var(--text-primary)",
                fontFamily: fontUI,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              Continue <ArrowRight size={14} />
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleStep2}>
            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Admin Email
              </label>
              <div style={{ position: "relative" }}>
                <Mail
                  size={15}
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                  }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@acme.com"
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "9px 12px 9px 32px",
                    background: "var(--bg-sub)",
                    border: "1px solid var(--border-rim)",
                    borderRadius: 4,
                    color: "var(--text-primary)",
                    fontFamily: fontUI,
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
            {/* Password */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Password
              </label>
              <div style={{ position: "relative" }}>
                <Lock
                  size={15}
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                  }}
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  style={{
                    width: "100%",
                    padding: "9px 12px 9px 32px",
                    background: "var(--bg-sub)",
                    border: "1px solid var(--border-rim)",
                    borderRadius: 4,
                    color: "var(--text-primary)",
                    fontFamily: fontUI,
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
            {/* Confirm password */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Confirm Password
              </label>
              <div style={{ position: "relative" }}>
                <Lock
                  size={15}
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                  }}
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  style={{
                    width: "100%",
                    padding: "9px 12px 9px 32px",
                    background: "var(--bg-sub)",
                    border: "1px solid var(--border-rim)",
                    borderRadius: 4,
                    color: "var(--text-primary)",
                    fontFamily: fontUI,
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {error && (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--color-red, #ef4444)",
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "transparent",
                  border: "1px solid var(--border-rim)",
                  borderRadius: 4,
                  color: "var(--text-muted)",
                  fontFamily: fontUI,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 2,
                  padding: "10px",
                  background: loading
                    ? "var(--border-rim)"
                    : "var(--accent-primary, #3b82f6)",
                  border: "none",
                  borderRadius: 4,
                  color: loading ? "var(--text-muted)" : "var(--text-primary)",
                  fontFamily: fontUI,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                {loading ? "Creating workspace\u2026" : "Create Workspace"}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div style={{ textAlign: "center" }}>
            <CheckCircle
              size={48}
              style={{
                color: "var(--color-green, #22c55e)",
                marginBottom: 16,
              }}
            />
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 8,
              }}
            >
              Workspace ready
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                marginBottom: 24,
              }}
            >
              Your institutional workspace has been provisioned.
              <br />
              You may now log in with your admin credentials.
            </div>
            <button
              onClick={() => router.push("/login")}
              style={{
                padding: "10px 24px",
                background: "var(--accent-primary, #3b82f6)",
                border: "none",
                borderRadius: 4,
                color: "var(--text-primary)",
                fontFamily: fontUI,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Go to Login <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Footer link */}
      {step !== 3 && (
        <div style={{ marginTop: 20, fontSize: 13, color: "var(--text-muted)" }}>
          Already have an account?{" "}
          <a
            href="/login"
            style={{
              color: "var(--accent-primary, #3b82f6)",
              textDecoration: "none",
            }}
          >
            Sign in
          </a>
        </div>
      )}
    </div>
  );
}
