// lib/games/hearsay/reduce.ts
import type { Command, GameEvent, Player, PlayerId, Reduced } from '@/lib/types'
import { pickQuestion } from './questions'
import { scoreRound } from './scoring'
import { buildAccusedOrder } from './rounds'
import {
  DEFAULT_CONFIG,
  type HearsayConfig,
  type HearsayInput,
  type HearsayState,
  type Phase,
  type Round,
} from './state'

function makeRound(
  accusedId: PlayerId,
  playerCount: number,
  config: HearsayConfig,
  usedQuestionIds: readonly string[]
): Round {
  const { question, options } = pickQuestion({
    tone: config.tone,
    voterCount: playerCount - 1,
    usedQuestionIds,
  })
  return { accusedId, question, options, votes: {}, predictions: {}, accusedPick: null, awarded: {} }
}

export function initHearsay(players: Player[], config: HearsayConfig = DEFAULT_CONFIG): HearsayState {
  const order = buildAccusedOrder(players.map((p) => p.id), config.minRounds)
  const scores: Record<PlayerId, number> = {}
  for (const p of players) scores[p.id] = 0

  return {
    phase: 'charge',
    players,
    config,
    order,
    roundIndex: 0,
    rounds: [makeRound(order[0], players.length, config, [])],
    scores,
    usedQuestionIds: [],
  }
}

const timer = (state: HearsayState, phase: Exclude<Phase, 'ended'>): Command => ({
  kind: 'timer',
  ms: state.config.durations[phase],
})

/** Replace the current round in place, leaving everything else alone. */
function withRound(state: HearsayState, round: Round): HearsayState {
  const rounds = [...state.rounds]
  rounds[state.roundIndex] = round
  return { ...state, rounds }
}

function enterVerdict(state: HearsayState): Reduced<HearsayState> {
  const round = state.rounds[state.roundIndex]
  const awarded = scoreRound(round, state.config)

  const scores = { ...state.scores }
  for (const [playerId, points] of Object.entries(awarded)) {
    scores[playerId] = (scores[playerId] ?? 0) + points
  }

  const scored = withRound({ ...state, scores }, { ...round, awarded })
  return {
    state: { ...scored, phase: 'verdict' },
    commands: [timer(state, 'verdict'), { kind: 'sound', name: 'verdict' }],
  }
}

function nextRound(state: HearsayState): Reduced<HearsayState> {
  const round = state.rounds[state.roundIndex]
  const usedQuestionIds = [...state.usedQuestionIds, round.question.id]

  const nextIndex = state.roundIndex + 1
  if (nextIndex >= state.order.length) {
    return { state: { ...state, usedQuestionIds, phase: 'ended' }, commands: [{ kind: 'sound', name: 'ended' }] }
  }

  return {
    state: {
      ...state,
      usedQuestionIds,
      roundIndex: nextIndex,
      phase: 'charge',
      rounds: [
        ...state.rounds,
        makeRound(state.order[nextIndex], state.players.length, state.config, usedQuestionIds),
      ],
    },
    commands: [timer(state, 'charge')],
  }
}

function advance(state: HearsayState): Reduced<HearsayState> {
  switch (state.phase) {
    case 'charge':
      return { state: { ...state, phase: 'testimony' }, commands: [timer(state, 'testimony')] }
    case 'testimony':
      return { state: { ...state, phase: 'evidence' }, commands: [timer(state, 'evidence'), { kind: 'sound', name: 'evidence' }] }
    case 'evidence':
      return { state: { ...state, phase: 'guess' }, commands: [timer(state, 'guess')] }
    case 'guess':
      return enterVerdict(state)
    case 'verdict':
      return { state: { ...state, phase: 'scoreboard' }, commands: [timer(state, 'scoreboard')] }
    case 'scoreboard':
      return nextRound(state)
    case 'ended':
      return { state }
  }
}

function applyInput(state: HearsayState, playerId: PlayerId, input: HearsayInput): Reduced<HearsayState> {
  // Somebody who is not in this game does not get a say. Their vote would have
  // been counted in the tally the room reads, and scoreRound would have paid
  // them for it.
  if (!state.players.some((p) => p.id === playerId)) return { state }

  const round = state.rounds[state.roundIndex]
  const isAccused = playerId === round.accusedId
  const voterIds = state.players.filter((p) => p.id !== round.accusedId).map((p) => p.id)

  if (state.phase === 'testimony' && input.kind === 'vote') {
    if (isAccused) return { state }

    const votes = { ...round.votes, [playerId]: input.targetId }
    const updated = withRound(state, { ...round, votes })
    const everyoneVoted = voterIds.every((id) => votes[id] !== undefined)
    return everyoneVoted ? advance(updated) : { state: updated }
  }

  if (state.phase === 'guess') {
    let updated = state

    if (input.kind === 'guess') {
      if (!isAccused) return { state }
      updated = withRound(state, { ...round, accusedPick: input.questionId })
    } else if (input.kind === 'predict') {
      if (isAccused) return { state }
      updated = withRound(state, { ...round, predictions: { ...round.predictions, [playerId]: input.willGetIt } })
    } else {
      return { state }
    }

    const current = updated.rounds[updated.roundIndex]
    const done = current.accusedPick !== null && voterIds.every((id) => current.predictions[id] !== undefined)
    return done ? enterVerdict(updated) : { state: updated }
  }

  return { state }
}

export function reduceHearsay(
  state: HearsayState,
  event: GameEvent<HearsayInput>
): Reduced<HearsayState> {
  switch (event.type) {
    case 'deadline':
    case 'hostAdvance':
      return advance(state)
    case 'input':
      return applyInput(state, event.playerId, event.payload)
  }
}
