import { describe, expect, it } from 'vitest'
import type { Player } from '@/lib/types'
import { chainForPlayer } from './chains'
import { initTelephone, reduceTelephone } from './reduce'
import { DEFAULT_CONFIG, PLACEHOLDER_IMAGE, type TelephoneState } from './state'

const players: Player[] = [
  { id: 'sam', name: 'Sam', color: '#ef4444', connected: true },
  { id: 'mike', name: 'Mike', color: '#22c55e', connected: true },
  { id: 'ron', name: 'Ron', color: '#3b82f6', connected: true },
  { id: 'emily', name: 'Emily', color: '#eab308', connected: true },
]

const ids = players.map((p) => p.id)
const url = (n: number) => `https://abc123.public.blob.vercel-storage.com/telephone/${n}.jpg`

function submitAll(state: TelephoneState, prefix = 'a'): TelephoneState {
  return ids.reduce(
    (acc, id, i) => reduceTelephone(acc, { type: 'input', playerId: id, payload: { kind: 'submit', text: `${prefix}${i}` } }).state,
    state
  )
}

/** The slot a player is working on this step, as the view hands it to them. */
function slotFor(state: TelephoneState, playerIndex: number): string {
  return `${chainForPlayer(playerIndex, state.stepIndex, ids.length)}:${state.stepIndex}`
}

function drawAll(state: TelephoneState): TelephoneState {
  return ids.reduce(
    (acc, id, i) =>
      reduceTelephone(acc, {
        type: 'input',
        playerId: id,
        payload: { kind: 'image', url: url(i), key: slotFor(acc, i) },
      }).state,
    state
  )
}

/** One complete step: everyone writes, everyone's picture comes back. */
function runStep(state: TelephoneState, prefix = 'a'): TelephoneState {
  return drawAll(submitAll(state, prefix))
}

describe('initTelephone', () => {
  it('opens on the blank page with one chain per player', () => {
    const state = initTelephone(players)
    expect(state.phase).toBe('write')
    expect(state.stepIndex).toBe(0)
    expect(state.chains).toHaveLength(4)
    expect(state.chains.every((c) => c.entries.length === 0)).toBe(true)
  })

  it('shortens the game for a small group so no chain revisits a player', () => {
    expect(initTelephone(players).steps).toBe(4)
  })

  it('runs the full six steps once the group is big enough', () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({ ...players[0], id: `p${i}`, name: `P${i}` }))
    expect(initTelephone(eight).steps).toBe(6)
  })

  it('starts everyone on zero', () => {
    expect(Object.values(initTelephone(players).scores)).toEqual([0, 0, 0, 0])
  })
})

describe('writing a sentence', () => {
  it('lands on the writer own chain in the opening step', () => {
    const state = reduceTelephone(initTelephone(players), {
      type: 'input',
      playerId: 'ron',
      payload: { kind: 'submit', text: 'a horse in a lift' },
    }).state
    expect(state.chains[2].entries[0]).toMatchObject({ playerId: 'ron', text: 'a horse in a lift', imageUrl: null })
  })

  it('ignores an empty sentence', () => {
    const state = reduceTelephone(initTelephone(players), {
      type: 'input',
      playerId: 'ron',
      payload: { kind: 'submit', text: '   ' },
    }).state
    expect(state.chains[2].entries).toHaveLength(0)
  })

  it('caps the sentence, so one player cannot blow up the prompt', () => {
    const state = reduceTelephone(initTelephone(players), {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'submit', text: 'x'.repeat(500) },
    }).state
    expect(state.chains[0].entries[0].text).toHaveLength(DEFAULT_CONFIG.maxTextLength)
  })

  it('refuses a second thought, because the picture is already being drawn', () => {
    let state = reduceTelephone(initTelephone(players), {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'submit', text: 'first' },
    }).state
    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'submit', text: 'second' } }).state
    expect(state.chains[0].entries).toHaveLength(1)
    expect(state.chains[0].entries[0].text).toBe('first')
  })

  it('waits while anyone is still writing', () => {
    const state = reduceTelephone(initTelephone(players), {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'submit', text: 'one' },
    }).state
    expect(state.phase).toBe('write')
  })

  it('moves to drawing once every sentence is in but no picture is back', () => {
    const state = submitAll(initTelephone(players))
    expect(state.phase).toBe('drawing')
    expect(state.chains.every((c) => c.entries[0].imageUrl === null)).toBe(true)
  })

  it('asks the runtime for a drawing timer as a backstop', () => {
    let state = initTelephone(players)
    for (const id of ids.slice(0, 3)) {
      state = reduceTelephone(state, { type: 'input', playerId: id, payload: { kind: 'submit', text: 'x' } }).state
    }
    const { commands } = reduceTelephone(state, { type: 'input', playerId: 'emily', payload: { kind: 'submit', text: 'x' } })
    expect(commands).toContainEqual({ kind: 'timer', ms: DEFAULT_CONFIG.durations.drawing })
  })
})

describe('pictures coming back', () => {
  it('records the url against the sentence that produced it', () => {
    let state = submitAll(initTelephone(players))
    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'image', url: url(0), key: slotFor(state, 0) } }).state
    expect(state.chains[0].entries[0].imageUrl).toBe(url(0))
    expect(state.chains[0].entries[0].failed).toBe(false)
  })

  it('substitutes a placeholder when the model failed', () => {
    let state = submitAll(initTelephone(players))
    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'image', url: null, key: slotFor(state, 0) } }).state
    expect(state.chains[0].entries[0].imageUrl).toBe(PLACEHOLDER_IMAGE)
    expect(state.chains[0].entries[0].failed).toBe(true)
  })

  it('refuses a url that did not come from our own storage', () => {
    let state = submitAll(initTelephone(players))
    state = reduceTelephone(state, {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'image', url: 'https://evil.example.com/nsfw.jpg', key: slotFor(state, 0) },
    }).state
    expect(state.chains[0].entries[0].imageUrl).toBe(PLACEHOLDER_IMAGE)
    expect(state.chains[0].entries[0].failed).toBe(true)
  })

  it('ignores a second picture for the same sentence', () => {
    let state = submitAll(initTelephone(players))
    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'image', url: url(0), key: slotFor(state, 0) } }).state
    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'image', url: url(9), key: slotFor(state, 0) } }).state
    expect(state.chains[0].entries[0].imageUrl).toBe(url(0))
  })

  it('still lands a picture that arrives after the step moved on', () => {
    // Generation takes seconds. A slow phone, or a host who skips the wait,
    // used to have its image dropped in silence and the chain showed
    // "no picture" for the rest of the game.
    let state = submitAll(initTelephone(players))
    const slot = slotFor(state, 0)
    const chainIndex = chainForPlayer(0, state.stepIndex, ids.length)

    // Everyone else finishes and the step advances past sam.
    state = ids.slice(1).reduce(
      (acc, id, i) =>
        reduceTelephone(acc, {
          type: 'input',
          playerId: id,
          payload: { kind: 'image', url: url(i + 1), key: slotFor(acc, i + 1) },
        }).state,
      state
    )

    // Sam's picture finally arrives, addressed to the slot it was made for.
    state = reduceTelephone(state, {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'image', url: url(0), key: slot },
    }).state

    expect(state.chains[chainIndex].entries[0].imageUrl).toBe(url(0))
    expect(state.chains[chainIndex].entries[0].failed).toBe(false)
  })

  it('starts the next step once every picture is back', () => {
    const state = runStep(initTelephone(players))
    expect(state.phase).toBe('describe')
    expect(state.stepIndex).toBe(1)
  })

  it('accepts a picture that arrives before the last player has written', () => {
    let state = reduceTelephone(initTelephone(players), {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'submit', text: 'early' },
    }).state
    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'image', url: url(0), key: slotFor(state, 0) } }).state
    expect(state.phase).toBe('write')
    expect(state.chains[0].entries[0].imageUrl).toBe(url(0))
  })
})

describe('the rotation in the reducer', () => {
  it('hands each player a different chain in the second step', () => {
    let state = runStep(initTelephone(players))
    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'submit', text: 'guess' } }).state
    // Sam is player 0, so at step 1 they are working on chain 1, not chain 0.
    expect(state.chains[1].entries[1]).toMatchObject({ playerId: 'sam', text: 'guess' })
    expect(state.chains[0].entries).toHaveLength(1)
  })

  it('gives every chain one entry per player, none of them repeated', () => {
    let state = initTelephone(players)
    for (let step = 0; step < 4; step++) state = runStep(state, `s${step}`)
    expect(state.phase).toBe('reveal')
    for (const chain of state.chains) {
      expect(chain.entries).toHaveLength(4)
      expect(new Set(chain.entries.map((e) => e.playerId)).size).toBe(4)
    }
  })
})

describe('nobody is allowed to hold up the room', () => {
  it('fills a missing sentence on the deadline and keeps moving', () => {
    const state = reduceTelephone(initTelephone(players), { type: 'deadline' }).state
    expect(state.chains.every((c) => c.entries[0].failed)).toBe(true)
    expect(state.stepIndex).toBe(1)
    expect(state.phase).toBe('describe')
  })

  it('fills a missing picture on the deadline rather than hanging', () => {
    let state = submitAll(initTelephone(players))
    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'image', url: url(0), key: slotFor(state, 0) } }).state
    expect(state.phase).toBe('drawing')

    state = reduceTelephone(state, { type: 'deadline' }).state
    expect(state.chains[0].entries[0].imageUrl).toBe(url(0))
    expect(state.chains[1].entries[0].imageUrl).toBe(PLACEHOLDER_IMAGE)
    expect(state.phase).toBe('describe')
  })

  it('lets the host give up on the drawing early', () => {
    const state = reduceTelephone(submitAll(initTelephone(players)), { type: 'hostAdvance' }).state
    expect(state.stepIndex).toBe(1)
  })
})

describe('the reveal', () => {
  function atReveal() {
    let state = initTelephone(players)
    for (let step = 0; step < 4; step++) state = runStep(state, `s${step}`)
    return state
  }

  it('opens on the first beat of the first chain', () => {
    const state = atReveal()
    expect(state.phase).toBe('reveal')
    expect(state.reveal).toEqual({ chainIndex: 0, beat: 0 })
  })

  it('walks sentence, picture, sentence, picture through a chain', () => {
    let state = atReveal()
    // Four entries means eight beats.
    for (let beat = 1; beat < 8; beat++) {
      state = reduceTelephone(state, { type: 'hostAdvance' }).state
      expect(state.reveal).toEqual({ chainIndex: 0, beat })
    }
  })

  it('moves to the next chain after the last beat', () => {
    let state = atReveal()
    for (let beat = 0; beat < 8; beat++) state = reduceTelephone(state, { type: 'hostAdvance' }).state
    expect(state.reveal).toEqual({ chainIndex: 1, beat: 0 })
  })

  it('opens the vote after the last chain', () => {
    let state = atReveal()
    for (let i = 0; i < 4 * 8; i++) state = reduceTelephone(state, { type: 'hostAdvance' }).state
    expect(state.phase).toBe('vote')
  })
})

describe('the vote', () => {
  function atVote() {
    let state = initTelephone(players)
    for (let step = 0; step < 4; step++) state = runStep(state, `s${step}`)
    for (let i = 0; i < 4 * 8; i++) state = reduceTelephone(state, { type: 'hostAdvance' }).state
    expect(state.phase).toBe('vote')
    return state
  }

  it('records a vote', () => {
    const state = reduceTelephone(atVote(), { type: 'input', playerId: 'sam', payload: { kind: 'vote', chainIndex: 2 } }).state
    expect(state.votes.sam).toBe(2)
  })

  it('refuses a vote for the chain you started yourself', () => {
    // Sam is player 0, so chain 0 is Sam's own.
    const state = reduceTelephone(atVote(), { type: 'input', playerId: 'sam', payload: { kind: 'vote', chainIndex: 0 } }).state
    expect(state.votes.sam).toBeUndefined()
  })

  it('ends as soon as everyone has voted', () => {
    let state = atVote()
    // Nobody may vote for their own chain, so each player picks the next along.
    ids.forEach((id, i) => {
      state = reduceTelephone(state, {
        type: 'input',
        playerId: id,
        payload: { kind: 'vote', chainIndex: (i + 1) % ids.length },
      }).state
    })
    expect(Object.keys(state.votes)).toHaveLength(4)
    expect(state.phase).toBe('ended')
  })

  it('pays everyone who wrote in the winning chain, and nobody else', () => {
    let state = atVote()
    // Chain 2 is Ron's. Everyone but Ron piles onto it; Ron votes elsewhere.
    for (const id of ['sam', 'mike', 'emily']) {
      state = reduceTelephone(state, { type: 'input', playerId: id, payload: { kind: 'vote', chainIndex: 2 } }).state
    }
    state = reduceTelephone(state, { type: 'input', playerId: 'ron', payload: { kind: 'vote', chainIndex: 3 } }).state

    expect(state.phase).toBe('ended')
    // With four players and four steps every player contributes to every chain,
    // so the whole room shares the win. That is by construction, not a bug.
    const contributors = new Set(state.chains[2].entries.map((e) => e.playerId))
    for (const id of ids) {
      expect(state.scores[id]).toBe(contributors.has(id) ? DEFAULT_CONFIG.scoring.winningChain : 0)
    }
  })

  it('awards nothing when nobody voted', () => {
    const state = reduceTelephone(atVote(), { type: 'deadline' }).state
    expect(state.phase).toBe('ended')
    expect(Object.values(state.scores)).toEqual([0, 0, 0, 0])
  })

  it('tallies on the deadline with partial votes', () => {
    let state = atVote()
    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'vote', chainIndex: 1 } }).state
    state = reduceTelephone(state, { type: 'deadline' }).state
    expect(state.phase).toBe('ended')
    expect(state.awarded.mike).toBe(DEFAULT_CONFIG.scoring.winningChain)
  })
})

describe('a whole game on timers alone', () => {
  it('reaches the end without anyone touching a phone', () => {
    let state = initTelephone(players)
    let guard = 0
    while (state.phase !== 'ended' && guard++ < 500) {
      state = reduceTelephone(state, { type: 'deadline' }).state
    }
    expect(state.phase).toBe('ended')
    expect(guard).toBeLessThan(500)
  })

  it('is inert once it has ended', () => {
    let state = initTelephone(players)
    while (state.phase !== 'ended') state = reduceTelephone(state, { type: 'deadline' }).state
    expect(reduceTelephone(state, { type: 'hostAdvance' }).state).toBe(state)
  })
})
