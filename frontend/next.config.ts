import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-side rewrites untuk proxy REST API ke backend Go di Fly.io / GCP / lokal
  async rewrites() {
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8080';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${backendUrl}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
