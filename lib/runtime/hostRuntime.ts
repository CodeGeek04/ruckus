// lib/runtime/hostRuntime.ts
'use client'

import { createBus, type Bus } from '@/lib/bus/client'
import { privateChannel, publicChannel } from '@/lib/bus/channels'
import { cleanName } from '@/lib/text'
import { PLAYER_COLORS, type GameModule, type Player, type PlayerId } from '@/lib/types'
import { HEARTBEAT_MS, type ToHost, type ToPlayer, type ToRoom } from './protocol'

type AnyGame = GameModule<unknown, unknown, unknown, unknown>

export type HostRuntime = {
  start(game: AnyGame): void
  /**
   * Picks a room back up from a snapshot after a host refresh. `players` is
   * part of the snapshot and has to come back too, otherwise nothing is left
   * to publish the private per-phone views to.
   */
  restore(game: AnyGame, state: unknown, players?: Player[]): void
  advance(): void
  destroy(): void
}

/** The snapshot the host page reads back after a refresh. */
export type HostSnapshot = {
  players: Player[]
  gameId: string | null
  state: unknown
}

export type HostCallbacks = {
  onPlayers(players: Player[]): void
  onView(view: unknown, deadline: number | null): void
  onGame(game: AnyGame | null): void
  onSound(name: string): void
}

export const SNAPSHOT_KEY = (code: string) => `ruckus:host:${code}`
export const LAST_ROOM_KEY = 'ruckus:host:last'

/**
 * A restored round has no deadline left in the snapshot, so the phase timer is
 * restarted from its full duration. Games are free not to expose one, in which
 * case the round simply waits for the host to advance.
 */
function phaseDuration(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null
  const shaped = state as { phase?: unknown; config?: { durations?: Record<string, unknown> } }
  if (typeof shaped.phase !== 'string') return null
  const ms = shaped.config?.durations?.[shaped.phase]
  return typeof ms === 'number' && ms > 0 ? ms : null
}

export function createHostRuntime(code: string, cb: HostCallbacks): HostRuntime {
  const bus: Bus = createBus()

  let players: Player[] = []
  let game: AnyGame | null = null
  let state: unknown = null
  let deadline: number | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  // Phones cannot see a WebSocket that stopped existing, so the host announces
  // itself on a fixed interval and they time it out.
  const heartbeat = setInterval(() => {
    bus.publish(publicChannel(code), { t: 'ping' } satisfies ToRoom)
  }, HEARTBEAT_MS)

  function snapshot() {
    try {
      localStorage.setItem(SNAPSHOT_KEY(code), JSON.stringify({ players, gameId: game?.id ?? null, state }))
    } catch {
      // Private browsing or a full quota. A lost snapshot is survivable.
    }
  }

  /** This phone's own view, on its private channel. No-op before a game. */
  function sendPrivate(player: Player) {
    if (!game) return
    bus.publish(privateChannel(code, player.id), {
      t: 'you',
      gameId: game.id,
      view: game.playerView(state, player.id),
      deadline,
    } satisfies ToPlayer)
  }

  function broadcast() {
    if (!game) {
      bus.publish(publicChannel(code), { t: 'lobby', players, code } satisfies ToRoom)
      return
    }
    bus.publish(publicChannel(code), {
      t: 'host',
      gameId: game.id,
      view: game.hostView(state),
      deadline,
    } satisfies ToRoom)

    for (const player of players) sendPrivate(player)
  }

  function push() {
    cb.onPlayers(players)
    if (game) cb.onView(game.hostView(state), deadline)
    broadcast()
    snapshot()
  }

  function runCommands(commands: { kind: string; ms?: number; name?: string }[] = []) {
    for (const command of commands) {
      if (command.kind === 'timer' && typeof command.ms === 'number') {
        if (timer) clearTimeout(timer)
        deadline = Date.now() + command.ms
        timer = setTimeout(() => dispatch({ type: 'deadline' }), command.ms)
      }
      if (command.kind === 'sound' && command.name) cb.onSound(command.name)
    }
  }

  function dispatch(event: { type: 'deadline' } | { type: 'hostAdvance' } | { type: 'input'; playerId: PlayerId; payload: unknown }) {
    if (!game) return
    const result = game.reduce(state, event as never)
    state = result.state
    runCommands(result.commands as never)
    push()
  }

  bus.subscribe(publicChannel(code), (raw) => {
    const message = raw as ToHost

    if (message.t === 'join') {
      const existing = players.find((p) => p.id === message.playerId)
      if (existing) {
        // Already in. Re-send the acceptance rather than going quiet: the
        // first one is lost whenever the phone's private subscription is not
        // acked yet, and a silent host leaves that phone stuck on the join
        // screen with a button that does nothing however often it is tapped.
        //
        // The current view goes with it. A phone re-announces after every
        // reconnect, and it missed everything published while it was away, so
        // acceptance on its own would leave it looking at a stale round.
        bus.publish(privateChannel(code, existing.id), { t: 'accepted', player: existing } satisfies ToPlayer)
        sendPrivate(existing)
        return
      }
      if (game) {
        // No late joins mid-game. Saying so matters: an unanswered join looks
        // exactly like a broken room from the phone's side.
        bus.publish(privateChannel(code, message.playerId), {
          t: 'rejected',
          reason: 'The game already started. You are in for the next one.',
        } satisfies ToPlayer)
        return
      }

      // A name that cleans down to nothing is not a name. The phone's own
      // join button refuses those, so this only ever fires for a hand rolled
      // client, and answering it would put a blank chip on the screen.
      const name = cleanName(message.name)
      if (!name) return

      const player: Player = {
        id: message.playerId,
        name,
        color: PLAYER_COLORS[players.length % PLAYER_COLORS.length],
        connected: true,
      }
      players = [...players, player]
      bus.publish(privateChannel(code, player.id), { t: 'accepted', player } satisfies ToPlayer)
      push()
      return
    }

    if (message.t === 'rejoin') {
      const player = players.find((p) => p.id === message.playerId)
      if (!player) return
      bus.publish(privateChannel(code, player.id), { t: 'accepted', player } satisfies ToPlayer)
      push()
      return
    }

    if (message.t === 'input') {
      // The public channel is open to anyone holding the room code, so an
      // input from someone the host has never accepted is not a player acting,
      // it is noise. Games see only their own roster.
      if (!players.some((p) => p.id === message.playerId)) return
      dispatch({ type: 'input', playerId: message.playerId, payload: message.payload })
    }
  })

  push()

  return {
    start(nextGame) {
      game = nextGame
      const opening = nextGame.init(players)
      state = opening.state
      cb.onGame(nextGame)
      // init returns its own opening timer, so no duration is duplicated here.
      runCommands(opening.commands as never)
      push()
    },
    restore(nextGame, nextState, nextPlayers) {
      game = nextGame
      state = nextState
      if (nextPlayers) players = nextPlayers
      cb.onGame(nextGame)
      const ms = phaseDuration(nextState)
      if (ms !== null) runCommands([{ kind: 'timer', ms }])
      push()
    },
    advance() {
      dispatch({ type: 'hostAdvance' })
    },
    destroy() {
      if (timer) clearTimeout(timer)
      clearInterval(heartbeat)
      bus.publish(publicChannel(code), { t: 'gone' } satisfies ToRoom)
      bus.close()
    },
  }
}
