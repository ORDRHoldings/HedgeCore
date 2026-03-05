import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      "https://hedgecore.onrender.com/api";

    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/:path*`,
      },
    ];
  },

  // Allow images from Render backend
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "hedgecore.onrender.com",
      },
    ],
  },
};

export default nextConfig;
