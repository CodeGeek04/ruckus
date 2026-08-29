// lib/games/hearsay/rounds.ts
import type { PlayerId } from '@/lib/types'

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Whole cycles only, so every player is accused the same number of times.
 * Re-shuffles a cycle if it would repeat the previous cycle's last player,
 * which is possible in principle and jarring in practice.
 */
export function buildAccusedOrder(playerIds: readonly PlayerId[], minRounds: number): PlayerId[] {
  const cycles = Math.max(1, Math.ceil(minRounds / playerIds.length))
  const order: PlayerId[] = []

  for (let c = 0; c < cycles; c++) {
    let cycle = shuffled(playerIds)
    if (playerIds.length > 1) {
      let guard = 0
      while (order.length > 0 && cycle[0] === order[order.length - 1] && guard < 50) {
        cycle = shuffled(playerIds)
        guard++
      }
    }
    order.push(...cycle)
  }

  return order
}
