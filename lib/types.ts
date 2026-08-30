// lib/types.ts
import type { ComponentType } from 'react'

export type PlayerId = string

export type Player = {
  id: PlayerId
  name: string
  color: string
  connected: boolean
}

/**
 * The player wheel. All at the same lightness and chroma on purpose, so no
 * player's colour looks more important than anyone else's, and all of them
 * carry ink type at full weight.
 */
export const PLAYER_COLORS = [
  'oklch(0.79 0.19 350)', // pink
  'oklch(0.89 0.16 98)', // yellow
  'oklch(0.77 0.14 240)', // blue
  'oklch(0.86 0.14 165)', // mint
  'oklch(0.79 0.17 55)', // orange
  'oklch(0.75 0.16 305)', // violet
  'oklch(0.88 0.19 130)', // lime
  'oklch(0.7 0.19 20)', // coral
  'oklch(0.82 0.15 200)', // sky
  'oklch(0.84 0.16 75)', // amber
  'oklch(0.73 0.15 330)', // magenta
  'oklch(0.8 0.16 145)', // grass
] as const

/** Anything a phone can send to the host. Games narrow the payload. */
export type GameEvent<Input = unknown> =
  | { type: 'input'; playerId: PlayerId; payload: Input }
  | { type: 'deadline' }
  | { type: 'hostAdvance' }

/** How a pure reducer asks the runtime to do impure work. */
export type Command =
  | { kind: 'timer'; ms: number }
  | { kind: 'sound'; name: string }

export type Reduced<State> = { state: State; commands?: Command[] }

/**
 * Every game implements this. `hostView` output is public and goes on the
 * shared screen. `playerView` output goes to one phone over its private
 * channel and is the ONLY place secrets may appear.
 */
export type GameModule<State, Input, HostView, PlayerView> = {
  id: string
  name: string
  tagline: string
  minPlayers: number
  maxPlayers: number
  /** Returns the opening state plus the commands that start the first phase. */
  init(players: Player[]): Reduced<State>
  reduce(state: State, event: GameEvent<Input>): Reduced<State>
  hostView(state: State): HostView
  playerView(state: State, playerId: PlayerId): PlayerView
  HostScreen: ComponentType<{ view: HostView }>
  PlayerScreen: ComponentType<{ view: PlayerView; send: (input: Input) => void }>
}
