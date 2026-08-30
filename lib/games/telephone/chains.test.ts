import { describe, expect, it } from 'vitest'
import { assignmentsForStep, chainForPlayer, playerForChain, stepCount } from './chains'

const sizes = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

describe('stepCount', () => {
  it('caps at the configured maximum for a big group', () => {
    expect(stepCount(10, 6)).toBe(6)
    expect(stepCount(12, 6)).toBe(6)
  })

  it('shortens for a small group, because a chain cannot revisit a player', () => {
    expect(stepCount(4, 6)).toBe(4)
    expect(stepCount(3, 6)).toBe(3)
  })

  it('never exceeds the player count', () => {
    for (const n of sizes) expect(stepCount(n, 6)).toBeLessThanOrEqual(n)
  })
})

describe('assignmentsForStep', () => {
  it('gives every player exactly one chain, so nobody is ever idle', () => {
    for (const n of sizes) {
      for (let step = 0; step < n; step++) {
        const assignment = assignmentsForStep(step, n)
        expect(assignment).toHaveLength(n)
        // A permutation: every chain is covered exactly once.
        expect([...assignment].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i))
      }
    }
  })

  it('starts each player on their own chain', () => {
    expect(assignmentsForStep(0, 5)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('chainForPlayer and playerForChain', () => {
  it('are inverses of one another', () => {
    for (const n of sizes) {
      for (let step = 0; step < n; step++) {
        for (let player = 0; player < n; player++) {
          const chain = chainForPlayer(player, step, n)
          expect(playerForChain(chain, step, n)).toBe(player)
        }
      }
    }
  })
})

describe('the rotation across a whole game', () => {
  it('never lets a player touch the same chain twice', () => {
    for (const n of sizes) {
      const steps = stepCount(n, 6)
      for (let player = 0; player < n; player++) {
        const touched = Array.from({ length: steps }, (_, step) => chainForPlayer(player, step, n))
        expect(new Set(touched).size).toBe(steps)
      }
    }
  })

  it('gives every chain exactly one entry per step, from a different player each time', () => {
    for (const n of sizes) {
      const steps = stepCount(n, 6)
      for (let chain = 0; chain < n; chain++) {
        const contributors = Array.from({ length: steps }, (_, step) => playerForChain(chain, step, n))
        expect(contributors).toHaveLength(steps)
        expect(new Set(contributors).size).toBe(steps)
      }
    }
  })

  it('has every player act exactly once in every step', () => {
    for (const n of sizes) {
      const steps = stepCount(n, 6)
      for (let step = 0; step < steps; step++) {
        const acted = Array.from({ length: n }, (_, player) => chainForPlayer(player, step, n))
        expect(new Set(acted).size).toBe(n)
      }
    }
  })

  it('never hands a player a chain they already contributed to earlier in that chain', () => {
    // The same property seen from the chain's side: a chain's contributor list
    // and a player's chain list must agree, with no repeats on either axis.
    for (const n of sizes) {
      const steps = stepCount(n, 6)
      const seen = new Set<string>()
      for (let step = 0; step < steps; step++) {
        for (let player = 0; player < n; player++) {
          const key = `${player}:${chainForPlayer(player, step, n)}`
          expect(seen.has(key)).toBe(false)
          seen.add(key)
        }
      }
      expect(seen.size).toBe(n * steps)
    }
  })
})
