import type { GameModule } from '@/lib/types'
import { HearsayHostScreen } from './HostScreen'
import { HearsayPlayerScreen } from './PlayerScreen'
import { initHearsay, reduceHearsay } from './reduce'
import { DEFAULT_CONFIG, type HearsayInput, type HearsayState } from './state'
import { hearsayHostView, hearsayPlayerView, type HearsayHostView, type HearsayPlayerView } from './views'

/**
 * Set by the host lobby before the game starts. A module-level value rather
 * than a parameter, because the GameModule contract deliberately keeps init
 * to one argument so every game stays interchangeable.
 */
let selectedTone: 'mild' | 'spicy' = 'spicy'

export function setHearsayTone(tone: 'mild' | 'spicy') {
  selectedTone = tone
}

export const hearsay: GameModule<HearsayState, HearsayInput, HearsayHostView, HearsayPlayerView> = {
  id: 'hearsay',
  name: 'Hearsay',
  tagline: 'The room testifies about you. You never hear the charge.',
  minPlayers: 4,
  maxPlayers: 12,
  init: (players) => {
    const config = { ...DEFAULT_CONFIG, tone: selectedTone }
    return {
      state: initHearsay(players, config),
      commands: [{ kind: 'timer', ms: config.durations.charge }],
    }
  },
  reduce: reduceHearsay,
  hostView: hearsayHostView,
  playerView: hearsayPlayerView,
  HostScreen: HearsayHostScreen,
  PlayerScreen: HearsayPlayerScreen,
}
