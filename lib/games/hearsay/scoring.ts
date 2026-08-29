// lib/games/hearsay/scoring.ts
import type { PlayerId } from '@/lib/types'
import type { HearsayConfig, Round } from './state'

/**
 * Everyone tied at the top counts. A flat spread means the room had no
 * consensus, so nobody was wrong. Note this is consensus, not truth:
 * the game has no ground truth and the UI must never call it correct.
 */
export function topVoted(votes: Record<PlayerId, PlayerId>): PlayerId[] {
  const counts = new Map<PlayerId, number>()
  for (const target of Object.values(votes)) {
    counts.set(target, (counts.get(target) ?? 0) + 1)
  }
  if (counts.size === 0) return []

  const max = Math.max(...counts.values())
  return [...counts.entries()].filter(([, n]) => n === max).map(([id]) => id)
}

export function voteCounts(votes: Record<PlayerId, PlayerId>): Record<PlayerId, number> {
  const counts: Record<PlayerId, number> = {}
  for (const target of Object.values(votes)) {
    counts[target] = (counts[target] ?? 0) + 1
  }
  return counts
}

export function scoreRound(round: Round, config: HearsayConfig): Record<PlayerId, number> {
  const { accusedCorrect, readTheRoom, readTheRoomRequiresAccusedCorrect } = config.scoring
  const awarded: Record<PlayerId, number> = {}

  const gotItRight = round.accusedPick !== null && round.accusedPick === round.question.id
  if (gotItRight) awarded[round.accusedId] = accusedCorrect

  const roomScores = readTheRoom > 0 && (gotItRight || !readTheRoomRequiresAccusedCorrect)
  if (!roomScores) return awarded

  const top = topVoted(round.votes)
  for (const [voterId, targetId] of Object.entries(round.votes)) {
    if (top.includes(targetId)) {
      awarded[voterId] = (awarded[voterId] ?? 0) + readTheRoom
    }
  }

  return awarded
}
