// lib/runtime/protocol.ts
import type { Player, PlayerId } from '@/lib/types'

/** Phone to host, on the public channel. */
export type ToHost =
  | { t: 'join'; playerId: PlayerId; name: string }
  | { t: 'rejoin'; playerId: PlayerId }
  | { t: 'input'; playerId: PlayerId; payload: unknown }

/** Host to everyone, on the public channel. */
export type ToRoom =
  | { t: 'lobby'; players: Player[]; code: string }
  | { t: 'host'; gameId: string; view: unknown; deadline: number | null }
  | { t: 'ended' }
  /** Heartbeat. Phones use its absence to detect that the host tab is gone. */
  | { t: 'ping' }
  /** Sent on a clean host teardown, so phones do not wait for the timeout. */
  | { t: 'gone' }

/** How often the host announces it is still alive, and how long a phone waits
 * before declaring it gone. The gap is generous because a publish round trip
 * over a phone network can stall for a few seconds without anything being wrong. */
export const HEARTBEAT_MS = 3000
export const HOST_TIMEOUT_MS = 11000

/** Host to one phone, on that phone's private channel. */
export type ToPlayer =
  | { t: 'accepted'; player: Player }
  /** Turned up after the game started. The phone shows why rather than hanging. */
  | { t: 'rejected'; reason: string }
  | { t: 'you'; gameId: string; view: unknown; deadline: number | null }

/**
 * Reads the `phase` field every game view carries, without knowing the game.
 * The runtime never clears a deadline, so the pages use this to hide the
 * countdown once a game has ended.
 */
export function viewPhase(view: unknown): string | null {
  if (!view || typeof view !== 'object') return null
  const phase = (view as { phase?: unknown }).phase
  return typeof phase === 'string' ? phase : null
}
