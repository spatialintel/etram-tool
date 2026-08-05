import { defineConfig } from 'vitest/config'

// Pure logic + light component smoke tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})