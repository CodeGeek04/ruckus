import { describe, expect, it } from 'vitest'
import type { Player } from '@/lib/types'
import { parseWhatsAppExport, type ChatMessage } from './parse'
import { buildRounds, initWhoSaidIt, reduceWhoSaidIt } from './reduce'
import { DEFAULT_CONFIG, type AuthorEntry, type ChatSource } from './state'

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

function author(playerId: string | null = null, included = true): AuthorEntry {
  return { included, playerId }
}

/** Three authors in the room, one who never showed up. */
const source: ChatSource = {
  messages: [
    ...messages('shivam', 6),
    ...messages('riya', 6),
    ...messages('aman', 6),
    ...messages('kushagra', 6),
  ],
  authors: {
    shivam: author('sam'),
    riya: author('mike'),
    aman: author('ron'),
    kushagra: author(null),
  },
}

function fresh(overrides: Partial<ChatSource> = {}) {
  return initWhoSaidIt(players, { ...source, ...overrides })
}

/** Force a known author so tests do not depend on which message was dealt. */
function withAuthor(name: string, playerId: string | null) {
  const state = fresh()
  return {
    ...state,
    rounds: state.rounds.map((r) => ({ ...r, author: name, authorPlayerId: playerId })),
  }
}

describe('buildRounds', () => {
  it('builds one round per requested round when there is material', () => {
    const { rounds, problem } = buildRounds(players, source, DEFAULT_CONFIG)
    expect(problem).toBeNull()
    expect(rounds).toHaveLength(10)
  })

  it('attributes every round to the chat author who wrote it', () => {
    const { rounds } = buildRounds(players, source, DEFAULT_CONFIG)
    for (const round of rounds) {
      expect(['shivam', 'riya', 'aman', 'kushagra']).toContain(round.author)
    }
  })

  it('always puts the real author among the options', () => {
    const { rounds } = buildRounds(players, source, DEFAULT_CONFIG)
    for (const round of rounds) expect(round.candidates).toContain(round.author)
  })

  it('makes an author who never joined the game a candidate and an answer', () => {
    const { rounds } = buildRounds(players, source, DEFAULT_CONFIG)
    for (const round of rounds) expect(round.candidates).toContain('kushagra')
    expect(rounds.some((r) => r.author === 'kushagra')).toBe(true)
  })

  it('leaves nobody sitting out when the author is not in the room', () => {
    const { rounds } = buildRounds(players, source, DEFAULT_CONFIG)
    for (const round of rounds.filter((r) => r.author === 'kushagra')) {
      expect(round.authorPlayerId).toBeNull()
    }
  })

  it('sits the linked player out of their own round', () => {
    const { rounds } = buildRounds(players, source, DEFAULT_CONFIG)
    for (const round of rounds.filter((r) => r.author === 'shivam')) {
      expect(round.authorPlayerId).toBe('sam')
    }
  })

  it('excludes an author from both the answer board and the material', () => {
    const { rounds } = buildRounds(
      players,
      { ...source, authors: { ...source.authors, kushagra: author(null, false) } },
      DEFAULT_CONFIG
    )
    for (const round of rounds) {
      expect(round.candidates).toEqual(['shivam', 'riya', 'aman'])
      expect(round.author).not.toBe('kushagra')
      expect(round.text).not.toContain('kushagra')
    }
  })

  it('never uses a message from an excluded author', () => {
    const tagged: ChatSource = {
      messages: [...messages('shivam', 6), ...messages('riya', 6), ...messages('aman', 6), ...messages('spam', 6)],
      authors: {
        shivam: author('sam'),
        riya: author('mike'),
        aman: author('ron'),
        spam: author(null, false),
      },
    }
    const { rounds } = buildRounds(players, tagged, DEFAULT_CONFIG)
    for (const round of rounds) expect(round.text).not.toContain('spam')
  })

  it('refuses to build a game where the author is the only possible answer', () => {
    const { rounds, problem } = buildRounds(
      players,
      {
        ...source,
        authors: {
          shivam: author('sam'),
          riya: author('mike'),
          aman: author(null, false),
          kushagra: author(null, false),
        },
      },
      DEFAULT_CONFIG
    )
    expect(rounds).toHaveLength(0)
    expect(problem).toMatch(/three/i)
  })

  it('ignores a link that points at nobody in the lobby', () => {
    const { rounds, problem } = buildRounds(
      players,
      { ...source, authors: { ...source.authors, kushagra: author('ghost') } },
      DEFAULT_CONFIG
    )
    expect(problem).toBeNull()
    expect(rounds.every((r) => r.authorPlayerId !== 'ghost')).toBe(true)
    for (const round of rounds.filter((r) => r.author === 'kushagra')) {
      expect(round.authorPlayerId).toBeNull()
    }
  })

  it('reports a problem rather than building rounds out of unplayable chatter', () => {
    const junk: ChatSource = {
      messages: ['shivam', 'riya', 'aman'].flatMap((name) =>
        Array.from({ length: 5 }, (_, i) => ({ id: `${name}-${i}`, author: name, text: 'ok' }))
      ),
      authors: { shivam: author('sam'), riya: author('mike'), aman: author('ron') },
    }
    const { rounds, problem } = buildRounds(players, junk, DEFAULT_CONFIG)
    expect(rounds).toHaveLength(0)
    expect(problem).toMatch(/message/i)
  })

  it('plays a short game rather than refusing when material runs out', () => {
    const thin: ChatSource = {
      messages: [...messages('shivam', 1), ...messages('riya', 1), ...messages('aman', 1)],
      authors: { shivam: author('sam'), riya: author('mike'), aman: author('ron') },
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

  it('remembers which player each linked author is', () => {
    expect(fresh().links).toEqual({ shivam: 'sam', riya: 'mike', aman: 'ron' })
  })

  it('ends immediately, with a reason, when there is no chat to play', () => {
    const state = initWhoSaidIt(players, { messages: [], authors: {} })
    expect(state.phase).toBe('ended')
    expect(state.problem).not.toBeNull()
  })

  it('survives being reduced with no rounds at all', () => {
    const state = initWhoSaidIt(players, { messages: [], authors: {} })
    expect(reduceWhoSaidIt(state, { type: 'deadline' }).state.phase).toBe('ended')
  })
})

describe('message phase', () => {
  it('records a guess', () => {
    const state = withAuthor('shivam', 'sam')
    const next = reduceWhoSaidIt(state, {
      type: 'input',
      playerId: 'mike',
      payload: { kind: 'guess', target: 'aman' },
    }).state
    expect(next.rounds[0].guesses.mike).toBe('aman')
  })

  it('ignores a guess from the person who wrote it', () => {
    const next = reduceWhoSaidIt(withAuthor('shivam', 'sam'), {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'guess', target: 'aman' },
    }).state
    expect(next.rounds[0].guesses.sam).toBeUndefined()
  })

  it('ignores a guess from someone who is not in the game', () => {
    // Anyone with the room code can publish on the public channel. An
    // outsider's guess used to be recorded and scored.
    const state = withAuthor('shivam', 'sam')
    const next = reduceWhoSaidIt(state, {
      type: 'input',
      playerId: 'gatecrasher',
      payload: { kind: 'guess', target: 'aman' },
    }).state
    expect(next.rounds[0].guesses.gatecrasher).toBeUndefined()
    expect(next.rounds[0].guesses).toEqual({})
  })

  it('ignores a guess at somebody who is not a candidate', () => {
    const state = withAuthor('shivam', 'sam')
    const next = reduceWhoSaidIt(state, {
      type: 'input',
      playerId: 'mike',
      payload: { kind: 'guess', target: 'nobody' },
    }).state
    expect(next.rounds[0].guesses.mike).toBeUndefined()
  })

  it('lets a player change their mind before the reveal', () => {
    let state = withAuthor('shivam', 'sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', target: 'aman' } }).state
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', target: 'kushagra' } }).state
    expect(state.rounds[0].guesses.mike).toBe('kushagra')
  })

  it('reveals early once everyone who can guess has guessed', () => {
    let state = withAuthor('shivam', 'sam')
    for (const id of ['mike', 'ron']) {
      state = reduceWhoSaidIt(state, { type: 'input', playerId: id, payload: { kind: 'guess', target: 'shivam' } }).state
      expect(state.phase).toBe('message')
    }
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'emily', payload: { kind: 'guess', target: 'aman' } }).state
    expect(state.phase).toBe('reveal')
  })

  it('does not wait on the player who wrote it', () => {
    // Sam is linked to shivam, so the round closes on the other three alone.
    let state = withAuthor('shivam', 'sam')
    for (const id of ['mike', 'ron', 'emily']) {
      state = reduceWhoSaidIt(state, { type: 'input', playerId: id, payload: { kind: 'guess', target: 'riya' } }).state
    }
    expect(state.phase).toBe('reveal')
  })

  it('waits on the whole room when the author never joined', () => {
    let state = withAuthor('kushagra', null)
    for (const id of ['mike', 'ron', 'emily']) {
      state = reduceWhoSaidIt(state, { type: 'input', playerId: id, payload: { kind: 'guess', target: 'riya' } }).state
      expect(state.phase).toBe('message')
    }
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'sam', payload: { kind: 'guess', target: 'kushagra' } }).state
    expect(state.phase).toBe('reveal')
    expect(state.scores.sam).toBe(500)
  })

  it('reveals on the deadline even with missing guesses', () => {
    expect(reduceWhoSaidIt(withAuthor('shivam', 'sam'), { type: 'deadline' }).state.phase).toBe('reveal')
  })

  it('asks the runtime for a timer sized to the next phase', () => {
    const { commands } = reduceWhoSaidIt(withAuthor('shivam', 'sam'), { type: 'deadline' })
    expect(commands).toContainEqual({ kind: 'timer', ms: DEFAULT_CONFIG.durations.reveal })
  })
})

describe('scoring on reveal', () => {
  it('banks 500 for everyone who got it and nothing for anyone else', () => {
    let state = withAuthor('shivam', 'sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', target: 'shivam' } }).state
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'ron', payload: { kind: 'guess', target: 'shivam' } }).state
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'emily', payload: { kind: 'guess', target: 'riya' } }).state

    expect(state.phase).toBe('reveal')
    expect(state.scores.mike).toBe(500)
    expect(state.scores.ron).toBe(500)
    expect(state.scores.emily).toBe(0)
    expect(state.scores.sam).toBe(0)
    expect(state.rounds[0].awarded).toEqual({ mike: 500, ron: 500 })
  })

  it('pays a player for naming somebody who is not in the room', () => {
    let state = withAuthor('kushagra', null)
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', target: 'kushagra' } }).state
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state
    expect(state.scores.mike).toBe(500)
  })

  it('scores a round only once, however often the host advances', () => {
    let state = withAuthor('shivam', 'sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', target: 'shivam' } }).state
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state
    expect(state.scores.mike).toBe(500)
    state = reduceWhoSaidIt(state, { type: 'hostAdvance' }).state
    expect(state.phase).toBe('scoreboard')
    expect(state.scores.mike).toBe(500)
  })

  it('accumulates across rounds', () => {
    let state = withAuthor('shivam', 'sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', target: 'shivam' } }).state
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state // reveal
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state // scoreboard
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state // round two
    expect(state.roundIndex).toBe(1)
    expect(state.phase).toBe('message')

    const round = state.rounds[1]
    const guesser = players.find((p) => p.id !== round.authorPlayerId && p.id !== 'mike')!.id
    state = reduceWhoSaidIt(state, {
      type: 'input',
      playerId: guesser,
      payload: { kind: 'guess', target: round.author },
    }).state
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state
    expect(state.scores[guesser]).toBe(500)
    expect(state.scores.mike).toBe(500)
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

describe('a whole game from a raw export', () => {
  /** Written to look like what a real group produces: noise, reactions,
   *  media placeholders and a handful of lines worth putting on screen. */
  const EXPORT = [
    '[12/01/24, 9:40:00 PM] Messages and calls are end-to-end encrypted.',
    ...['shivam', 'riya', 'kushagra'].flatMap((name, a) =>
      Array.from({ length: 8 }, (_, i) => [
        `[12/01/24, 9:4${i}:0${a} PM] ${name}: ok`,
        `[12/01/24, 9:4${i}:1${a} PM] ${name}: <Media omitted>`,
        `[12/01/24, 9:4${i}:2${a} PM] ${name}: I genuinely cannot believe the ${'very '.repeat(i % 3)}wrong month got booked again, take ${a}${i}`,
      ]).flat()
    ),
  ].join('\n')

  it('parses, builds ten rounds and plays them all out', () => {
    const parsed = parseWhatsAppExport(EXPORT)
    const state = initWhoSaidIt(players, {
      messages: parsed,
      // Only two of the three authors turned up, and Emily is in the lobby
      // without ever having written in the chat.
      authors: { shivam: author('sam'), riya: author('mike'), kushagra: author(null) },
    })

    expect(state.problem).toBeNull()
    expect(state.rounds).toHaveLength(10)
    for (const round of state.rounds) {
      expect(round.text).not.toBe('ok')
      expect(round.text).not.toContain('Media omitted')
      expect(round.candidates).toEqual(['shivam', 'riya', 'kushagra'])
    }

    let playing = state
    let guard = 0
    while (playing.phase !== 'ended' && guard++ < 200) {
      if (playing.phase === 'message') {
        // Emily always blames Kushagra, who is not even in the room.
        playing = reduceWhoSaidIt(playing, {
          type: 'input',
          playerId: 'emily',
          payload: { kind: 'guess', target: 'kushagra' },
        }).state
      }
      playing = reduceWhoSaidIt(playing, { type: 'deadline' }).state
    }

    const kushagraRounds = state.rounds.filter((r) => r.author === 'kushagra').length
    expect(kushagraRounds).toBeGreaterThan(0)
    expect(playing.phase).toBe('ended')
    expect(playing.scores.emily).toBe(kushagraRounds * 500)
  })
})
