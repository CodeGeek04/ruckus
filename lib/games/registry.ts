import type { GameModule } from '@/lib/types'
import { hearsay } from './hearsay'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAMES: Record<string, GameModule<any, any, any, any>> = {
  hearsay,
}
