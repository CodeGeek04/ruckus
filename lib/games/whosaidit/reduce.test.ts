import { describe, expect, it } from 'vitest'
import type { Player } from '@/lib/types'
import type { ChatMessage } from './parse'
import { buildRounds, initWhoSaidIt, reduceWhoSaidIt } from './reduce'
import { DEFAULT_CONFIG, type ChatSource } from './state'

const players: Player[] = [
  { id: 'sam', name: 'Sam', color: '#ef4444', connected: true },
  { id: 'mike', name: 'Mike', color: '#22c55e', connected: true },
  { id: 'ron', name: 'Ron', color: '#3b82f6', connected: true },
  { id: 'emily', name: 'Emily', color: '#eab308', connected: true },
]

/** Long enough, wordy enough and free of anyone's name: all playable. */
function messages(author: string, n: number): ChatMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${author}-${i}`,
    author,
    text: `I genuinely cannot believe the ${'very '.repeat(i % 3)}wrong month got booked again by ${author} number ${i}`,
  }))
}

const source: ChatSource = {
  messages: [
    ...messages('shivam', 6),
    ...messages('riya', 6),
    ...messages('aman', 6),
    ...messages('kabir', 6),
  ],
  mapping: { shivam: 'sam', riya: 'mike', aman: 'ron', kabir: 'emily' },
}

function fresh(overrides: Partial<ChatSource> = {}) {
  return initWhoSaidIt(players, { ...source, ...overrides })
}

/** Force a known author so tests do not depend on which message was dealt. */
function withAuthor(authorId: string) {
  const state = fresh()
  return {
    ...state,
    rounds: state.rounds.map((r) => ({ ...r, authorId })),
  }
}

describe('buildRounds', () => {
  it('builds one round per requested round when there is material', () => {
    const { rounds, problem } = buildRounds(players, source, DEFAULT_CONFIG)
    expect(problem).toBeNull()
    expect(rounds).toHaveLength(10)
  })

  it('attributes every round to the lobby player the chat author was mapped to', () => {
    const { rounds } = buildRounds(players, source, DEFAULT_CONFIG)
    for (const round of rounds) {
      expect(['sam', 'mike', 'ron', 'emily']).toContain(round.authorId)
    }
  })

  it('always puts the real author among the options', () => {
    const { rounds } = buildRounds(players, source, DEFAULT_CONFIG)
    for (const round of rounds) expect(round.candidateIds).toContain(round.authorId)
  })

  it('offers only players that some chat author was mapped to', () => {
    const { rounds } = buildRounds(players, {
      ...source,
      mapping: { shivam: 'sam', riya: 'mike', aman: 'ron', kabir: null },
    }, DEFAULT_CONFIG)
    for (const round of rounds) {
      expect(round.candidateIds).toEqual(['sam', 'mike', 'ron'])
      expect(round.authorId).not.toBe('emily')
    }
  })

  it('never uses a message from an ignored author', () => {
    const tagged: ChatSource = {
      messages: [...messages('shivam', 6), ...messages('riya', 6), ...messages('aman', 6), ...messages('spam', 6)],
      mapping: { shivam: 'sam', riya: 'mike', aman: 'ron', spam: null },
    }
    const { rounds } = buildRounds(players, tagged, DEFAULT_CONFIG)
    for (const round of rounds) expect(round.text).not.toContain('spam')
  })

  it('refuses to build a game where the author is the only possible answer', () => {
    const { rounds, problem } = buildRounds(players, {
      ...source,
      mapping: { shivam: 'sam', riya: 'mike', aman: null, kabir: null },
    }, DEFAULT_CONFIG)
    expect(rounds).toHaveLength(0)
    expect(problem).toMatch(/three/i)
  })

  it('ignores a mapping that points at nobody in the lobby', () => {
    const { rounds, problem } = buildRounds(players, {
      ...source,
      mapping: { shivam: 'sam', riya: 'mike', aman: 'ron', kabir: 'ghost' },
    }, DEFAULT_CONFIG)
    expect(problem).toBeNull()
    for (const round of rounds) expect(round.candidateIds).not.toContain('ghost')
  })

  it('reports a problem rather than building rounds out of unplayable chatter', () => {
    const junk: ChatSource = {
      messages: ['shivam', 'riya', 'aman'].flatMap((author) =>
        Array.from({ length: 5 }, (_, i) => ({ id: `${author}-${i}`, author, text: 'ok' }))
      ),
      mapping: { shivam: 'sam', riya: 'mike', aman: 'ron' },
    }
    const { rounds, problem } = buildRounds(players, junk, DEFAULT_CONFIG)
    expect(rounds).toHaveLength(0)
    expect(problem).toMatch(/message/i)
  })

  it('plays a short game rather than refusing when material runs out', () => {
    const thin: ChatSource = {
      messages: [...messages('shivam', 1), ...messages('riya', 1), ...messages('aman', 1)],
      mapping: { shivam: 'sam', riya: 'mike', aman: 'ron' },
    }
    const { rounds, problem } = buildRounds(players, thin, DEFAULT_CONFIG)
    expect(problem).toBeNull()
    expect(rounds).toHaveLength(3)
  })
})

describe('initWhoSaidIt', () => {
  it('opens on the first message', () => {
    const state = fresh()
    expect(state.phase).toBe('message')
    expect(state.roundIndex).toBe(0)
    expect(state.problem).toBeNull()
  })

  it('starts everyone on zero', () => {
    expect(Object.values(fresh().scores)).toEqual([0, 0, 0, 0])
  })

  it('ends immediately, with a reason, when there is no chat to play', () => {
    const state = initWhoSaidIt(players, { messages: [], mapping: {} })
    expect(state.phase).toBe('ended')
    expect(state.problem).not.toBeNull()
  })

  it('survives being reduced with no rounds at all', () => {
    const state = initWhoSaidIt(players, { messages: [], mapping: {} })
    expect(reduceWhoSaidIt(state, { type: 'deadline' }).state.phase).toBe('ended')
  })
})

describe('message phase', () => {
  it('records a guess', () => {
    const state = withAuthor('sam')
    const next = reduceWhoSaidIt(state, {
      type: 'input',
      playerId: 'mike',
      payload: { kind: 'guess', targetId: 'ron' },
    }).state
    expect(next.rounds[0].guesses.mike).toBe('ron')
  })

  it('ignores a guess from the person who wrote it', () => {
    const next = reduceWhoSaidIt(withAuthor('sam'), {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'guess', targetId: 'ron' },
    }).state
    expect(next.rounds[0].guesses.sam).toBeUndefined()
  })

  it('ignores a guess at somebody who is not a candidate', () => {
    const state = { ...withAuthor('sam') }
    state.rounds = state.rounds.map((r) => ({ ...r, candidateIds: ['sam', 'mike', 'ron'] }))
    const next = reduceWhoSaidIt(state, {
      type: 'input',
      playerId: 'mike',
      payload: { kind: 'guess', targetId: 'emily' },
    }).state
    expect(next.rounds[0].guesses.mike).toBeUndefined()
  })

  it('lets a player change their mind before the reveal', () => {
    let state = withAuthor('sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', targetId: 'ron' } }).state
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', targetId: 'emily' } }).state
    expect(state.rounds[0].guesses.mike).toBe('emily')
  })

  it('reveals early once everyone who can guess has guessed', () => {
    let state = withAuthor('sam')
    for (const id of ['mike', 'ron']) {
      state = reduceWhoSaidIt(state, { type: 'input', playerId: id, payload: { kind: 'guess', targetId: 'sam' } }).state
      expect(state.phase).toBe('message')
    }
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'emily', payload: { kind: 'guess', targetId: 'ron' } }).state
    expect(state.phase).toBe('reveal')
  })

  it('reveals on the deadline even with missing guesses', () => {
    expect(reduceWhoSaidIt(withAuthor('sam'), { type: 'deadline' }).state.phase).toBe('reveal')
  })

  it('asks the runtime for a timer sized to the next phase', () => {
    const { commands } = reduceWhoSaidIt(withAuthor('sam'), { type: 'deadline' })
    expect(commands).toContainEqual({ kind: 'timer', ms: DEFAULT_CONFIG.durations.reveal })
  })
})

describe('scoring on reveal', () => {
  it('banks 500 for everyone who got it and nothing for anyone else', () => {
    let state = withAuthor('sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', targetId: 'sam' } }).state
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'ron', payload: { kind: 'guess', targetId: 'sam' } }).state
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'emily', payload: { kind: 'guess', targetId: 'mike' } }).state

    expect(state.phase).toBe('reveal')
    expect(state.scores.mike).toBe(500)
    expect(state.scores.ron).toBe(500)
    expect(state.scores.emily).toBe(0)
    expect(state.scores.sam).toBe(0)
    expect(state.rounds[0].awarded).toEqual({ mike: 500, ron: 500 })
  })

  it('scores a round only once, however often the host advances', () => {
    let state = withAuthor('sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', targetId: 'sam' } }).state
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state
    expect(state.scores.mike).toBe(500)
    state = reduceWhoSaidIt(state, { type: 'hostAdvance' }).state
    expect(state.phase).toBe('scoreboard')
    expect(state.scores.mike).toBe(500)
  })

  it('accumulates across rounds', () => {
    let state = withAuthor('sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', targetId: 'sam' } }).state
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state // reveal
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state // scoreboard
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state // round two
    expect(state.roundIndex).toBe(1)
    expect(state.phase).toBe('message')

    const authorId = state.rounds[1].authorId
    const guesser = players.find((p) => p.id !== authorId)!.id
    state = reduceWhoSaidIt(state, { type: 'input', playerId: guesser, payload: { kind: 'guess', targetId: authorId } }).state
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state
    expect(state.scores[guesser]).toBe(guesser === 'mike' ? 1000 : 500)
  })
})

describe('round transitions', () => {
  it('walks message, reveal, scoreboard, next round', () => {
    let state = fresh()
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state
    expect(state.phase).toBe('reveal')
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state
    expect(state.phase).toBe('scoreboard')
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state
    expect(state.phase).toBe('message')
    expect(state.roundIndex).toBe(1)
  })

  it('lets the host skip a phase manually', () => {
    expect(reduceWhoSaidIt(fresh(), { type: 'hostAdvance' }).state.phase).toBe('reveal')
  })

  it('plays exactly ten rounds and then ends', () => {
    let state = fresh()
    let guard = 0
    while (state.phase !== 'ended' && guard++ < 500) {
      state = reduceWhoSaidIt(state, { type: 'deadline' }).state
    }
    expect(state.phase).toBe('ended')
    expect(state.roundIndex).toBe(9)
  })

  it('never shows the same message twice', () => {
    const texts = fresh().rounds.map((r) => r.text)
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('goes quiet once it has ended', () => {
    let state = fresh()
    let guard = 0
    while (state.phase !== 'ended' && guard++ < 500) {
      state = reduceWhoSaidIt(state, { type: 'deadline' }).state
    }
    const after = reduceWhoSaidIt(state, { type: 'deadline' })
    expect(after.state.phase).toBe('ended')
    expect(after.state.roundIndex).toBe(9)
  })
})
