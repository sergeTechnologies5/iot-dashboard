const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8081';

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/company',
  // Self-contained server bundle for the Docker image.
  output: 'standalone',
  // Same-origin API/WebSocket proxy (local dev). In prod Caddy routes /api and /ws before they reach Next.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*`, basePath: false },
      { source: '/ws/:path*', destination: `${BACKEND_URL}/ws/:path*`, basePath: false },
    ];
  },
};

export default nextConfig;
