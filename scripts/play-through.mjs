// scripts/play-through.mjs
//
// Plays a complete headless game of Hearsay against the REAL AppSync Events
// bus: one host and four players, no browser. Run it before four humans sit
// down in a Discord call.
//
//   node scripts/play-through.mjs
//
// The game itself lives in lib/integration.network.test.ts, because the host
// side has to import the actual TypeScript reducer and views rather than a
// reimplementation of them. This launcher is the front door: it runs that one
// file through vitest with the network config, which is kept separate so that
// `npm test` never touches the network.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', '--config', 'vitest.network.config.ts'],
  { cwd: root, stdio: 'inherit', env: process.env }
)

child.on('exit', (code) => {
  if (code !== 0) console.error('PLAYTHROUGH FAIL: see the output above')
  process.exit(code ?? 1)
})
