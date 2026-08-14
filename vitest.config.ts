import { defineConfig } from 'vitest/config'

/** Root test configuration for Desktop source, staging, site, and workflow checks. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.snapshot.ts'],
  },
})
