import type { GameModule } from '@/lib/types'
import { hearsay } from './hearsay'
import { telephone } from './telephone'
import { whosaidit } from './whosaidit'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGame = GameModule<any, any, any, any>

export const GAMES: Record<string, AnyGame> = {
  hearsay,
  whosaidit,
  telephone,
}

/** Lobby order. Hearsay leads because it is the one that always works. */
export const GAME_ORDER = ['hearsay', 'whosaidit', 'telephone'] as const
