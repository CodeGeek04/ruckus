// lib/games/hearsay/views.ts
import type { Player, PlayerId } from '@/lib/types'
import { renderQuestion } from './questions'
import { topVoted, voteCounts } from './scoring'
import type { HearsayState, Phase } from './state'

export type HearsayHostView = {
  phase: Phase
  players: Player[]
  accusedId: PlayerId
  accusedName: string
  roundNumber: number
  totalRounds: number
  /** Null until the verdict. The accused is looking at this screen. */
  question: string | null
  voteCounts: Record<PlayerId, number>
  /** Null until the verdict: the tally shows counts, never who cast them. */
  voters: Record<PlayerId, PlayerId> | null
  topVoted: PlayerId[]
  crowdPredictions: { yes: number; no: number }
  accusedPickedCorrectly: boolean | null
  awarded: Record<PlayerId, number>
  scores: Record<PlayerId, number>
}

export type HearsayPlayerView = {
  phase: Phase
  action: 'vote' | 'predict' | 'guess' | 'wait'
  isAccused: boolean
  accusedName: string
  /** The question, for voters only, never for the accused. */
  charge: string | null
  /** The three candidate questions, for the accused only, during guess. */
  options: { id: string; text: string }[] | null
  targets: Player[]
  myVote: PlayerId | null
  myPrediction: boolean | null
  myPick: string | null
  myScore: number
}

export function hearsayHostView(state: HearsayState): HearsayHostView {
  const round = state.rounds[state.roundIndex]
  const accused = state.players.find((p) => p.id === round.accusedId)!
  const revealed = state.phase === 'verdict' || state.phase === 'scoreboard' || state.phase === 'ended'

  const predictions = Object.values(round.predictions)

  return {
    phase: state.phase,
    players: state.players,
    accusedId: round.accusedId,
    accusedName: accused.name,
    roundNumber: state.roundIndex + 1,
    totalRounds: state.order.length,
    question: revealed ? renderQuestion(round.question, accused.name) : null,
    voteCounts: voteCounts(round.votes),
    voters: revealed ? round.votes : null,
    topVoted: topVoted(round.votes),
    crowdPredictions: {
      yes: predictions.filter(Boolean).length,
      no: predictions.filter((p) => !p).length,
    },
    accusedPickedCorrectly: revealed ? round.accusedPick === round.question.id : null,
    awarded: round.awarded,
    scores: state.scores,
  }
}

export function hearsayPlayerView(state: HearsayState, playerId: PlayerId): HearsayPlayerView {
  const round = state.rounds[state.roundIndex]
  const accused = state.players.find((p) => p.id === round.accusedId)!
  const isAccused = playerId === round.accusedId

  let action: HearsayPlayerView['action'] = 'wait'
  if (state.phase === 'testimony' && !isAccused) action = 'vote'
  if (state.phase === 'guess') action = isAccused ? 'guess' : 'predict'

  const showCharge =
    !isAccused && (state.phase === 'charge' || state.phase === 'testimony' || state.phase === 'evidence' || state.phase === 'guess')

  return {
    phase: state.phase,
    action,
    isAccused,
    accusedName: accused.name,
    charge: showCharge ? renderQuestion(round.question, accused.name) : null,
    options:
      isAccused && state.phase === 'guess'
        ? round.options.map((q) => ({ id: q.id, text: renderQuestion(q, accused.name) }))
        : null,
    targets: state.players,
    myVote: round.votes[playerId] ?? null,
    myPrediction: round.predictions[playerId] ?? null,
    myPick: isAccused ? round.accusedPick : null,
    myScore: state.scores[playerId] ?? 0,
  }
}
