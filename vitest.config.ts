import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Without this, vitest resolves @/lib/* but throws on @/components/*.tsx,
    // which made every React component in the repo untestable.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    // The live playthrough talks to AppSync. It runs from its own config.
    exclude: ['lib/**/*.network.test.ts'],
  },
})
