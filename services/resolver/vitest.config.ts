import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Database tests share TEST_DATABASE_URL; run files one at a time.
    fileParallelism: false,
  },
})
