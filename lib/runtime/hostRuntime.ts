// lib/runtime/hostRuntime.ts
'use client'

import { createBus, type Bus } from '@/lib/bus/client'
import { privateChannel, publicChannel } from '@/lib/bus/channels'
import { PLAYER_COLORS, type GameModule, type Player, type PlayerId } from '@/lib/types'
import type { ToHost, ToPlayer, ToRoom } from './protocol'

type AnyGame = GameModule<unknown, unknown, unknown, unknown>

export type HostRuntime = {
  start(game: AnyGame): void
  advance(): void
  destroy(): void
}

export type HostCallbacks = {
  onPlayers(players: Player[]): void
  onView(view: unknown, deadline: number | null): void
  onGame(game: AnyGame | null): void
  onSound(name: string): void
}

const SNAPSHOT_KEY = (code: string) => `ruckus:host:${code}`

export function createHostRuntime(code: string, cb: HostCallbacks): HostRuntime {
  const bus: Bus = createBus()

  let players: Player[] = []
  let game: AnyGame | null = null
  let state: unknown = null
  let deadline: number | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function snapshot() {
    try {
      localStorage.setItem(SNAPSHOT_KEY(code), JSON.stringify({ players, gameId: game?.id ?? null, state }))
    } catch {
      // Private browsing or a full quota. A lost snapshot is survivable.
    }
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

    for (const player of players) {
      bus.publish(privateChannel(code, player.id), {
        t: 'you',
        gameId: game.id,
        view: game.playerView(state, player.id),
        deadline,
      } satisfies ToPlayer)
    }
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
      if (players.some((p) => p.id === message.playerId)) return
      if (game) return // no late joins mid-game

      const player: Player = {
        id: message.playerId,
        name: message.name.slice(0, 12),
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
    advance() {
      dispatch({ type: 'hostAdvance' })
    },
    destroy() {
      if (timer) clearTimeout(timer)
      bus.close()
    },
  }
}
