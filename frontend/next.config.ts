import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Forward /api/v1/* requests to the Node.js backend in development.
  // In production, set NEXT_PUBLIC_API_URL to point at your deployed backend.
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/:path*`,
      },
    ]
  },
  images: {
    domains: ['graph.facebook.com'],
  },
}

export default nextConfig
