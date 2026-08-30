// lib/games/whosaidit/reduce.ts
import type { Command, GameEvent, Player, PlayerId, Reduced } from '@/lib/types'
import { authorStats, chooseRoundMessages } from './parse'
import {
  DEFAULT_CONFIG,
  type AuthorKey,
  type ChatSource,
  type Phase,
  type Round,
  type WhoSaidItConfig,
  type WhoSaidItInput,
  type WhoSaidItState,
} from './state'

/** +500 for a correct guess. That is the whole scoring model. */
export function scoreRound(round: Round, config: WhoSaidItConfig): Record<PlayerId, number> {
  const awarded: Record<PlayerId, number> = {}
  for (const [guesserId, target] of Object.entries(round.guesses)) {
    if (target === round.author) awarded[guesserId] = config.scoring.correctGuess
  }
  return awarded
}

/**
 * The reveal flourish: when the room converges on the same wrong person, that
 * is funnier than the right answer and the screen says so. Null means the
 * wrong answers were scattered, which is not worth a callout.
 */
export function mostFooledBy(
  round: Round,
  config: WhoSaidItConfig
): { authors: AuthorKey[]; count: number } | null {
  const counts = new Map<AuthorKey, number>()
  for (const [, target] of Object.entries(round.guesses)) {
    if (target === round.author) continue
    counts.set(target, (counts.get(target) ?? 0) + 1)
  }
  if (counts.size === 0) return null

  const count = Math.max(...counts.values())
  if (count < config.mostFooledMinVotes) return null
  return { authors: [...counts.entries()].filter(([, n]) => n === count).map(([a]) => a), count }
}

/**
 * A round needs at least three candidates. With two, whoever is not the author
 * has exactly one name left to tap, which is not a guess.
 */
export const MIN_CANDIDATES = 3

export function buildRounds(
  players: readonly Player[],
  source: ChatSource,
  config: WhoSaidItConfig
): { rounds: Round[]; links: Record<AuthorKey, PlayerId>; problem: string | null } {
  const playerIds = new Set(players.map((p) => p.id))

  // Candidates are chat authors, in the order the lobby lists them, whether or
  // not they turned up to play. Guessing somebody who is not in the room is the
  // point: the whole group chat is fair game.
  //
  // Derived from the messages rather than from the stored record, with the
  // record acting only as an override. The lobby shows an author with no stored
  // entry as included, so reading the record alone disagreed with the screen:
  // a stale or partial record rendered ten ticked authors and counted zero.
  // Record order first, so the board matches the lobby list, then any author
  // present in the chat but missing from the record (a stale or partial cache).
  const recorded = Object.keys(source.authors)
  const fromMessages = authorStats(source.messages).map((stat) => stat.author)
  const eligible = [...recorded, ...fromMessages.filter((a) => !recorded.includes(a))]

  const candidates = eligible.filter((author) => source.authors[author]?.included !== false)

  // A link to somebody who left the lobby between the upload and the start is
  // dropped: it would silence a player who is no longer there.
  const linked = new Map<AuthorKey, PlayerId>()
  for (const author of candidates) {
    const playerId = source.authors[author]?.playerId ?? null
    if (playerId && playerIds.has(playerId)) linked.set(author, playerId)
  }

  const links = Object.fromEntries(linked)

  if (candidates.length < MIN_CANDIDATES) {
    return {
      rounds: [],
      links,
      problem: `Include at least three chat authors. Right now only ${candidates.length} would be on screen, so there is nothing to guess.`,
    }
  }

  const picked = chooseRoundMessages(source.messages, {
    authors: candidates,
    count: config.rounds,
  })

  if (picked.length === 0) {
    return {
      rounds: [],
      links,
      problem: 'No usable messages in that export. Everything was too short, a reaction, a link, or gave the answer away by naming somebody.',
    }
  }

  return {
    rounds: picked.map((message) => ({
      text: message.text,
      author: message.author,
      authorPlayerId: linked.get(message.author) ?? null,
      candidates,
      guesses: {},
      awarded: {},
    })),
    links,
    problem: null,
  }
}

export function initWhoSaidIt(
  players: Player[],
  source: ChatSource,
  config: WhoSaidItConfig = DEFAULT_CONFIG
): WhoSaidItState {
  const { rounds, links, problem } = buildRounds(players, source, config)
  const scores: Record<PlayerId, number> = {}
  for (const p of players) scores[p.id] = 0

  return {
    phase: rounds.length > 0 ? 'message' : 'ended',
    players,
    config,
    roundIndex: 0,
    rounds,
    links,
    scores,
    problem,
  }
}

const timer = (state: WhoSaidItState, phase: Exclude<Phase, 'ended'>): Command => ({
  kind: 'timer',
  ms: state.config.durations[phase],
})

function withRound(state: WhoSaidItState, round: Round): WhoSaidItState {
  const rounds = [...state.rounds]
  rounds[state.roundIndex] = round
  return { ...state, rounds }
}

function enterReveal(state: WhoSaidItState): Reduced<WhoSaidItState> {
  const round = state.rounds[state.roundIndex]
  const awarded = scoreRound(round, state.config)

  const scores = { ...state.scores }
  for (const [playerId, points] of Object.entries(awarded)) {
    scores[playerId] = (scores[playerId] ?? 0) + points
  }

  return {
    state: { ...withRound({ ...state, scores }, { ...round, awarded }), phase: 'reveal' },
    commands: [timer(state, 'reveal'), { kind: 'sound', name: 'reveal' }],
  }
}

function nextRound(state: WhoSaidItState): Reduced<WhoSaidItState> {
  const nextIndex = state.roundIndex + 1
  if (nextIndex >= state.rounds.length) {
    return { state: { ...state, phase: 'ended' }, commands: [{ kind: 'sound', name: 'ended' }] }
  }
  return {
    state: { ...state, roundIndex: nextIndex, phase: 'message' },
    commands: [timer(state, 'message')],
  }
}

function advance(state: WhoSaidItState): Reduced<WhoSaidItState> {
  if (state.rounds.length === 0) return { state: { ...state, phase: 'ended' } }

  switch (state.phase) {
    case 'message':
      return enterReveal(state)
    case 'reveal':
      return { state: { ...state, phase: 'scoreboard' }, commands: [timer(state, 'scoreboard')] }
    case 'scoreboard':
      return nextRound(state)
    case 'ended':
      return { state }
  }
}

function applyInput(
  state: WhoSaidItState,
  playerId: PlayerId,
  input: WhoSaidItInput
): Reduced<WhoSaidItState> {
  if (state.phase !== 'message' || input.kind !== 'guess') return { state }
  // Only people in the game guess. An outsider's guess would have been scored.
  if (!state.players.some((p) => p.id === playerId)) return { state }

  const round = state.rounds[state.roundIndex]
  if (!round) return { state }
  if (!round.candidates.includes(input.target)) return { state }

  const guesses = { ...round.guesses, [playerId]: input.target }
  const updated = withRound(state, { ...round, guesses })

  // Everyone, the author included: they are guessing like everybody else.
  const everyoneGuessed = state.players.every((p) => guesses[p.id] !== undefined)

  return everyoneGuessed ? enterReveal(updated) : { state: updated }
}

export function reduceWhoSaidIt(
  state: WhoSaidItState,
  event: GameEvent<WhoSaidItInput>
): Reduced<WhoSaidItState> {
  switch (event.type) {
    case 'deadline':
    case 'hostAdvance':
      return advance(state)
    case 'input':
      return applyInput(state, event.playerId, event.payload)
  }
}
