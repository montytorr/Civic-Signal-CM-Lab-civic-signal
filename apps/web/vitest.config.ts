import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    // The Postgres suites hash passwords (argon2) and create and drop databases in parallel files.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './app'),
      '@civicsignal/ui': resolve(__dirname, '../../packages/ui/src'),
      '@civicsignal/crypto': resolve(__dirname, '../../packages/crypto/src'),
      '@civicsignal/db': resolve(__dirname, '../../packages/db/src'),
    },
  },
})
