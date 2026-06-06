/**
 * /docs — Scalar API Reference portal
 *
 * Serves a self-contained HTML page that loads the Scalar API docs UI via CDN
 * and points it at the backend's /openapi.json endpoint.
 *
 * Authentication guide, rate limit headers, and error code reference are
 * surfaced through the OpenAPI spec itself (tags, x-descriptions, etc.).
 */

import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const configuration = JSON.stringify({
    theme: "default",
    darkMode: true,
    metaData: {
      title: "ORDR Treasury API Reference",
      description:
        "Institutional FX hedge calculation and governance platform — REST API v1",
    },
    customCss: `
      :root {
        --scalar-font: 'IBM Plex Sans', sans-serif;
        --scalar-font-code: 'IBM Plex Mono', monospace;
        --scalar-background-1: #0f1117;
        --scalar-background-2: #161922;
        --scalar-background-3: #1d2130;
        --scalar-color-1: #e8eaf0;
        --scalar-color-2: #a0a8c0;
        --scalar-border-color: rgba(255, 255, 255, 0.08);
        --scalar-color-accent: #3b6fff;
      }
    `,
    authentication: {
      preferredSecurityScheme: "bearerAuth",
    },
    hideDownloadButton: false,
    tagsSorter: "alpha",
    operationsSorter: "alpha",
    defaultOpenAllTags: false,
  });

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>ORDR Treasury — API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="ORDR Treasury REST API v1 — Institutional FX hedge calculation and governance platform" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #0f1117; min-height: 100vh; }
    </style>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="${apiUrl}/openapi.json"
      data-configuration='${configuration}'
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
