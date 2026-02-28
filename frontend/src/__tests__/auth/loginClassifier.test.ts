/**
 * loginClassifier.test.ts
 *
 * Unit tests for the classifyError() function exported from the login page.
 * Verifies all 4 ErrKind classifications against representative backend strings.
 *
 * Run: npx jest --testPathPattern=loginClassifier
 */

import { classifyError } from "../../lib/auth/loginClassifier";

describe("classifyError()", () => {
  // ── warmup ─────────────────────────────────────────────────────────────────
  describe("warmup classification", () => {
    it('classifies "waking" string as warmup', () => {
      expect(classifyError("Server is waking up")).toBe("warmup");
    });
    it('classifies "cold" string as warmup', () => {
      expect(classifyError("Cold start detected")).toBe("warmup");
    });
    it('classifies "sleep" string as warmup', () => {
      expect(classifyError("Service woke from sleep")).toBe("warmup");
    });
    it('classifies "moment" string as warmup', () => {
      expect(classifyError("Please wait a moment")).toBe("warmup");
    });
    it("is case-insensitive for warmup", () => {
      expect(classifyError("WAKING SERVER")).toBe("warmup");
    });
  });

  // ── rate ───────────────────────────────────────────────────────────────────
  describe("rate classification", () => {
    it('classifies "rate limited" as rate', () => {
      expect(classifyError("rate limited")).toBe("rate");
    });
    it('classifies "429" status string as rate', () => {
      expect(classifyError("HTTP 429 error")).toBe("rate");
    });
    it('classifies "too many" as rate', () => {
      expect(classifyError("Too many requests")).toBe("rate");
    });
    it("is case-insensitive for rate", () => {
      expect(classifyError("RATE LIMIT EXCEEDED")).toBe("rate");
    });
  });

  // ── auth ───────────────────────────────────────────────────────────────────
  describe("auth classification", () => {
    it('classifies "authentication" as auth', () => {
      expect(classifyError("Authentication failed")).toBe("auth");
    });
    it('classifies "invalid" as auth', () => {
      expect(classifyError("Invalid username or password")).toBe("auth");
    });
    it('classifies "credentials" as auth', () => {
      expect(classifyError("Invalid credentials provided")).toBe("auth");
    });
    it('classifies "unauthorized" as auth', () => {
      expect(classifyError("Unauthorized access")).toBe("auth");
    });
    it("is case-insensitive for auth", () => {
      expect(classifyError("INVALID CREDENTIALS")).toBe("auth");
    });
  });

  // ── server (fallback) ──────────────────────────────────────────────────────
  describe("server classification (fallback)", () => {
    it("classifies unknown error strings as server", () => {
      expect(classifyError("Internal server error")).toBe("server");
    });
    it("classifies empty string as server", () => {
      expect(classifyError("")).toBe("server");
    });
    it("classifies network errors as server", () => {
      expect(classifyError("Network request failed")).toBe("server");
    });
    it("classifies 500 errors as server", () => {
      expect(classifyError("500 Internal Server Error")).toBe("server");
    });
  });

  // ── priority — warmup beats auth ──────────────────────────────────────────
  describe("classification priority", () => {
    it("warmup takes priority over auth when both keywords present", () => {
      // Backend sometimes sends "waking" in an auth-related message
      expect(classifyError("Authentication failed — server waking")).toBe("warmup");
    });
    it("rate takes priority over server", () => {
      expect(classifyError("rate limit hit due to server error")).toBe("rate");
    });
  });
});
