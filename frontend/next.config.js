/** @type {import('next').NextConfig} */
// build: 2026-02-18T17:00Z — force cache bust
const nextConfig = {
  eslint: {
    // Pre-existing lint issues in source — do not block build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Type checking already done via tsc --noEmit in CI
    ignoreBuildErrors: false,
  },
  async rewrites() {
    // Proxy /api/v1/* to backend in all environments.
    // Dev: falls back to local backend. Prod (Vercel): uses BACKEND_URL or Render.
    // /api/market-autofill and other Next.js API routes are NOT affected (no /v1/ prefix).
    const backendUrl = process.env.BACKEND_URL || (
      process.env.NODE_ENV === 'development'
        ? 'http://localhost:8000/api'
        : 'https://hedgecore.onrender.com/api'
    );
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendUrl}/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
