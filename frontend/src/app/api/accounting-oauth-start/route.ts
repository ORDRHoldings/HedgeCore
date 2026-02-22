import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// Keyed by lowercase system ID (matches what the page sends)
const SYSTEM_META: Record<string, { displayName: string; color: string }> = {
  quickbooks: { displayName: "QuickBooks Online", color: "#2CA01C" },
  xero:       { displayName: "Xero",              color: "#13B5EA" },
  sage:       { displayName: "Sage Intacct",       color: "#00DC82" },
  netsuite:   { displayName: "NetSuite",           color: "#E6A817" },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const systemId = (searchParams.get("system") ?? "quickbooks").toLowerCase();

  const meta        = SYSTEM_META[systemId] ?? { displayName: systemId, color: "#22d3ee" };
  const displayName = meta.displayName;
  const color       = meta.color;

  const baseUrl     = req.nextUrl.origin;
  const callbackUrl = `${baseUrl}/accounting-oauth-callback?system=${encodeURIComponent(systemId)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Connect ${displayName}\u2026</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0e14;
      color: #e2e8f0;
      font-family: 'IBM Plex Mono', monospace;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #111827;
      border: 1px solid #1e293b;
      border-top: 2px solid ${color};
      padding: 36px 32px;
      max-width: 440px;
      width: 100%;
    }
    .label   { font-size: 9px; letter-spacing: 0.1em; color: #64748b; margin-bottom: 14px; }
    .system  { font-size: 20px; font-weight: 700; color: ${color}; margin-bottom: 10px; }
    .msg     { font-size: 11px; color: #94a3b8; margin-bottom: 28px; line-height: 1.6; }
    .spinner {
      width: 20px; height: 20px;
      border: 2px solid #1e293b;
      border-top-color: ${color};
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status { font-size: 10px; color: ${color}; text-align: center; letter-spacing: 0.06em; }
  </style>
</head>
<body>
  <div class="card">
    <div class="label">ORDR TERMINAL \u00b7 ACCOUNTING CONNECTION</div>
    <div class="system">${displayName}</div>
    <div class="msg">
      Connecting to your ${displayName} account. In production, this redirects to the
      ${displayName} OAuth consent page where you grant ORDR read access to your accounting data.
    </div>
    <div class="spinner"></div>
    <div class="status">CONNECTING\u2026</div>
  </div>
  <script>
    setTimeout(function () {
      window.location.href = ${JSON.stringify(callbackUrl)};
    }, 1800);
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status:  200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
