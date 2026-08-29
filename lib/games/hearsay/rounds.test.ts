import { describe, expect, it } from 'vitest'
import { buildAccusedOrder } from './rounds'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`)

describe('buildAccusedOrder', () => {
  it('runs whole cycles so everyone is accused an equal number of times', () => {
    const order = buildAccusedOrder(ids(4), 8)
    expect(order).toHaveLength(8)
    for (const id of ids(4)) {
      expect(order.filter((x) => x === id)).toHaveLength(2)
    }
  })

  it('rounds up to a whole cycle rather than cutting someone out', () => {
    // 6 players, minimum 8 rounds: two full cycles of 6, not 8 rounds.
    const order = buildAccusedOrder(ids(6), 8)
    expect(order).toHaveLength(12)
    for (const id of ids(6)) {
      expect(order.filter((x) => x === id)).toHaveLength(2)
    }
  })

  it('uses a single cycle when the group is already big enough', () => {
    const order = buildAccusedOrder(ids(9), 8)
    expect(order).toHaveLength(9)
    for (const id of ids(9)) {
      expect(order.filter((x) => x === id)).toHaveLength(1)
    }
  })

  it('never accuses the same player twice in a row', () => {
    for (let run = 0; run < 200; run++) {
      const order = buildAccusedOrder(ids(4), 8)
      for (let i = 1; i < order.length; i++) {
        expect(order[i]).not.toBe(order[i - 1])
      }
    }
  })

  it('contains every player even with the minimum group size', () => {
    const order = buildAccusedOrder(ids(4), 8)
    expect(new Set(order).size).toBe(4)
  })
})
