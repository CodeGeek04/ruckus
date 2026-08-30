// lib/games/whosaidit/state.ts
import type { Player, PlayerId } from '@/lib/types'
import type { ChatMessage } from './parse'

export type Phase = 'message' | 'reveal' | 'scoreboard' | 'ended'

export type WhoSaidItInput = { kind: 'guess'; targetId: PlayerId }

export type Round = {
  /** The real message, verbatim. Public: it goes on the shared screen. */
  text: string
  /** The lobby player the chat author was mapped to. Secret until the reveal. */
  authorId: PlayerId
  /** Who could have sent it. The real author is always among them. */
  candidateIds: PlayerId[]
  guesses: Record<PlayerId, PlayerId>
  /** Points for this round, filled in when entering the reveal. */
  awarded: Record<PlayerId, number>
}

export type WhoSaidItConfig = {
  scoring: {
    correctGuess: number
  }
  durations: Record<Exclude<Phase, 'ended'>, number>
  rounds: number
  /** How many people must land on the same wrong name before it is called out. */
  mostFooledMinVotes: number
}

export const DEFAULT_CONFIG: WhoSaidItConfig = {
  scoring: {
    correctGuess: 500,
  },
  durations: {
    message: 30000,
    reveal: 15000,
    scoreboard: 8000,
  },
  rounds: 10,
  mostFooledMinVotes: 2,
}

export type WhoSaidItState = {
  phase: Phase
  players: Player[]
  config: WhoSaidItConfig
  roundIndex: number
  rounds: Round[]
  scores: Record<PlayerId, number>
  /**
   * Why there is no game, when there is no game. Set when the host started
   * without a usable chat import; the reducer cannot throw and the host screen
   * has to be able to say what went wrong.
   */
  problem: string | null
}

export function currentRound(state: WhoSaidItState): Round | null {
  return state.rounds[state.roundIndex] ?? null
}

/**
 * Everyone except the person who actually wrote it. You are never asked to
 * guess your own message, so you are never the reason a round stalls.
 */
export function guessers(state: WhoSaidItState, round: Round): Player[] {
  return state.players.filter((p) => p.id !== round.authorId)
}

/**
 * What the lobby hands the game: the parsed chat plus a decision, per chat
 * author, about which lobby player they are. `null` means ignore them.
 * This never crosses the wire; it lives in the host tab only.
 */
export type ChatSource = {
  messages: ChatMessage[]
  mapping: Record<string, PlayerId | null>
}
