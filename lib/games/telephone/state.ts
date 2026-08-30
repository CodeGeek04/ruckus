// lib/games/telephone/state.ts
import type { Player, PlayerId } from '@/lib/types'

export type Phase =
  /** Step 0: a blank page. Everyone invents a sentence on their own chain. */
  | 'write'
  /** Every later step: you see only the previous image and guess its sentence. */
  | 'describe'
  /** Sentences are in, images are being drawn. The host shows progress. */
  | 'drawing'
  /** The payoff. The host walks one chain at a time, one beat at a time. */
  | 'reveal'
  | 'vote'
  | 'ended'

/**
 * One beat of one chain. `text` is what a player wrote; `imageUrl` is what the
 * model made of it, and stays null only while that image is still being drawn.
 */
export type Entry = {
  playerId: PlayerId
  text: string
  imageUrl: string | null
  /** True when generation failed or was refused and a placeholder stands in. */
  failed: boolean
}

export type Chain = {
  index: number
  starterId: PlayerId
  entries: Entry[]
}

export type TelephoneInput =
  | { kind: 'submit'; text: string }
  /**
   * The image for the sentence this player just submitted. Sent by the phone
   * that submitted it, after its call to /api/image returns. A null url means
   * the model failed or refused, and the reducer substitutes a placeholder.
   */
  | { kind: 'image'; url: string | null }
  | { kind: 'vote'; chainIndex: number }

export type TelephoneConfig = {
  scoring: {
    /** Awarded to every contributor to the chain the room votes best. */
    winningChain: number
  }
  durations: Record<Exclude<Phase, 'ended'>, number>
  /** Clamped down to the player count: a chain must never revisit a player. */
  maxSteps: number
  maxTextLength: number
}

export const DEFAULT_CONFIG: TelephoneConfig = {
  scoring: { winningChain: 1000 },
  durations: {
    write: 45000,
    describe: 45000,
    // Generation measured at roughly 12s. This is the backstop that stops a
    // stuck phone from hanging the room, not the expected wait.
    drawing: 45000,
    reveal: 6000,
    vote: 30000,
  },
  maxSteps: 6,
  maxTextLength: 100,
}

/** Stands in whenever the model fails or refuses. Tiny, so it is safe inline. */
export const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'><rect width='512' height='512' fill='%23262626'/><text x='256' y='250' font-family='sans-serif' font-size='120' fill='%23555' text-anchor='middle'>?</text><text x='256' y='320' font-family='sans-serif' font-size='34' fill='%23555' text-anchor='middle'>no picture</text></svg>"

export type TelephoneState = {
  phase: Phase
  players: Player[]
  config: TelephoneConfig
  /** How many entries each chain ends up with. */
  steps: number
  stepIndex: number
  chains: Chain[]
  /** Where the reveal has got to: which chain, and which beat within it. */
  reveal: { chainIndex: number; beat: number }
  votes: Record<PlayerId, number>
  scores: Record<PlayerId, number>
  awarded: Record<PlayerId, number>
}

export function playerIndexOf(state: TelephoneState, playerId: PlayerId): number {
  return state.players.findIndex((p) => p.id === playerId)
}

/** A chain's beats alternate sentence, image, sentence, image. */
export function beatsInChain(chain: Chain): number {
  return chain.entries.length * 2
}
