// lib/testing/networkSetup.ts
// Vitest setup for the live-network playthrough. Runs before the test file's
// imports, which matters: lib/bus/client.ts reads its endpoints at module load.
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const at = line.indexOf('=')
  if (at < 0) continue
  const key = line.slice(0, at).trim()
  if (!key || key.startsWith('#')) continue
  // Strip surrounding quotes: vercel link rewrites .env.local with quoted
  // values, and a hostname containing a literal quote fails silently.
  process.env[key] ??= line
    .slice(at + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2')
}

/**
 * hostRuntime and playerClient both persist to localStorage. Node has none by
 * default, and a single shared one would hand all four simulated phones the
 * same saved identity, so this shim deliberately forgets everything.
 */
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    length: 0,
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
  },
})
