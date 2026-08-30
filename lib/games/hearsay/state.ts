// lib/games/hearsay/state.ts
import type { Player, PlayerId } from '@/lib/types'

export type Phase =
  | 'charge'
  | 'testimony'
  | 'evidence'
  | 'guess'
  | 'verdict'
  | 'scoreboard'
  | 'ended'

export type QuestionFamily = 'conflict' | 'affection' | 'chaos' | 'trust' | 'secrets'

export type Question = {
  id: string
  /** Contains {X}, replaced with the accused player's name at render time. */
  template: string
  family: QuestionFamily
  tone: 'mild' | 'spicy'
}

export type HearsayInput =
  | { kind: 'vote'; targetId: PlayerId }
  | { kind: 'predict'; willGetIt: boolean }
  | { kind: 'guess'; questionId: string }

export type Round = {
  accusedId: PlayerId
  question: Question
  /** The real question plus two decoys, already shuffled. */
  options: Question[]
  votes: Record<PlayerId, PlayerId>
  predictions: Record<PlayerId, boolean>
  accusedPick: string | null
  /** Points awarded for this round, filled in when entering the verdict phase. */
  awarded: Record<PlayerId, number>
}

export type HearsayConfig = {
  scoring: {
    accusedCorrect: number
    readTheRoom: number
    /**
     * Ships true: the room only scores when the accused gets it right.
     * Under review pending a playtest. Flip to false to make the rewards
     * independent, or set readTheRoom to 0 to make the chair the only
     * thing that scores.
     */
    readTheRoomRequiresAccusedCorrect: boolean
  }
  durations: Record<Exclude<Phase, 'ended'>, number>
  minRounds: number
  tone: 'mild' | 'spicy'
}

export const DEFAULT_CONFIG: HearsayConfig = {
  scoring: {
    accusedCorrect: 1000,
    readTheRoom: 500,
    readTheRoomRequiresAccusedCorrect: true,
  },
  durations: {
    charge: 5000,
    testimony: 20000,
    evidence: 10000,
    guess: 25000,
    verdict: 20000,
    scoreboard: 8000,
  },
  minRounds: 8,
  tone: 'spicy',
}

export type HearsayState = {
  phase: Phase
  players: Player[]
  config: HearsayConfig
  /** One entry per round: who is accused. Length is the total round count. */
  order: PlayerId[]
  roundIndex: number
  rounds: Round[]
  scores: Record<PlayerId, number>
  usedQuestionIds: string[]
}

export function accusedOf(state: HearsayState): PlayerId {
  return state.order[state.roundIndex]
}

export function currentRound(state: HearsayState): Round {
  return state.rounds[state.roundIndex]
}

export function voters(state: HearsayState): Player[] {
  const accused = accusedOf(state)
  return state.players.filter((p) => p.id !== accused)
}
