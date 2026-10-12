import type { NextConfig } from 'next'
import { resolve } from 'path'

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  transpilePackages: ['@civicsignal/ui', '@civicsignal/db', '@civicsignal/crypto'],
  // Native and Node-only server dependencies: required at runtime, not bundled.
  serverExternalPackages: ['pg', '@node-rs/argon2'],
  async redirects() {
    return [
      {
        source: '/login',
        destination: '/auth/signin',
        permanent: false,
      },
      {
        source: '/signin',
        destination: '/auth/signin',
        permanent: false,
      },
      {
        source: '/auth/login',
        destination: '/auth/signin',
        permanent: false,
      },
      {
        source: '/auth/sign-in',
        destination: '/auth/signin',
        permanent: false,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default config
