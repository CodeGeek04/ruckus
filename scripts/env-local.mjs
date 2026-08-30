// Shared .env.local reader for Node scripts.
//
// Values may be quoted: `vercel link` and `vercel env pull` rewrite this file
// and wrap every value in double quotes. Next.js strips them itself, so the app
// never noticed, but naive parsers put literal quote characters inside
// hostnames and API keys, which fails in confusing ways (a WebSocket that
// connects and then never delivers, a fetch that reports only "fetch failed").
import { readFileSync } from 'node:fs'

export function readEnvLocal(path = '.env.local') {
  const env = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf('=')
    if (at === -1) continue
    // Split on the FIRST '=' only: values are JWTs and URLs that contain more.
    env[trimmed.slice(0, at).trim()] = trimmed
      .slice(at + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2')
  }
  return env
}
