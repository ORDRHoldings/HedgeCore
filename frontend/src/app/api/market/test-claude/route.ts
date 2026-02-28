/**
 * GET /api/market/test-claude
 * Diagnostic endpoint — tests Anthropic API connectivity and key validity.
 * DELETE THIS FILE after debugging is complete.
 */

import { NextResponse } from "next/server";

const ANT_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODELS  = ["claude-haiku-4-5-20251001", "claude-3-5-haiku-20241022", "claude-3-haiku-20240307"];

export async function GET() {
  if (!ANT_KEY) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not set", key_present: false });
  }

  const results: Record<string, unknown> = {
    key_present: true,
    key_prefix:  ANT_KEY.slice(0, 10) + "...",
  };

  for (const model of MODELS) {
    try {
      const t0  = Date.now();
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:  "POST",
        headers: {
          "x-api-key":         ANT_KEY,
          "anthropic-version": "2023-06-01",
          "content-type":      "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 50,
          messages: [{ role: "user", content: 'Reply with the single word: WORKING' }],
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const duration_ms = Date.now() - t0;
      const body        = await res.text();

      if (res.ok) {
        const json   = JSON.parse(body) as { content?: Array<{ type: string; text: string }> };
        const text   = json.content?.find((c) => c.type === "text")?.text ?? "";
        results[model] = { ok: true, duration_ms, response: text.trim() };
        break; // found a working model
      } else {
        results[model] = { ok: false, http_status: res.status, error_body: body.slice(0, 400), duration_ms };
      }
    } catch (err) {
      results[model] = { ok: false, exception: String(err) };
    }
  }

  return NextResponse.json(results);
}
