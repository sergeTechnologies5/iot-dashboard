/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for the Docker image.
  output: 'standalone',
  // Allow phones on the LAN to load the dev server via this IP.
  allowedDevOrigins: ['10.76.222.205'],
  // Proxy public API so phones never talk to the backend directly.
  async rewrites() {
    const backend = process.env.BACKEND_URL || 'http://localhost:8081';
    return [
      { source: '/papi/:path*', destination: `${backend}/api/v1/public/:path*` },
      // The table QR is UPPERCASE (smaller code), so /P/REF must land on the /p/[ref] page.
      { source: '/P/:ref', destination: '/p/:ref' },
    ];
  },
};

export default nextConfig;
