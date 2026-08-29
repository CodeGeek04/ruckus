import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * The live playthrough only. It opens real WebSockets to AppSync Events and
 * plays a whole game, so it is kept out of `npm test` and run on purpose with
 * `node scripts/play-through.mjs`.
 */
export default defineConfig({
  // Spelled out rather than inherited from tsconfig: this config is loaded on
  // its own and does not pick the `@/*` path mapping up by itself.
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '') },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.network.test.ts'],
    setupFiles: ['lib/testing/networkSetup.ts'],
    testTimeout: 600_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    // The playthrough's whole point is its printed trace, so let it through
    // to stdout instead of having vitest buffer and reformat it.
    disableConsoleIntercept: true,
    printConsoleTrace: false,
  },
})
