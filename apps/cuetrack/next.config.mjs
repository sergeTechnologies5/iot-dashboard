const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8081';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for the Docker image.
  output: 'standalone',
  // Allow phones/other devices on the LAN to load the dev server via this IP.
  allowedDevOrigins: ['10.76.222.205'],
  // Proxy API + realtime through Next so browsers on other devices never hit localhost:8081.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
      { source: '/ws/:path*', destination: `${BACKEND_URL}/ws/:path*` },
    ];
  },
};

export default nextConfig;
