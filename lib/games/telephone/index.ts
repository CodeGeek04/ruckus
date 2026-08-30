import type { GameModule } from '@/lib/types'
import { TelephoneHostScreen } from './HostScreen'
import { TelephonePlayerScreen } from './PlayerScreen'
import { initTelephone, reduceTelephone } from './reduce'
import { DEFAULT_CONFIG, type TelephoneInput, type TelephoneState } from './state'
import {
  telephoneHostView,
  telephonePlayerView,
  type TelephoneHostView,
  type TelephonePlayerView,
} from './views'

/**
 * Where the impure work happens, and why it is not a command.
 *
 * The reducer is pure and never touches the network. Turning a sentence into a
 * picture is impure, so by the contract it should come back as a `callApi`
 * command for the runtime to execute. It cannot, in this shell: `Command` has
 * no such variant, `hostRuntime.runCommands` acts only on `timer` and `sound`
 * and silently drops anything else, `GameEvent` has no `apiResult` case, and
 * `HostScreen` is handed a view with no way to dispatch. There is no path for
 * host initiated async work without changing the runtime, which this game is
 * not allowed to do.
 *
 * So the phone that wrote a sentence calls /api/image for it and sends the
 * resulting url back as an ordinary `input`. The key stays server side, the
 * reducer stays pure, and the N pictures in a step generate in parallel on N
 * phones. Every failure path lands on a placeholder, and the phase timer fills
 * in anything still missing, so a dead phone can never hang the room.
 */
export const telephone: GameModule<TelephoneState, TelephoneInput, TelephoneHostView, TelephonePlayerView> = {
  id: 'telephone',
  name: 'Broken Telephone',
  tagline: 'Write a sentence. Watch a machine ruin it, six people deep.',
  minPlayers: 3,
  maxPlayers: 12,
  init: (players) => ({
    state: initTelephone(players, DEFAULT_CONFIG),
    commands: [{ kind: 'timer', ms: DEFAULT_CONFIG.durations.write }],
  }),
  reduce: reduceTelephone,
  hostView: telephoneHostView,
  playerView: telephonePlayerView,
  HostScreen: TelephoneHostScreen,
  PlayerScreen: TelephonePlayerScreen,
}
