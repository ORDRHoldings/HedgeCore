import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
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

    // Only allow http/https
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { reachable: false, error: "Only http/https URLs are supported" },
        { status: 400 },
      );
    }

    const start = Date.now();
    try {
      const response = await fetch(endpoint_url, {
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
