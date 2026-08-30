// lib/games/telephone/chains.ts

/**
 * With N players there are N chains, one started by each player, and every
 * chain advances in every step. That is the whole point: nobody ever waits
 * their turn, because there is always exactly one chain per player to work on.
 *
 * The rotation is a single shift: at step s, player p works on chain (p + s).
 * Three properties fall out of that, and all three are load bearing:
 *
 *   - each step is a permutation, so every player acts exactly once per step
 *   - a player's chains over K steps are K consecutive indices, so they never
 *     touch the same chain twice as long as K <= N
 *   - each chain collects exactly one entry per step, from a different player
 *
 * The K <= N bound is why `stepCount` clamps to the player count rather than
 * always running the configured maximum.
 */

export function chainForPlayer(playerIndex: number, stepIndex: number, playerCount: number): number {
  return (playerIndex + stepIndex) % playerCount
}

export function playerForChain(chainIndex: number, stepIndex: number, playerCount: number): number {
  return (((chainIndex - stepIndex) % playerCount) + playerCount) % playerCount
}

/** Chain index per player, indexed by player. */
export function assignmentsForStep(stepIndex: number, playerCount: number): number[] {
  return Array.from({ length: playerCount }, (_, player) => chainForPlayer(player, stepIndex, playerCount))
}

/**
 * A chain must never come back to someone who already wrote in it, or they
 * would recognise their own sentence and the drift stops being funny. That
 * caps the game at one step per player.
 */
export function stepCount(playerCount: number, maxSteps: number): number {
  return Math.max(1, Math.min(maxSteps, playerCount))
}
