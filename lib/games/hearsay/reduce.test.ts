import { describe, expect, it } from 'vitest'
import type { Player } from '@/lib/types'
import { initHearsay, reduceHearsay } from './reduce'
import { DEFAULT_CONFIG } from './state'

const players: Player[] = [
  { id: 'sam', name: 'Sam', color: '#ef4444', connected: true },
  { id: 'mike', name: 'Mike', color: '#22c55e', connected: true },
  { id: 'ron', name: 'Ron', color: '#3b82f6', connected: true },
  { id: 'emily', name: 'Emily', color: '#eab308', connected: true },
]

/** Force a known accused so tests do not depend on the shuffle. */
function stateWithAccused(accused: string) {
  const base = initHearsay(players)
  return {
    ...base,
    order: base.order.map(() => accused),
    // The round was built from the shuffled order, so it must be rewritten too.
    rounds: [{ ...base.rounds[0], accusedId: accused }],
  }
}

describe('initHearsay', () => {
  it('starts in the charge phase of round zero', () => {
    const state = initHearsay(players)
    expect(state.phase).toBe('charge')
    expect(state.roundIndex).toBe(0)
  })

  it('gives four players eight rounds', () => {
    expect(initHearsay(players).order).toHaveLength(8)
  })

  it('starts everyone on zero', () => {
    const state = initHearsay(players)
    expect(Object.values(state.scores)).toEqual([0, 0, 0, 0])
  })

  it('prepares the first round with three options', () => {
    const state = initHearsay(players)
    expect(state.rounds[0].options).toHaveLength(3)
    expect(state.rounds[0].accusedPick).toBeNull()
  })
})

describe('charge phase', () => {
  it('moves to testimony on the deadline', () => {
    const state = stateWithAccused('sam')
    expect(reduceHearsay(state, { type: 'deadline' }).state.phase).toBe('testimony')
  })

  it('asks the runtime for a timer sized to the phase', () => {
    const state = stateWithAccused('sam')
    const { commands } = reduceHearsay(state, { type: 'deadline' })
    expect(commands).toContainEqual({ kind: 'timer', ms: DEFAULT_CONFIG.durations.testimony })
  })
})

describe('testimony phase', () => {
  function inTestimony() {
    return reduceHearsay(stateWithAccused('sam'), { type: 'deadline' }).state
  }

  it('records a vote', () => {
    const next = reduceHearsay(inTestimony(), {
      type: 'input',
      playerId: 'mike',
      payload: { kind: 'vote', targetId: 'ron' },
    }).state
    expect(next.rounds[0].votes.mike).toBe('ron')
  })

  it('ignores a vote from the accused', () => {
    const next = reduceHearsay(inTestimony(), {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'vote', targetId: 'ron' },
    }).state
    expect(next.rounds[0].votes.sam).toBeUndefined()
  })

  it('lets a voter change their mind before the phase ends', () => {
    let state = inTestimony()
    state = reduceHearsay(state, { type: 'input', playerId: 'mike', payload: { kind: 'vote', targetId: 'ron' } }).state
    state = reduceHearsay(state, { type: 'input', playerId: 'mike', payload: { kind: 'vote', targetId: 'emily' } }).state
    expect(state.rounds[0].votes.mike).toBe('emily')
  })

  it('advances early once every voter has voted', () => {
    let state = inTestimony()
    for (const id of ['mike', 'ron']) {
      state = reduceHearsay(state, { type: 'input', playerId: id, payload: { kind: 'vote', targetId: 'ron' } }).state
      expect(state.phase).toBe('testimony')
    }
    state = reduceHearsay(state, { type: 'input', playerId: 'emily', payload: { kind: 'vote', targetId: 'sam' } }).state
    expect(state.phase).toBe('evidence')
  })

  it('advances on the deadline even with missing votes', () => {
    expect(reduceHearsay(inTestimony(), { type: 'deadline' }).state.phase).toBe('evidence')
  })
})

describe('guess phase', () => {
  function inGuess() {
    let state = reduceHearsay(stateWithAccused('sam'), { type: 'deadline' }).state // testimony
    state = reduceHearsay(state, { type: 'input', playerId: 'mike', payload: { kind: 'vote', targetId: 'ron' } }).state
    state = reduceHearsay(state, { type: 'input', playerId: 'ron', payload: { kind: 'vote', targetId: 'ron' } }).state
    state = reduceHearsay(state, { type: 'input', playerId: 'emily', payload: { kind: 'vote', targetId: 'sam' } }).state
    return reduceHearsay(state, { type: 'deadline' }).state // evidence -> guess
  }

  it('is reached after evidence', () => {
    expect(inGuess().phase).toBe('guess')
  })

  it('records the accused pick', () => {
    const state = inGuess()
    const next = reduceHearsay(state, {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'guess', questionId: state.rounds[0].options[0].id },
    }).state
    expect(next.rounds[0].accusedPick).toBe(state.rounds[0].options[0].id)
  })

  it('ignores a guess from anyone who is not the accused', () => {
    const state = inGuess()
    const next = reduceHearsay(state, {
      type: 'input',
      playerId: 'mike',
      payload: { kind: 'guess', questionId: state.rounds[0].options[0].id },
    }).state
    expect(next.rounds[0].accusedPick).toBeNull()
  })

  it('records crowd predictions', () => {
    const next = reduceHearsay(inGuess(), {
      type: 'input',
      playerId: 'mike',
      payload: { kind: 'predict', willGetIt: true },
    }).state
    expect(next.rounds[0].predictions.mike).toBe(true)
  })

  it('waits for the crowd even after the accused has answered', () => {
    const state = inGuess()
    const next = reduceHearsay(state, {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'guess', questionId: state.rounds[0].question.id },
    }).state
    expect(next.phase).toBe('guess')
  })

  it('advances to verdict once the accused and every voter has answered', () => {
    let state = inGuess()
    state = reduceHearsay(state, { type: 'input', playerId: 'sam', payload: { kind: 'guess', questionId: state.rounds[0].question.id } }).state
    for (const id of ['mike', 'ron', 'emily']) {
      state = reduceHearsay(state, { type: 'input', playerId: id, payload: { kind: 'predict', willGetIt: true } }).state
    }
    expect(state.phase).toBe('verdict')
  })

  it('applies scores when entering verdict', () => {
    let state = inGuess()
    state = reduceHearsay(state, { type: 'input', playerId: 'sam', payload: { kind: 'guess', questionId: state.rounds[0].question.id } }).state
    state = reduceHearsay(state, { type: 'deadline' }).state
    expect(state.phase).toBe('verdict')
    expect(state.scores.sam).toBe(1000)
    expect(state.scores.mike).toBe(500)
    expect(state.scores.ron).toBe(500)
    expect(state.scores.emily).toBe(0)
    expect(state.rounds[0].awarded.sam).toBe(1000)
  })

  it('scores a timed out accused as wrong', () => {
    const state = reduceHearsay(inGuess(), { type: 'deadline' }).state
    expect(state.scores.sam).toBe(0)
  })
})

describe('round transitions', () => {
  function throughOneRound() {
    let state = reduceHearsay(stateWithAccused('sam'), { type: 'deadline' }).state // testimony
    state = reduceHearsay(state, { type: 'deadline' }).state // evidence
    state = reduceHearsay(state, { type: 'deadline' }).state // guess
    state = reduceHearsay(state, { type: 'deadline' }).state // verdict
    return reduceHearsay(state, { type: 'deadline' }).state // scoreboard
  }

  it('reaches the scoreboard', () => {
    expect(throughOneRound().phase).toBe('scoreboard')
  })

  it('starts the next round at charge with a fresh question', () => {
    const state = reduceHearsay(throughOneRound(), { type: 'deadline' }).state
    expect(state.phase).toBe('charge')
    expect(state.roundIndex).toBe(1)
    expect(state.rounds[1].options).toHaveLength(3)
    expect(state.usedQuestionIds).toContain(state.rounds[0].question.id)
  })

  it('never repeats a question across rounds', () => {
    let state = initHearsay(players)
    const seen: string[] = []
    while (state.phase !== 'ended') {
      if (state.phase === 'charge') seen.push(state.rounds[state.roundIndex].question.id)
      state = reduceHearsay(state, { type: 'deadline' }).state
    }
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('ends after the last round', () => {
    let state = initHearsay(players)
    let guard = 0
    while (state.phase !== 'ended' && guard++ < 500) {
      state = reduceHearsay(state, { type: 'deadline' }).state
    }
    expect(state.phase).toBe('ended')
    expect(state.roundIndex).toBe(7)
  })

  it('lets the host skip a phase manually', () => {
    const state = reduceHearsay(stateWithAccused('sam'), { type: 'hostAdvance' }).state
    expect(state.phase).toBe('testimony')
  })
})

describe('inputs from people who are not in the game', () => {
  it('ignores a vote from an id the game has never heard of', () => {
    // The public channel is open to anyone with the room code. An outsider's
    // vote used to land in round.votes, skew the tally the room reads off the
    // screen, and earn them read-the-room points.
    const state = { ...stateWithAccused('sam'), phase: 'testimony' as const }
    const next = reduceHearsay(state, {
      type: 'input',
      playerId: 'gatecrasher',
      payload: { kind: 'vote', targetId: 'mike' },
    }).state

    expect(next.rounds[0].votes).toEqual({})
    expect(next.scores.gatecrasher).toBeUndefined()
  })

  it('ignores a prediction and a guess from an outsider', () => {
    const state = { ...stateWithAccused('sam'), phase: 'guess' as const }

    const predicted = reduceHearsay(state, {
      type: 'input',
      playerId: 'gatecrasher',
      payload: { kind: 'predict', willGetIt: true },
    }).state
    expect(predicted.rounds[0].predictions).toEqual({})

    const guessed = reduceHearsay(state, {
      type: 'input',
      playerId: 'gatecrasher',
      payload: { kind: 'guess', questionId: state.rounds[0].question.id },
    }).state
    expect(guessed.rounds[0].accusedPick).toBeNull()
  })

  it('still lets the real players play', () => {
    const state = { ...stateWithAccused('sam'), phase: 'testimony' as const }
    const next = reduceHearsay(state, {
      type: 'input',
      playerId: 'mike',
      payload: { kind: 'vote', targetId: 'ron' },
    }).state
    expect(next.rounds[0].votes).toEqual({ mike: 'ron' })
  })
})
