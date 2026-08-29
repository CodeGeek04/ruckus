// lib/runtime/playerClient.ts
'use client'

import { createBus, type Bus } from '@/lib/bus/client'
import { privateChannel, publicChannel } from '@/lib/bus/channels'
import { newPlayerId } from '@/lib/ids'
import type { Player } from '@/lib/types'
import type { ToHost, ToPlayer, ToRoom } from './protocol'

export type PlayerCallbacks = {
  onAccepted(player: Player): void
  onView(view: unknown, deadline: number | null): void
  onLobby(players: Player[]): void
  onStatus(status: 'connecting' | 'open' | 'closed'): void
}

export type PlayerClient = {
  join(name: string): void
  send(payload: unknown): void
  destroy(): void
  playerId: string
}

const IDENTITY_KEY = (code: string) => `ruckus:player:${code.toUpperCase()}`

function loadIdentity(code: string): { playerId: string; name: string } | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY(code))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function createPlayerClient(code: string, cb: PlayerCallbacks): PlayerClient {
  const bus: Bus = createBus()
  const saved = loadIdentity(code)
  const playerId = saved?.playerId ?? newPlayerId()

  bus.onStatus(cb.onStatus)

  bus.subscribe(privateChannel(code, playerId), (raw) => {
    const message = raw as ToPlayer
    if (message.t === 'accepted') cb.onAccepted(message.player)
    if (message.t === 'you') cb.onView(message.view, message.deadline)
  })

  bus.subscribe(publicChannel(code), (raw) => {
    const message = raw as ToRoom
    if (message.t === 'lobby') cb.onLobby(message.players)
  })

  // A phone that already has an identity re-announces itself, so a locked
  // screen or a Discord notification never ejects a player.
  if (saved) {
    bus.publish(publicChannel(code), { t: 'rejoin', playerId } satisfies ToHost)
  }

  return {
    playerId,

    join(name) {
      try {
        localStorage.setItem(IDENTITY_KEY(code), JSON.stringify({ playerId, name }))
      } catch {
        // Fine. They just cannot survive a refresh.
      }
      bus.publish(publicChannel(code), { t: 'join', playerId, name } satisfies ToHost)
    },

    send(payload) {
      bus.publish(publicChannel(code), { t: 'input', playerId, payload } satisfies ToHost)
    },

    destroy() {
      bus.close()
    },
  }
}
