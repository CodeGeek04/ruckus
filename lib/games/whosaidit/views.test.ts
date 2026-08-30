import { describe, expect, it } from 'vitest'
import type { Player } from '@/lib/types'
import type { ChatMessage } from './parse'
import { initWhoSaidIt, reduceWhoSaidIt } from './reduce'
import type { ChatSource } from './state'
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

const source: ChatSource = {
  messages: [...messages('shivam', 6), ...messages('riya', 6), ...messages('aman', 6), ...messages('kabir', 6)],
  mapping: { shivam: 'sam', riya: 'mike', aman: 'ron', kabir: 'emily' },
}

function withAuthor(authorId: string) {
  const state = initWhoSaidIt(players, source)
  return { ...state, rounds: state.rounds.map((r) => ({ ...r, authorId })) }
}

describe('whoSaidItHostView', () => {
  it('shows the message on the shared screen, because everyone has to read it', () => {
    expect(whoSaidItHostView(withAuthor('sam')).message).toContain('wrong month')
  })

  it('never names the author before the reveal', () => {
    const view = whoSaidItHostView(withAuthor('sam'))
    expect(view.authorId).toBeNull()
    expect(view.guesses).toBeNull()
    expect(view.correctIds).toEqual([])
    expect(view.mostFooled).toBeNull()
  })

  it('never leaks the author through any other field of the public view', () => {
    let state = withAuthor('sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', targetId: 'ron' } }).state
    const serialised = JSON.stringify(whoSaidItHostView(state))
    // The tally is public, the answer is not: nothing in the public payload may
    // single Sam out while the room is still guessing.
    expect(JSON.parse(serialised).authorId).toBeNull()
    expect(JSON.parse(serialised).guesses).toBeNull()
  })

  it('reports progress without saying who guessed what', () => {
    let state = withAuthor('sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', targetId: 'ron' } }).state
    const view = whoSaidItHostView(state)
    expect(view.guessedCount).toBe(1)
    expect(view.expectedGuesses).toBe(3)
    expect(view.guesses).toBeNull()
  })

  it('reveals the author, the guesses and who got it right', () => {
    let state = withAuthor('sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', targetId: 'sam' } }).state
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'ron', payload: { kind: 'guess', targetId: 'emily' } }).state
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'emily', payload: { kind: 'guess', targetId: 'emily' } }).state

    const view = whoSaidItHostView(state)
    expect(view.phase).toBe('reveal')
    expect(view.authorId).toBe('sam')
    expect(view.guesses).toEqual({ mike: 'sam', ron: 'emily', emily: 'emily' })
    expect(view.correctIds).toEqual(['mike'])
    expect(view.mostFooled).toEqual({ playerIds: ['emily'], count: 2 })
  })

  it('offers only the mapped players as candidates', () => {
    const state = initWhoSaidIt(players, {
      ...source,
      mapping: { shivam: 'sam', riya: 'mike', aman: 'ron', kabir: null },
    })
    expect(whoSaidItHostView(state).candidates.map((p) => p.id)).toEqual(['sam', 'mike', 'ron'])
  })

  it('carries the reason when there is no game to play', () => {
    const view = whoSaidItHostView(initWhoSaidIt(players, { messages: [], mapping: {} }))
    expect(view.phase).toBe('ended')
    expect(view.problem).not.toBeNull()
    expect(view.message).toBeNull()
  })
})

describe('whoSaidItPlayerView', () => {
  it('mirrors the message to every phone, including the author', () => {
    const state = withAuthor('sam')
    expect(whoSaidItPlayerView(state, 'mike').message).toContain('wrong month')
    expect(whoSaidItPlayerView(state, 'sam').message).toContain('wrong month')
  })

  it('tells only the author that it is theirs', () => {
    const state = withAuthor('sam')
    expect(whoSaidItPlayerView(state, 'sam').isAuthor).toBe(true)
    expect(whoSaidItPlayerView(state, 'mike').isAuthor).toBe(false)
  })

  it('asks everyone but the author to guess', () => {
    const state = withAuthor('sam')
    expect(whoSaidItPlayerView(state, 'sam').action).toBe('wait')
    expect(whoSaidItPlayerView(state, 'mike').action).toBe('guess')
  })

  it('never names the author to a guesser before the reveal', () => {
    const state = withAuthor('sam')
    expect(whoSaidItPlayerView(state, 'mike').authorName).toBeNull()
    expect(whoSaidItPlayerView(state, 'mike').wasCorrect).toBeNull()
  })

  it('tells each guesser afterwards whether they got it', () => {
    let state = withAuthor('sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', targetId: 'sam' } }).state
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'ron', payload: { kind: 'guess', targetId: 'emily' } }).state
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state

    expect(whoSaidItPlayerView(state, 'mike').wasCorrect).toBe(true)
    expect(whoSaidItPlayerView(state, 'mike').authorName).toBe('Sam')
    expect(whoSaidItPlayerView(state, 'ron').wasCorrect).toBe(false)
    expect(whoSaidItPlayerView(state, 'emily').wasCorrect).toBe(false)
    expect(whoSaidItPlayerView(state, 'sam').wasCorrect).toBeNull()
  })

  it('leaves the viewer off their own list of candidates', () => {
    const state = withAuthor('sam')
    expect(whoSaidItPlayerView(state, 'mike').candidates.map((p) => p.id)).toEqual(['sam', 'ron', 'emily'])
    expect(whoSaidItPlayerView(state, 'ron').candidates.map((p) => p.id)).toEqual(['sam', 'mike', 'emily'])
  })

  it('still offers a real choice to the only other candidate', () => {
    const state = initWhoSaidIt(players, {
      ...source,
      mapping: { shivam: 'sam', riya: 'mike', aman: 'ron', kabir: null },
    })
    for (const player of players) {
      const view = whoSaidItPlayerView(state, player.id)
      if (view.action === 'guess') expect(view.candidates.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('reports the running score', () => {
    let state = withAuthor('sam')
    state = reduceWhoSaidIt(state, { type: 'input', playerId: 'mike', payload: { kind: 'guess', targetId: 'sam' } }).state
    state = reduceWhoSaidIt(state, { type: 'deadline' }).state
    expect(whoSaidItPlayerView(state, 'mike').myScore).toBe(500)
  })

  it('survives a game that never started', () => {
    const view = whoSaidItPlayerView(initWhoSaidIt(players, { messages: [], mapping: {} }), 'mike')
    expect(view.action).toBe('wait')
    expect(view.message).toBeNull()
    expect(view.candidates).toEqual([])
  })
})
