// lib/games/whosaidit/reduce.ts
import type { Command, GameEvent, Player, PlayerId, Reduced } from '@/lib/types'
import { chooseRoundMessages } from './parse'
import {
  DEFAULT_CONFIG,
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
  for (const [guesserId, targetId] of Object.entries(round.guesses)) {
    if (guesserId === round.authorId) continue
    if (targetId === round.authorId) awarded[guesserId] = config.scoring.correctGuess
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
): { playerIds: PlayerId[]; count: number } | null {
  const counts = new Map<PlayerId, number>()
  for (const [guesserId, targetId] of Object.entries(round.guesses)) {
    if (guesserId === round.authorId) continue
    if (targetId === round.authorId) continue
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1)
  }
  if (counts.size === 0) return null

  const count = Math.max(...counts.values())
  if (count < config.mostFooledMinVotes) return null
  return { playerIds: [...counts.entries()].filter(([, n]) => n === count).map(([id]) => id), count }
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
): { rounds: Round[]; problem: string | null } {
  const playerIds = new Set(players.map((p) => p.id))

  // Author name -> player id, keeping only mappings that point at somebody
  // still in the lobby. A player who left between the upload and the start
  // must not become an unanswerable option.
  const mapped = new Map<string, PlayerId>()
  for (const [author, playerId] of Object.entries(source.mapping)) {
    if (playerId && playerIds.has(playerId)) mapped.set(author, playerId)
  }

  // Lobby order, so the candidate list on every phone matches the lobby.
  const candidateIds = players.map((p) => p.id).filter((id) => [...mapped.values()].includes(id))

  if (candidateIds.length < MIN_CANDIDATES) {
    return {
      rounds: [],
      problem: `Map at least three chat authors to players. Right now only ${candidateIds.length} would be on screen, so there is nothing to guess.`,
    }
  }

  const picked = chooseRoundMessages(source.messages, {
    authors: [...mapped.keys()],
    count: config.rounds,
  })

  if (picked.length === 0) {
    return {
      rounds: [],
      problem: 'No usable messages in that export. Everything was too short, a reaction, a link, or gave the answer away by naming somebody.',
    }
  }

  return {
    rounds: picked.map((message) => ({
      text: message.text,
      authorId: mapped.get(message.author)!,
      candidateIds,
      guesses: {},
      awarded: {},
    })),
    problem: null,
  }
}

export function initWhoSaidIt(
  players: Player[],
  source: ChatSource,
  config: WhoSaidItConfig = DEFAULT_CONFIG
): WhoSaidItState {
  const { rounds, problem } = buildRounds(players, source, config)
  const scores: Record<PlayerId, number> = {}
  for (const p of players) scores[p.id] = 0

  return {
    phase: rounds.length > 0 ? 'message' : 'ended',
    players,
    config,
    roundIndex: 0,
    rounds,
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

  const round = state.rounds[state.roundIndex]
  if (!round) return { state }
  // You wrote it, so you are never asked, and you can never stall the round.
  if (playerId === round.authorId) return { state }
  if (!round.candidateIds.includes(input.targetId)) return { state }

  const guesses = { ...round.guesses, [playerId]: input.targetId }
  const updated = withRound(state, { ...round, guesses })

  const everyoneGuessed = state.players
    .filter((p) => p.id !== round.authorId)
    .every((p) => guesses[p.id] !== undefined)

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
