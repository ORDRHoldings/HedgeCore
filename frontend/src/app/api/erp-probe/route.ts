import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";
import { requireVerifiedBearer } from "@/lib/server/auth";

export const runtime = "nodejs";

const ALLOWED_HOSTS = (process.env.ERP_PROBE_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

function hostMatchesAllowedList(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => {
    if (allowed.startsWith("*.")) {
      return normalized.endsWith(allowed.slice(1));
    }
    return normalized === allowed;
  });
}

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isBlockedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (["localhost", "localhost.localdomain"].includes(normalized)) return true;
  if (normalized.endsWith(".local") || normalized.endsWith(".internal")) return true;
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isPrivateIPv4(normalized);
  if (ipVersion === 6) {
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80");
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireVerifiedBearer(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { endpoint_url } = body as { endpoint_url?: string; auth_method?: string };

    if (!endpoint_url) {
      return NextResponse.json(
        { reachable: false, error: "endpoint_url is required" },
        { status: 400 },
      );
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(endpoint_url);
    } catch {
      return NextResponse.json(
        { reachable: false, error: "Invalid URL format" },
        { status: 400 },
      );
    }

    if (parsedUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { reachable: false, error: "Only https URLs are supported in production" },
        { status: 400 },
      );
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { reachable: false, error: "Only http/https URLs are supported" },
        { status: 400 },
      );
    }

    if (isBlockedHost(parsedUrl.hostname)) {
      return NextResponse.json(
        { reachable: false, error: "Private, local, and internal hosts cannot be probed" },
        { status: 400 },
      );
    }

    if (process.env.NODE_ENV === "production" && ALLOWED_HOSTS.length === 0) {
      return NextResponse.json(
        { reachable: false, error: "ERP probe host allowlist is not configured" },
        { status: 403 },
      );
    }

    if (ALLOWED_HOSTS.length > 0 && !hostMatchesAllowedList(parsedUrl.hostname)) {
      return NextResponse.json(
        { reachable: false, error: "Host is not allowed for ERP probe" },
        { status: 403 },
      );
    }

    const start = Date.now();
    try {
      const response = await fetch(parsedUrl.toString(), {
        method: "HEAD",
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent": "ORDR-Terminal/1.0 (connectivity-probe)",
        },
      });
      const latency_ms = Date.now() - start;

      return NextResponse.json({
        reachable: true,
        status_code: response.status,
        latency_ms,
      });
    } catch (err: unknown) {
      const latency_ms = Date.now() - start;
      const message = err instanceof Error ? err.message : "Connection failed";
      const isTimeout =
        message.toLowerCase().includes("timeout") ||
        message.toLowerCase().includes("abort");

      return NextResponse.json({
        reachable: false,
        latency_ms,
        error: isTimeout ? "Connection timed out after 8s" : message,
      });
    }
  } catch {
    return NextResponse.json(
      { reachable: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
