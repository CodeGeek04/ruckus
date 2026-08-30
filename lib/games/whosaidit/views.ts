// lib/games/whosaidit/views.ts
import type { Player, PlayerId } from '@/lib/types'
import { mostFooledBy } from './reduce'
import type { AuthorKey, Phase, WhoSaidItState } from './state'

export type WhoSaidItHostView = {
  phase: Phase
  players: Player[]
  roundNumber: number
  totalRounds: number
  /** The message itself is public: it is the whole point of the round. */
  message: string | null
  /** Who could have sent it: chat authors, in lobby order. */
  candidates: AuthorKey[]
  guessedCount: number
  expectedGuesses: number
  /** Null until the reveal. This is the answer. */
  author: AuthorKey | null
  /** Null until the reveal: who guessed what stays hidden while people guess. */
  guesses: Record<PlayerId, AuthorKey> | null
  correctIds: PlayerId[]
  mostFooled: { authors: AuthorKey[]; count: number } | null
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
  candidates: AuthorKey[]
  myGuess: AuthorKey | null
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
      author: null,
      guesses: null,
      correctIds: [],
      mostFooled: null,
      awarded: {},
      scores: state.scores,
      problem: state.problem,
    }
  }

  const guessEntries = Object.entries(round.guesses)

  return {
    phase: state.phase,
    players: state.players,
    roundNumber: state.roundIndex + 1,
    totalRounds: state.rounds.length,
    message: round.text,
    candidates: round.candidates,
    guessedCount: guessEntries.length,
    expectedGuesses: state.players.filter((p) => p.id !== round.authorPlayerId).length,
    author: show ? round.author : null,
    guesses: show ? round.guesses : null,
    correctIds: show ? guessEntries.filter(([, t]) => t === round.author).map(([g]) => g) : [],
    mostFooled: show ? mostFooledBy(round, state.config) : null,
    awarded: round.awarded,
    scores: state.scores,
    problem: state.problem,
  }
}

export function whoSaidItPlayerView(state: WhoSaidItState, playerId: PlayerId): WhoSaidItPlayerView {
  const round = state.rounds[state.roundIndex] ?? null
  const show = round ? revealed(state.phase) : false
  const isAuthor = round ? playerId === round.authorPlayerId : false

  return {
    phase: state.phase,
    action: round && state.phase === 'message' && !isAuthor ? 'guess' : 'wait',
    roundNumber: round ? state.roundIndex + 1 : 0,
    totalRounds: state.rounds.length,
    message: round ? round.text : null,
    isAuthor,
    // Your own name comes off your list: you know you did not write it. Every
    // other author stays, including the ones who are not in the room.
    candidates: round ? round.candidates.filter((a) => state.links[a] !== playerId) : [],
    myGuess: round ? round.guesses[playerId] ?? null : null,
    authorName: show && round ? round.author : null,
    wasCorrect: show && round && !isAuthor ? round.guesses[playerId] === round.author : null,
    myScore: state.scores[playerId] ?? 0,
    problem: state.problem,
  }
}

