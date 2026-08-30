import { redirect } from 'next/navigation'
import { CODE_ALPHABET } from '@/lib/ids'

/**
 * Shareable join links: /join?code=abcd
 *
 * Exists so a code can be pasted into Discord and tapped. It normalises what
 * people actually paste (lower case, stray spaces, a full URL someone copied
 * out of the address bar) and then hands off to the real room page, so there is
 * only ever one place that runs a game.
 *
 * A bad code goes to the landing page rather than a dead room, because a phone
 * that lands on a room nobody is hosting looks identical to a broken game.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>
}) {
  const raw = (await searchParams).code
  const first = Array.isArray(raw) ? raw[0] : raw

  const code = (first ?? '')
    .trim()
    .toUpperCase()
    // Tolerate a pasted URL or a code with punctuation around it.
    .replace(/[^A-Z0-9]/g, '')
    .slice(-4)

  const valid = code.length === 4 && [...code].every((ch) => CODE_ALPHABET.includes(ch))

  redirect(valid ? `/play/${code}` : '/')
}
