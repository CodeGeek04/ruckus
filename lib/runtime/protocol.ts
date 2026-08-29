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

/** Host to one phone, on that phone's private channel. */
export type ToPlayer =
  | { t: 'accepted'; player: Player }
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
