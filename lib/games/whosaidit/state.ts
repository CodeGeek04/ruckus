// lib/games/whosaidit/state.ts
import type { Player, PlayerId } from '@/lib/types'
import type { ChatMessage } from './parse'

export type Phase = 'message' | 'reveal' | 'scoreboard' | 'ended'

/**
 * A chat author, identified by the name WhatsApp exported. Authors are the
 * answers now, so this is the key that travels through state, views and inputs.
 * Most of them never join the game.
 */
export type AuthorKey = string

export type WhoSaidItInput = { kind: 'guess'; target: AuthorKey }

export type Round = {
  /** The real message, verbatim. Public: it goes on the shared screen. */
  text: string
  /** The chat author who wrote it. Secret until the reveal. */
  author: AuthorKey
  /**
   * The lobby player that author was linked to, when there is one. Its only
   * job is to let that person sit the round out. Null when the author is not
   * in the room, which is the common case.
   */
  authorPlayerId: PlayerId | null
  /** Who could have sent it. The real author is always among them. */
  candidates: AuthorKey[]
  guesses: Record<PlayerId, AuthorKey>
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
  /**
   * Chat author -> the lobby player they are, for the authors the host linked.
   * Never public: it would name the answer before the reveal.
   */
  links: Record<AuthorKey, PlayerId>
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
 * guess your own message, so you are never the reason a round stalls. When the
 * author never joined the game, nobody sits out.
 */
export function guessers(state: WhoSaidItState, round: Round): Player[] {
  return state.players.filter((p) => p.id !== round.authorPlayerId)
}

/**
 * What the lobby decided about one chat author: whether they are on the answer
 * board at all, and which lobby player they are, if any. The link is optional
 * and buys exactly one thing: that player skips their own messages.
 */
export type AuthorEntry = {
  included: boolean
  playerId: PlayerId | null
}

/**
 * What the lobby hands the game: the parsed chat plus a decision per author.
 * This never crosses the wire; it lives in the host tab only.
 */
export type ChatSource = {
  messages: ChatMessage[]
  authors: Record<AuthorKey, AuthorEntry>
}
