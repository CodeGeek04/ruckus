import type { GameModule } from '@/lib/types'
import { HearsayHostScreen } from './HostScreen'
import { HearsayPlayerScreen } from './PlayerScreen'
import { initHearsay, reduceHearsay } from './reduce'
import { DEFAULT_CONFIG, type HearsayInput, type HearsayState } from './state'
import { hearsayHostView, hearsayPlayerView, type HearsayHostView, type HearsayPlayerView } from './views'

export const hearsay: GameModule<HearsayState, HearsayInput, HearsayHostView, HearsayPlayerView> = {
  id: 'hearsay',
  name: 'Hearsay',
  tagline: 'The room testifies about you. You never hear the charge.',
  minPlayers: 4,
  maxPlayers: 12,
  init: (players) => ({
    state: initHearsay(players),
    commands: [{ kind: 'timer', ms: DEFAULT_CONFIG.durations.charge }],
  }),
  reduce: reduceHearsay,
  hostView: hearsayHostView,
  playerView: hearsayPlayerView,
  HostScreen: HearsayHostScreen,
  PlayerScreen: HearsayPlayerScreen,
}
