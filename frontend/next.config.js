/** @type {import('next').NextConfig} */
// build: 2026-02-18T17:00Z — force cache bust
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    // Type checking already done via tsc --noEmit in CI
    ignoreBuildErrors: false,
  },
  async redirects() {
    return [
      { source: "/execution-desk", destination: "/hedge-desk", permanent: true },
      { source: "/currency-fx", destination: "/market-intelligence", permanent: true },
      { source: "/hedges", destination: "/position-desk", permanent: true },
      { source: "/input", destination: "/position-desk", permanent: true },
      { source: "/upload-csv", destination: "/position-desk", permanent: true },
      { source: "/calculate", destination: "/hedge-desk", permanent: true },
      { source: "/policy-desk", destination: "/policies", permanent: true },
      { source: "/saved-policies", destination: "/policies", permanent: true },
      { source: "/policy-dashboard", destination: "/policies", permanent: true },
      { source: "/execution", destination: "/hedge-desk", permanent: true },
      { source: "/decision-desk", destination: "/hedge-desk", permanent: true },
      { source: "/fx-market", destination: "/market-intelligence", permanent: true },
      { source: "/market-overview", destination: "/market-intelligence", permanent: true },
      { source: "/execution-history", destination: "/trade-history", permanent: true },
      { source: "/access-control", destination: "/settings", permanent: true },
    ];
  },
  async headers() {
    return [{
      source: "/market-intelligence",
      headers: [{
        key: "Content-Security-Policy",
        value: "frame-src 'self' https://s.tradingview.com https://www.tradingview.com",
      }],
    }];
  },
  async rewrites() {
    // DEV ONLY: proxy /api/v1/* to local backend.
    // In production the frontend API client calls Render directly (see api/client.ts).
    // Vercel rewrites do not reliably forward POST bodies to external origins.
    if (process.env.NODE_ENV !== 'development') return [];
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000/api';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendUrl}/v1/:path*`,
      },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
