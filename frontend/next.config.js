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
      { source: "/execution-desk", destination: "/hedge-desk", permanent: false },
      { source: "/currency-fx", destination: "/fx-market", permanent: false },
      { source: "/hedges", destination: "/position-desk", permanent: false },
    ];
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
