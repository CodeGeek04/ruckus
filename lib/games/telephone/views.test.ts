import { describe, expect, it } from 'vitest'
import type { Player } from '@/lib/types'
import { chainForPlayer } from './chains'
import { initTelephone, reduceTelephone } from './reduce'
import type { TelephoneState } from './state'
import { telephoneHostView, telephonePlayerView } from './views'

const players: Player[] = [
  { id: 'sam', name: 'Sam', color: '#ef4444', connected: true },
  { id: 'mike', name: 'Mike', color: '#22c55e', connected: true },
  { id: 'ron', name: 'Ron', color: '#3b82f6', connected: true },
  { id: 'emily', name: 'Emily', color: '#eab308', connected: true },
]

const ids = players.map((p) => p.id)
const url = (n: number) => `https://abc123.public.blob.vercel-storage.com/telephone/${n}.jpg`

function runStep(state: TelephoneState, prefix: string): TelephoneState {
  let next = ids.reduce(
    (acc, id, i) => reduceTelephone(acc, { type: 'input', playerId: id, payload: { kind: 'submit', text: `${prefix}-${i}` } }).state,
    state
  )
  next = ids.reduce(
    (acc, id, i) =>
      reduceTelephone(acc, {
        type: 'input',
        playerId: id,
        // Addressed to the slot the player was given, so a late picture still lands.
        payload: {
          kind: 'image',
          url: url(i),
          key: `${chainForPlayer(i, acc.stepIndex, ids.length)}:${acc.stepIndex}`,
        },
      }).state,
    next
  )
  return next
}

function atReveal() {
  let state = initTelephone(players)
  for (let step = 0; step < 4; step++) state = runStep(state, `s${step}`)
  return state
}

describe('telephoneHostView', () => {
  it('reports progress through the current step', () => {
    let state = initTelephone(players)
    expect(telephoneHostView(state)).toMatchObject({ submitted: 0, drawn: 0, total: 4 })

    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'submit', text: 'a' } }).state
    expect(telephoneHostView(state)).toMatchObject({ submitted: 1, drawn: 0 })

    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'image', url: url(0), key: '0:0' } }).state
    expect(telephoneHostView(state)).toMatchObject({ submitted: 1, drawn: 1 })
  })

  it('names who the room is still waiting on', () => {
    let state = initTelephone(players)
    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'submit', text: 'a' } }).state
    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'image', url: url(0), key: '0:0' } }).state
    expect(telephoneHostView(state).waitingOn).toEqual(['Mike', 'Ron', 'Emily'])
  })

  it('shows nothing of the reveal until the reveal', () => {
    const state = initTelephone(players)
    expect(telephoneHostView(state).reveal).toBeNull()
  })

  it('builds the trail one beat at a time, and never runs ahead', () => {
    let state = atReveal()
    const first = telephoneHostView(state).reveal!
    expect(first.chainNumber).toBe(1)
    expect(first.totalBeats).toBe(8)
    expect(first.beats).toHaveLength(1)
    expect(first.beats[0]).toMatchObject({ kind: 'text', text: 's0-0', authorName: 'Sam' })

    state = reduceTelephone(state, { type: 'hostAdvance' }).state
    const second = telephoneHostView(state).reveal!
    expect(second.beats).toHaveLength(2)
    expect(second.beats[1]).toMatchObject({ kind: 'image', imageUrl: url(0), failed: false })
  })

  it('alternates sentence and picture all the way down a chain', () => {
    let state = atReveal()
    for (let i = 0; i < 7; i++) state = reduceTelephone(state, { type: 'hostAdvance' }).state
    const beats = telephoneHostView(state).reveal!.beats
    expect(beats.map((b) => b.kind)).toEqual([
      'text', 'image', 'text', 'image', 'text', 'image', 'text', 'image',
    ])
  })

  it('declares the winner only once the game has ended', () => {
    let state = atReveal()
    for (let i = 0; i < 4 * 8; i++) state = reduceTelephone(state, { type: 'hostAdvance' }).state
    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'vote', chainIndex: 2 } }).state
    expect(telephoneHostView(state).winners).toEqual([])

    state = reduceTelephone(state, { type: 'deadline' }).state
    expect(telephoneHostView(state).winners).toEqual([2])
  })
})

describe('telephonePlayerView', () => {
  it('gives the opening step a blank page, with no picture to lean on', () => {
    const view = telephonePlayerView(initTelephone(players), 'sam')
    expect(view.action).toBe('write')
    expect(view.sourceImage).toBeNull()
  })

  it('shows the previous picture, and only the picture, in a describe step', () => {
    const state = runStep(initTelephone(players), 's0')
    // Mike is player 1, so at step 1 they take over chain 2, which Ron opened.
    const view = telephonePlayerView(state, 'mike')
    expect(view.action).toBe('describe')
    expect(view.sourceImage).toBe(url(2))
    // The sentence behind that picture is nowhere in the view.
    expect(JSON.stringify(view)).not.toContain('s0-2')
  })

  it('hands the writer their own prompt back so their phone can draw it', () => {
    const state = reduceTelephone(initTelephone(players), {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'submit', text: 'a goose in court' },
    }).state
    const view = telephonePlayerView(state, 'sam')
    expect(view.action).toBe('drawing')
    expect(view.pendingPrompt).toBe('a goose in court')
    expect(view.pendingKey).toBe('0:0')
  })

  it('drops the pending prompt the moment the picture is in', () => {
    let state = reduceTelephone(initTelephone(players), {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'submit', text: 'a goose in court' },
    }).state
    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'image', url: url(0), key: '0:0' } }).state
    const view = telephonePlayerView(state, 'sam')
    expect(view.pendingPrompt).toBeNull()
    expect(view.pendingKey).toBeNull()
    expect(view.action).toBe('wait')
  })

  it('gives a fresh pending key every step, so the phone draws once per step', () => {
    const state = runStep(initTelephone(players), 's0')
    const next = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'submit', text: 'again' } }).state
    expect(telephonePlayerView(next, 'sam').pendingKey).toBe('1:1')
  })

  it('never offers a player their own chain to vote for', () => {
    let state = atReveal()
    for (let i = 0; i < 4 * 8; i++) state = reduceTelephone(state, { type: 'hostAdvance' }).state
    const view = telephonePlayerView(state, 'ron')
    expect(view.action).toBe('vote')
    expect(view.voteOptions.map((o) => o.index)).toEqual([0, 1, 3])
  })

  it('leaves a player with nothing to do only while they are genuinely waiting', () => {
    let state = initTelephone(players)
    expect(telephonePlayerView(state, 'emily').action).toBe('write')
    state = runStep(state, 's0')
    expect(telephonePlayerView(state, 'emily').action).toBe('describe')
  })
})

describe('what actually goes on the wire', () => {
  /**
   * Measured against the live API: a Gemini image is about 778 KB raw, which is
   * 1,037,535 characters as a base64 data url, and an AppSync event is rejected
   * with EventTooLargeException above 245,760 bytes. That is why the views carry
   * blob urls and never bytes. This test is the guard on that decision.
   */
  const APPSYNC_EVENT_LIMIT = 245_760

  function bigGame() {
    const twelve: Player[] = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      name: `Player${i}`,
      color: '#ef4444',
      connected: true,
    }))
    const everyone = twelve.map((p) => p.id)
    let state = initTelephone(twelve)

    for (let step = 0; step < state.steps; step++) {
      state = everyone.reduce(
        (acc, id) =>
          reduceTelephone(acc, {
            type: 'input',
            playerId: id,
            payload: { kind: 'submit', text: 'x'.repeat(state.config.maxTextLength) },
          }).state,
        state
      )
      state = everyone.reduce(
        (acc, id, i) =>
          reduceTelephone(acc, {
            type: 'input',
            playerId: id,
            // A real blob url, at its real length.
            payload: {
              kind: 'image',
              url: `https://9jjtbrppmjidkfkr.public.blob.vercel-storage.com/telephone/1788074013193-xROl2V55dOef02J6rghl${i}.jpg`,
              key: `${chainForPlayer(i, acc.stepIndex, everyone.length)}:${acc.stepIndex}`,
            },
          }).state,
        state
      )
    }
    return state
  }

  it('keeps every broadcast far inside the AppSync event limit', () => {
    let state = bigGame()
    let worst = 0
    let guard = 0

    while (state.phase !== 'ended' && guard++ < 500) {
      worst = Math.max(worst, JSON.stringify(telephoneHostView(state)).length)
      for (const player of state.players) {
        worst = Math.max(worst, JSON.stringify(telephonePlayerView(state, player.id)).length)
      }
      state = reduceTelephone(state, { type: 'deadline' }).state
    }
    worst = Math.max(worst, JSON.stringify(telephoneHostView(state)).length)

    expect(worst).toBeLessThan(APPSYNC_EVENT_LIMIT / 4)
  })

  it('never puts image bytes on the bus', () => {
    const state = bigGame()
    const wire = JSON.stringify(telephoneHostView(state))
    expect(wire).not.toContain(';base64,')
  })
})

describe('the finale', () => {
  it('shows how far the winning chain drifted', () => {
    let state = atReveal()
    for (let i = 0; i < 4 * 8; i++) state = reduceTelephone(state, { type: 'hostAdvance' }).state
    state = reduceTelephone(state, { type: 'input', playerId: 'sam', payload: { kind: 'vote', chainIndex: 3 } }).state
    state = reduceTelephone(state, { type: 'deadline' }).state

    const finale = telephoneHostView(state).finale!
    expect(finale).toHaveLength(1)
    expect(finale[0]).toMatchObject({ chainIndex: 3, starterName: 'Emily', first: 's0-3', votes: 1 })
    expect(finale[0].last).toBe(state.chains[3].entries[3].text)
  })

  it('is null while the game is still running', () => {
    expect(telephoneHostView(initTelephone(players)).finale).toBeNull()
  })
})

describe('what a phone is allowed to know mid-game', () => {
  it('offers no chain thumbnails while anyone is still guessing', () => {
    // The opening picture of a chain would give away the drift to whoever is
    // describing a later picture in that same chain.
    let state = initTelephone(players)
    expect(telephonePlayerView(state, 'sam').voteOptions).toEqual([])
    expect(telephoneHostView(state).chainLabels).toEqual([])

    state = runStep(state, 's0')
    expect(state.phase).toBe('describe')
    expect(telephonePlayerView(state, 'sam').voteOptions).toEqual([])
    expect(JSON.stringify(telephoneHostView(state))).not.toContain(url(0))
  })

  it('brings the thumbnails back for the vote', () => {
    let state = atReveal()
    for (let i = 0; i < 4 * 8; i++) state = reduceTelephone(state, { type: 'hostAdvance' }).state
    expect(telephonePlayerView(state, 'sam').voteOptions).toHaveLength(3)
    expect(telephoneHostView(state).chainLabels).toHaveLength(4)
  })
})
