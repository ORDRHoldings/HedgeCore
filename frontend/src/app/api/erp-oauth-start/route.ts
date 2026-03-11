import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const system   = searchParams.get("system")    ?? "ERP";
  const clientId = searchParams.get("client_id") ?? "";

  const baseUrl     = req.nextUrl.origin;
  const callbackUrl = `${baseUrl}/erp-oauth-callback?system=${encodeURIComponent(system)}&client_id=${encodeURIComponent(clientId)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Authorizing ${system}\u2026</title>
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
      border-top: 2px solid #22d3ee;
      padding: 36px 32px;
      max-width: 440px;
      width: 100%;
    }
    .label   { font-size: 12px; letter-spacing: 0.1em; color: #64748b; margin-bottom: 14px; }
    .system  { font-size: 20px; font-weight: 700; color: #22d3ee; margin-bottom: 10px; }
    .msg     { font-size: 12px; color: #94a3b8; margin-bottom: 28px; line-height: 1.6; }
    .spinner {
      width: 20px; height: 20px;
      border: 2px solid #1e293b;
      border-top-color: #22d3ee;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status { font-size: 12px; color: #22d3ee; text-align: center; letter-spacing: 0.06em; }
  </style>
</head>
<body>
  <div class="card">
    <div class="label">ORDR TERMINAL \u00b7 OAUTH 2.0 AUTHORIZATION</div>
    <div class="system">${system}</div>
    <div class="msg">
      Simulating vendor authorization consent. In production, this page is hosted by
      the ERP vendor and requires your corporate credentials to grant ORDR read access.
    </div>
    <div class="spinner"></div>
    <div class="status">AUTHORIZING\u2026</div>
  </div>
  <script>
    setTimeout(function () {
      window.location.href = ${JSON.stringify(callbackUrl)};
    }, 1500);
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status:  200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
