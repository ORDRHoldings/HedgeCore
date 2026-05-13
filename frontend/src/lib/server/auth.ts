import { NextRequest, NextResponse } from "next/server";

const BACKEND_API_BASE =
  process.env.BACKEND_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.VERCEL ? "https://hedgecore.onrender.com/api" : "http://localhost:8000/api");

export type VerifiedBearer = {
  authHeader: string;
  user: unknown;
};

export async function requireVerifiedBearer(req: NextRequest): Promise<
  | { ok: true; value: VerifiedBearer }
  | { ok: false; response: NextResponse }
> {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "authentication_required", detail: "Authorization: Bearer <token> header required" },
        { status: 401 },
      ),
    };
  }

  try {
    const res = await fetch(`${BACKEND_API_BASE}/auth/me`, {
      headers: { Authorization: authHeader },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "authentication_invalid", detail: "Bearer token could not be verified" },
          { status: 401 },
        ),
      };
    }
    return { ok: true, value: { authHeader, user: await res.json().catch(() => null) } };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "authentication_unavailable", detail: "Authentication service unavailable" },
        { status: 503 },
      ),
    };
  }
}
