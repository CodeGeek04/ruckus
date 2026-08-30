import type { GameModule } from '@/lib/types'
import { WhoSaidItHostScreen } from './HostScreen'
import { WhoSaidItPlayerScreen } from './PlayerScreen'
import { initWhoSaidIt, reduceWhoSaidIt } from './reduce'
import { getWhoSaidItSource, MAX_PLAYERS, MIN_PLAYERS } from './source'
import { DEFAULT_CONFIG, type WhoSaidItInput, type WhoSaidItState } from './state'
import {
  whoSaidItHostView,
  whoSaidItPlayerView,
  type WhoSaidItHostView,
  type WhoSaidItPlayerView,
} from './views'

/** The host lobby renders this to import the chat and map its authors. */
export { WhoSaidItLobbySetup } from './LobbySetup'
export { clearWhoSaidItSource, setWhoSaidItSource, whoSaidItStatus } from './source'

export const whosaidit: GameModule<
  WhoSaidItState,
  WhoSaidItInput,
  WhoSaidItHostView,
  WhoSaidItPlayerView
> = {
  id: 'whosaidit',
  name: 'Who Said It',
  tagline: 'Real messages from your own chat. Everyone guesses who typed it.',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  init: (players) => {
    const state = initWhoSaidIt(players, getWhoSaidItSource(), DEFAULT_CONFIG)
    return {
      state,
      commands: state.rounds.length > 0 ? [{ kind: 'timer', ms: DEFAULT_CONFIG.durations.message }] : [],
    }
  },
  reduce: reduceWhoSaidIt,
  hostView: whoSaidItHostView,
  playerView: whoSaidItPlayerView,
  HostScreen: WhoSaidItHostScreen,
  PlayerScreen: WhoSaidItPlayerScreen,
}
