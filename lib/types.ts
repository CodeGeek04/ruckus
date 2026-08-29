// lib/types.ts
import type { ComponentType } from 'react'

export type PlayerId = string

export type Player = {
  id: PlayerId
  name: string
  color: string
  connected: boolean
}

export const PLAYER_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#a855f7', '#ec4899',
  '#14b8a6', '#f43f5e', '#8b5cf6', '#84cc16',
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
  init(players: Player[]): State
  reduce(state: State, event: GameEvent<Input>): Reduced<State>
  hostView(state: State): HostView
  playerView(state: State, playerId: PlayerId): PlayerView
  HostScreen: ComponentType<{ view: HostView }>
  PlayerScreen: ComponentType<{ view: PlayerView; send: (input: Input) => void }>
}
