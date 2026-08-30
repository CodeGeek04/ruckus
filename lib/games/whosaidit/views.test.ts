import { describe, expect, it } from 'vitest'
import type { Player } from '@/lib/types'
import type { ChatMessage } from './parse'
import { initWhoSaidIt, reduceWhoSaidIt } from './reduce'
import type { AuthorEntry, ChatSource } from './state'
import { whoSaidItHostView, whoSaidItPlayerView } from './views'

const players: Player[] = [
  { id: 'sam', name: 'Sam', color: '#ef4444', connected: true },
  { id: 'mike', name: 'Mike', color: '#22c55e', connected: true },
  { id: 'ron', name: 'Ron', color: '#3b82f6', connected: true },
  { id: 'emily', name: 'Emily', color: '#eab308', connected: true },
]

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

function withAuthor(name: string, playerId: string | null) {
  const state = initWhoSaidIt(players, source)
  return { ...state, rounds: state.rounds.map((r) => ({ ...r, author: name, authorPlayerId: playerId })) }
}

describe('whoSaidItHostView', () => {
  it('shows the message on the shared screen, because everyone has to read it', () => {
    expect(whoSaidItHostView(withAuthor('shivam', 'sam')).message).toContain('wrong month')
  })

  it('never names the author before the reveal', () => {
    const view = whoSaidItHostView(withAuthor('shivam', 'sam'))
    expect(view.author).toBeNull()
    expect(view.guesses).toBeNull()
    expect(view.correctIds).toEqual([])
    expect(view.mostFooled).toBeNull()
  })

  it('never leaks the author through any other field of the public view', () => {
    let state = withAuthor('shivam', 'sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', target: 'aman' } }).state
    const serialised = JSON.stringify(whoSaidItHostView(state))
    // The tally is public, the answer is not: nothing in the public payload may
    // single Shivam out while the room is still guessing.
    expect(JSON.parse(serialised).author).toBeNull()
    expect(JSON.parse(serialised).guesses).toBeNull()
  })

  it('never puts the author to player links on the public view', () => {
    const serialised = JSON.stringify(whoSaidItHostView(withAuthor('shivam', 'sam')))
    expect(JSON.parse(serialised).links).toBeUndefined()
  })

  it('reports progress without saying who guessed what', () => {
    let state = withAuthor('shivam', 'sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', target: 'aman' } }).state
    const view = whoSaidItHostView(state)
    expect(view.guessedCount).toBe(1)
    // Four, not three: the author answers too.
    expect(view.expectedGuesses).toBe(4)
    expect(view.guesses).toBeNull()
  })

  it('expects a guess from everyone when the author is not in the room', () => {
    expect(whoSaidItHostView(withAuthor('kushagra', null)).expectedGuesses).toBe(4)
  })

  it('reveals the author, the guesses and who got it right', () => {
    let state = withAuthor('shivam', 'sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', target: 'shivam' } }).state
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'ron', payload: { kind: 'guess', target: 'kushagra' } }).state
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'emily', payload: { kind: 'guess', target: 'kushagra' } }).state
    // Sam wrote it, and still has to answer like everybody else.
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'sam', payload: { kind: 'guess', target: 'riya' } }).state

    const view = whoSaidItHostView(state)
    expect(view.phase).toBe('reveal')
    expect(view.author).toBe('shivam')
    expect(view.guesses).toEqual({ mike: 'shivam', ron: 'kushagra', emily: 'kushagra', sam: 'riya' })
    expect(view.correctIds).toEqual(['mike'])
    expect(view.mostFooled).toEqual({ authors: ['kushagra'], count: 2 })
  })

  it('offers every included author as a candidate, playing or not', () => {
    const state = initWhoSaidIt(players, source)
    expect(whoSaidItHostView(state).candidates).toEqual(['shivam', 'riya', 'aman', 'kushagra'])
  })

  it('drops an excluded author from the board', () => {
    const state = initWhoSaidIt(players, {
      ...source,
      authors: { ...source.authors, kushagra: author(null, false) },
    })
    expect(whoSaidItHostView(state).candidates).toEqual(['shivam', 'riya', 'aman'])
  })

  it('carries the reason when there is no game to play', () => {
    const view = whoSaidItHostView(initWhoSaidIt(players, { messages: [], authors: {} }))
    expect(view.phase).toBe('ended')
    expect(view.problem).not.toBeNull()
    expect(view.message).toBeNull()
  })
})

describe('whoSaidItPlayerView', () => {
  it('mirrors the message to every phone, including the author', () => {
    const state = withAuthor('shivam', 'sam')
    expect(whoSaidItPlayerView(state, 'mike').message).toContain('wrong month')
    expect(whoSaidItPlayerView(state, 'sam').message).toContain('wrong month')
  })

  it('tells only the author that it is theirs', () => {
    const state = withAuthor('shivam', 'sam')
    expect(whoSaidItPlayerView(state, 'sam').isAuthor).toBe(true)
    expect(whoSaidItPlayerView(state, 'mike').isAuthor).toBe(false)
  })

  it('asks everyone to guess, the author included', () => {
    const state = withAuthor('shivam', 'sam')
    expect(whoSaidItPlayerView(state, 'sam').action).toBe('guess')
    expect(whoSaidItPlayerView(state, 'mike').action).toBe('guess')
  })

  it('asks the whole room when the author never joined', () => {
    const state = withAuthor('kushagra', null)
    for (const player of players) {
      expect(whoSaidItPlayerView(state, player.id).isAuthor).toBe(false)
      expect(whoSaidItPlayerView(state, player.id).action).toBe('guess')
    }
  })

  it('never names the author to a guesser before the reveal', () => {
    const state = withAuthor('shivam', 'sam')
    expect(whoSaidItPlayerView(state, 'mike').authorName).toBeNull()
    expect(whoSaidItPlayerView(state, 'mike').wasCorrect).toBeNull()
  })

  it('tells each guesser afterwards whether they got it', () => {
    let state = withAuthor('shivam', 'sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', target: 'shivam' } }).state
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'ron', payload: { kind: 'guess', target: 'kushagra' } }).state
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state

    expect(whoSaidItPlayerView(state, 'mike').wasCorrect).toBe(true)
    expect(whoSaidItPlayerView(state, 'mike').authorName).toBe('shivam')
    expect(whoSaidItPlayerView(state, 'ron').wasCorrect).toBe(false)
    expect(whoSaidItPlayerView(state, 'emily').wasCorrect).toBe(false)
    // Sam wrote it, did not answer in time, and is simply wrong like anyone else.
    expect(whoSaidItPlayerView(state, 'sam').wasCorrect).toBe(false)
  })

  it('keeps the viewer on their own list, so they can pick themselves', () => {
    // People forget what they typed. Voting for yourself has to be possible.
    const state = withAuthor('kushagra', null)
    expect(whoSaidItPlayerView(state, 'mike').candidates).toEqual([
      'shivam',
      'riya',
      'aman',
      'kushagra',
    ])
    expect(whoSaidItPlayerView(state, 'ron').candidates).toEqual([
      'shivam',
      'riya',
      'aman',
      'kushagra',
    ])
  })

  it('keeps every author on the list of a player nobody was linked to', () => {
    const state = withAuthor('kushagra', null)
    expect(whoSaidItPlayerView(state, 'emily').candidates).toEqual([
      'shivam',
      'riya',
      'aman',
      'kushagra',
    ])
  })

  it('still offers a real choice to every guesser', () => {
    const state = initWhoSaidIt(players, source)
    for (const player of players) {
      const view = whoSaidItPlayerView(state, player.id)
      if (view.action === 'guess') expect(view.candidates.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('reports the running score', () => {
    let state = withAuthor('shivam', 'sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', target: 'shivam' } }).state
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state
    expect(whoSaidItPlayerView(state, 'mike').myScore).toBe(500)
  })

  it('survives a game that never started', () => {
    const view = whoSaidItPlayerView(initWhoSaidIt(players, { messages: [], authors: {} }), 'mike')
    expect(view.action).toBe('wait')
    expect(view.message).toBeNull()
    expect(view.candidates).toEqual([])
  })
})
