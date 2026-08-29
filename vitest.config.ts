import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    // The live playthrough talks to AppSync. It runs from its own config.
    exclude: ['lib/**/*.network.test.ts'],
  },
})
