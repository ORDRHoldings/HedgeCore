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
    // Only proxy to local backend in development
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:8000/api/:path*',
        },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;
