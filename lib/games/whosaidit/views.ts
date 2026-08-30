// lib/games/whosaidit/views.ts
import type { Player, PlayerId } from '@/lib/types'
import { mostFooledBy } from './reduce'
import type { Phase, WhoSaidItState } from './state'

export type WhoSaidItHostView = {
  phase: Phase
  players: Player[]
  roundNumber: number
  totalRounds: number
  /** The message itself is public: it is the whole point of the round. */
  message: string | null
  /** Who could have sent it, in lobby order. */
  candidates: Player[]
  guessedCount: number
  expectedGuesses: number
  /** Null until the reveal. This is the answer. */
  authorId: PlayerId | null
  /** Null until the reveal: who guessed what stays hidden while people guess. */
  guesses: Record<PlayerId, PlayerId> | null
  correctIds: PlayerId[]
  mostFooled: { playerIds: PlayerId[]; count: number } | null
  awarded: Record<PlayerId, number>
  scores: Record<PlayerId, number>
  /** Why there is no game, when the host started without a usable export. */
  problem: string | null
}

export type WhoSaidItPlayerView = {
  phase: Phase
  action: 'guess' | 'wait'
  roundNumber: number
  totalRounds: number
  /** Mirrored to the phone because Discord compression makes long text unreadable. */
  message: string | null
  /** Only this phone is told. The host view must never carry it. */
  isAuthor: boolean
  /** Everyone it could have been, minus you: you know you did not write it. */
  candidates: Player[]
  myGuess: PlayerId | null
  /** Null until the reveal. */
  authorName: string | null
  wasCorrect: boolean | null
  myScore: number
  problem: string | null
}

function revealed(phase: Phase): boolean {
  return phase === 'reveal' || phase === 'scoreboard' || phase === 'ended'
}

export function whoSaidItHostView(state: WhoSaidItState): WhoSaidItHostView {
  const round = state.rounds[state.roundIndex] ?? null
  const show = revealed(state.phase)

  if (!round) {
    return {
      phase: state.phase,
      players: state.players,
      roundNumber: 0,
      totalRounds: state.rounds.length,
      message: null,
      candidates: [],
      guessedCount: 0,
      expectedGuesses: 0,
      authorId: null,
      guesses: null,
      correctIds: [],
      mostFooled: null,
      awarded: {},
      scores: state.scores,
      problem: state.problem,
    }
  }

  const byId = new Map(state.players.map((p) => [p.id, p]))
  const guessEntries = Object.entries(round.guesses)

  return {
    phase: state.phase,
    players: state.players,
    roundNumber: state.roundIndex + 1,
    totalRounds: state.rounds.length,
    message: round.text,
    candidates: round.candidateIds.map((id) => byId.get(id)).filter((p): p is Player => Boolean(p)),
    guessedCount: guessEntries.length,
    expectedGuesses: state.players.filter((p) => p.id !== round.authorId).length,
    authorId: show ? round.authorId : null,
    guesses: show ? round.guesses : null,
    correctIds: show ? guessEntries.filter(([, t]) => t === round.authorId).map(([g]) => g) : [],
    mostFooled: show ? mostFooledBy(round, state.config) : null,
    awarded: round.awarded,
    scores: state.scores,
    problem: state.problem,
  }
}

export function whoSaidItPlayerView(state: WhoSaidItState, playerId: PlayerId): WhoSaidItPlayerView {
  const round = state.rounds[state.roundIndex] ?? null
  const show = round ? revealed(state.phase) : false
  const isAuthor = round ? playerId === round.authorId : false
  const byId = new Map(state.players.map((p) => [p.id, p]))

  return {
    phase: state.phase,
    action: round && state.phase === 'message' && !isAuthor ? 'guess' : 'wait',
    roundNumber: round ? state.roundIndex + 1 : 0,
    totalRounds: state.rounds.length,
    message: round ? round.text : null,
    isAuthor,
    candidates: round
      ? round.candidateIds
          .filter((id) => id !== playerId)
          .map((id) => byId.get(id))
          .filter((p): p is Player => Boolean(p))
      : [],
    myGuess: round ? round.guesses[playerId] ?? null : null,
    authorName: show && round ? byId.get(round.authorId)?.name ?? null : null,
    wasCorrect: show && round && !isAuthor ? round.guesses[playerId] === round.authorId : null,
    myScore: state.scores[playerId] ?? 0,
    problem: state.problem,
  }
}
