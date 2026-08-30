// lib/games/telephone/views.ts
import type { Player, PlayerId } from '@/lib/types'
import { chainForPlayer } from './chains'
import { beatsInChain, playerIndexOf, type Phase, type TelephoneState } from './state'

/** One step of the reveal: a sentence, or the picture it turned into. */
export type Beat =
  | { kind: 'text'; text: string; authorName: string; color: string }
  | { kind: 'image'; imageUrl: string; failed: boolean; authorName: string; color: string }

export type TelephoneHostView = {
  phase: Phase
  players: Player[]
  stepIndex: number
  steps: number
  /** Progress through the current step, for the drawing indicator. */
  submitted: number
  drawn: number
  total: number
  /** Who the room is still waiting on. Empty once everyone has acted. */
  waitingOn: string[]
  reveal: {
    chainNumber: number
    chainCount: number
    starterName: string
    /** Every beat up to and including the current one, so the trail builds. */
    beats: Beat[]
    beat: number
    totalBeats: number
  } | null
  voteCount: number
  chainLabels: { index: number; starterName: string; color: string; thumbnail: string | null }[]
  winners: number[]
  /** How far the winning chains actually drifted. Null until the game ends. */
  finale: { chainIndex: number; starterName: string; first: string; last: string; votes: number }[] | null
  /**
   * Every chain in full, once the game is over, so the room can go back and
   * walk through the ones they missed. Null until then: mid game these beats
   * are exactly what players must not see.
   */
  archive:
    | { chainIndex: number; starterName: string; votes: number; beats: Beat[] }[]
    | null
  awarded: Record<PlayerId, number>
  scores: Record<PlayerId, number>
}

export type TelephonePlayerView = {
  phase: Phase
  action: 'write' | 'describe' | 'drawing' | 'vote' | 'wait'
  /** The picture you must describe. Null in the opening step and elsewhere. */
  sourceImage: string | null
  myText: string | null
  /**
   * Set only on the phone that just submitted, and only while its picture is
   * still missing. The phone posts it to /api/image and sends the url back.
   * `pendingKey` makes that fire exactly once per step.
   */
  pendingPrompt: string | null
  pendingKey: string | null
  maxTextLength: number
  voteOptions: { index: number; starterName: string; color: string; thumbnail: string | null }[]
  myVote: number | null
  myScore: number
  drawn: number
  total: number
}

/**
 * Thumbnails are the opening picture of every chain, which is exactly the
 * information a player must not have while they are guessing at a later
 * picture in that same chain. So the labels exist only once all the guessing
 * is over, and are empty in every other phase.
 */
function chainLabels(state: TelephoneState) {
  if (state.phase !== 'vote' && state.phase !== 'ended') return []
  return state.chains.map((chain) => {
    const starter = state.players.find((p) => p.id === chain.starterId)!
    return {
      index: chain.index,
      starterName: starter.name,
      color: starter.color,
      thumbnail: chain.entries[0]?.imageUrl ?? null,
    }
  })
}

function beatsUpTo(state: TelephoneState, chainIndex: number, beat: number): Beat[] {
  const chain = state.chains[chainIndex]
  const out: Beat[] = []

  for (let b = 0; b <= beat && b < beatsInChain(chain); b++) {
    const entry = chain.entries[Math.floor(b / 2)]
    const author = state.players.find((p) => p.id === entry.playerId)
    const authorName = author?.name ?? '?'
    const color = author?.color ?? '#888888'

    out.push(
      b % 2 === 0
        ? { kind: 'text', text: entry.text, authorName, color }
        : { kind: 'image', imageUrl: entry.imageUrl ?? '', failed: entry.failed, authorName, color }
    )
  }

  return out
}

function voteCounts(state: TelephoneState): number[] {
  const counts = state.chains.map(() => 0)
  for (const index of Object.values(state.votes)) counts[index] += 1
  return counts
}

function winningChains(state: TelephoneState): number[] {
  const counts = voteCounts(state)
  const best = Math.max(0, ...counts)
  if (best === 0) return []
  return state.chains.filter((c) => counts[c.index] === best).map((c) => c.index)
}

export function telephoneHostView(state: TelephoneState): TelephoneHostView {
  const submitted = state.chains.filter((c) => c.entries.length > state.stepIndex).length
  const drawn = state.chains.filter((c) => c.entries[state.stepIndex]?.imageUrl != null).length

  const acting = state.phase === 'write' || state.phase === 'describe' || state.phase === 'drawing'
  const waitingOn = acting
    ? state.players.filter((_, playerIndex) => {
        const chain = state.chains[chainForPlayer(playerIndex, state.stepIndex, state.players.length)]
        return chain.entries[state.stepIndex]?.imageUrl == null
      }).map((p) => p.name)
    : []

  return {
    phase: state.phase,
    players: state.players,
    stepIndex: state.stepIndex,
    steps: state.steps,
    submitted,
    drawn,
    total: state.chains.length,
    waitingOn,
    reveal:
      state.phase === 'reveal'
        ? {
            chainNumber: state.reveal.chainIndex + 1,
            chainCount: state.chains.length,
            starterName:
              state.players.find((p) => p.id === state.chains[state.reveal.chainIndex].starterId)?.name ?? '?',
            beats: beatsUpTo(state, state.reveal.chainIndex, state.reveal.beat),
            beat: state.reveal.beat,
            totalBeats: beatsInChain(state.chains[state.reveal.chainIndex]),
          }
        : null,
    voteCount: Object.keys(state.votes).length,
    chainLabels: chainLabels(state),
    winners: state.phase === 'ended' ? winningChains(state) : [],
    finale:
      state.phase === 'ended'
        ? winningChains(state).map((chainIndex) => {
            const chain = state.chains[chainIndex]
            return {
              chainIndex,
              starterName: state.players.find((p) => p.id === chain.starterId)?.name ?? '?',
              first: chain.entries[0]?.text ?? '',
              last: chain.entries[chain.entries.length - 1]?.text ?? '',
              votes: voteCounts(state)[chainIndex],
            }
          })
        : null,
    archive:
      state.phase === 'ended'
        ? state.chains.map((chain) => ({
            chainIndex: chain.index,
            starterName: state.players.find((p) => p.id === chain.starterId)?.name ?? '?',
            votes: voteCounts(state)[chain.index],
            beats: beatsUpTo(state, chain.index, beatsInChain(chain) - 1),
          }))
        : null,
    awarded: state.awarded,
    scores: state.scores,
  }
}

export function telephonePlayerView(state: TelephoneState, playerId: PlayerId): TelephonePlayerView {
  const playerIndex = playerIndexOf(state, playerId)
  const options = chainLabels(state).filter((c) => c.index !== playerIndex)

  if (playerIndex < 0) {
    return {
      phase: state.phase,
      action: 'wait',
      sourceImage: null,
      myText: null,
      pendingPrompt: null,
      pendingKey: null,
      maxTextLength: state.config.maxTextLength,
      voteOptions: options,
      myVote: null,
      myScore: 0,
      drawn: 0,
      total: state.chains.length,
    }
  }

  const chain = state.chains[chainForPlayer(playerIndex, state.stepIndex, state.players.length)]
  const mine = chain.entries[state.stepIndex] ?? null
  const drawn = state.chains.filter((c) => c.entries[state.stepIndex]?.imageUrl != null).length

  // The previous entry in this chain is the picture you have to interpret. You
  // never see the sentence behind it, only what the model made of it.
  const previous = state.stepIndex > 0 ? chain.entries[state.stepIndex - 1] : null

  const writing = state.phase === 'write' || state.phase === 'describe'
  let action: TelephonePlayerView['action'] = 'wait'
  if (state.phase === 'vote') action = 'vote'
  else if (mine !== null && mine.imageUrl === null) action = 'drawing'
  else if (writing && mine === null) action = state.stepIndex === 0 ? 'write' : 'describe'

  return {
    phase: state.phase,
    action,
    sourceImage: writing && mine === null && previous ? previous.imageUrl : null,
    myText: mine?.text ?? null,
    pendingPrompt: mine && mine.imageUrl === null ? mine.text : null,
    pendingKey: mine && mine.imageUrl === null ? `${chain.index}:${state.stepIndex}` : null,
    maxTextLength: state.config.maxTextLength,
    voteOptions: options,
    myVote: state.votes[playerId] ?? null,
    myScore: state.scores[playerId] ?? 0,
    drawn,
    total: state.chains.length,
  }
}
