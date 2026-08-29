import { describe, expect, it } from 'vitest'
import type { Player } from '@/lib/types'
import { initHearsay, reduceHearsay } from './reduce'
import { hearsayHostView, hearsayPlayerView } from './views'

const players: Player[] = [
  { id: 'sam', name: 'Sam', color: '#ef4444', connected: true },
  { id: 'mike', name: 'Mike', color: '#22c55e', connected: true },
  { id: 'ron', name: 'Ron', color: '#3b82f6', connected: true },
  { id: 'emily', name: 'Emily', color: '#eab308', connected: true },
]

function stateWithAccused(accused: string) {
  const base = initHearsay(players)
  return {
    ...base,
    order: base.order.map(() => accused),
    rounds: [{ ...base.rounds[0], accusedId: accused }],
  }
}

describe('hearsayHostView', () => {
  it('never leaks the question before the verdict', () => {
    let state = stateWithAccused('sam')
    for (const phase of ['charge', 'testimony', 'evidence', 'guess'] as const) {
      expect(state.phase).toBe(phase)
      expect(hearsayHostView(state).question).toBeNull()
      state = reduceHearsay(state, { type: 'deadline' }).state
    }
  })

  it('reveals the question at the verdict', () => {
    let state = stateWithAccused('sam')
    for (let i = 0; i < 4; i++) state = reduceHearsay(state, { type: 'deadline' }).state
    expect(state.phase).toBe('verdict')
    expect(hearsayHostView(state).question).toContain('Sam')
  })

  it('hides who cast each vote during evidence', () => {
    let state = stateWithAccused('sam')
    state = reduceHearsay(state, { type: 'deadline' }).state
    state = reduceHearsay(state, { type: 'input', playerId: 'mike', payload: { kind: 'vote', targetId: 'ron' } }).state
    state = reduceHearsay(state, { type: 'deadline' }).state
    expect(state.phase).toBe('evidence')

    const view = hearsayHostView(state)
    expect(view.voteCounts.ron).toBe(1)
    expect(view.voters).toBeNull()
  })

  it('attaches faces to votes at the verdict', () => {
    let state = stateWithAccused('sam')
    state = reduceHearsay(state, { type: 'deadline' }).state
    state = reduceHearsay(state, { type: 'input', playerId: 'mike', payload: { kind: 'vote', targetId: 'ron' } }).state
    for (let i = 0; i < 3; i++) state = reduceHearsay(state, { type: 'deadline' }).state
    expect(state.phase).toBe('verdict')
    expect(hearsayHostView(state).voters).toEqual({ mike: 'ron' })
  })
})

describe('hearsayPlayerView', () => {
  it('shows the charge to voters', () => {
    const state = stateWithAccused('sam')
    expect(hearsayPlayerView(state, 'mike').charge).toContain('Sam')
  })

  it('never shows the charge to the accused', () => {
    const state = stateWithAccused('sam')
    expect(hearsayPlayerView(state, 'sam').charge).toBeNull()
  })

  it('gives the accused their three options only in the guess phase', () => {
    let state = stateWithAccused('sam')
    expect(hearsayPlayerView(state, 'sam').options).toBeNull()
    for (let i = 0; i < 3; i++) state = reduceHearsay(state, { type: 'deadline' }).state
    expect(state.phase).toBe('guess')
    expect(hearsayPlayerView(state, 'sam').options).toHaveLength(3)
  })

  it('never gives the options to a voter', () => {
    let state = stateWithAccused('sam')
    for (let i = 0; i < 3; i++) state = reduceHearsay(state, { type: 'deadline' }).state
    expect(hearsayPlayerView(state, 'mike').options).toBeNull()
  })

  it('tells each player what action they owe right now', () => {
    let state = stateWithAccused('sam')
    expect(hearsayPlayerView(state, 'sam').action).toBe('wait')
    expect(hearsayPlayerView(state, 'mike').action).toBe('wait')

    state = reduceHearsay(state, { type: 'deadline' }).state
    expect(hearsayPlayerView(state, 'mike').action).toBe('vote')
    expect(hearsayPlayerView(state, 'sam').action).toBe('wait')

    state = reduceHearsay(state, { type: 'deadline' }).state
    state = reduceHearsay(state, { type: 'deadline' }).state
    expect(hearsayPlayerView(state, 'sam').action).toBe('guess')
    expect(hearsayPlayerView(state, 'mike').action).toBe('predict')
  })
})
