'use client'

import { createBus, type Bus } from '@/lib/bus/client'
import { privateChannel, publicChannel } from '@/lib/bus/channels'
import { newPlayerId } from '@/lib/ids'
import type { Player } from '@/lib/types'
import { HEARTBEAT_MS, HOST_TIMEOUT_MS, type ToHost, type ToPlayer, type ToRoom } from './protocol'

export type PlayerCallbacks = {
  onAccepted(player: Player): void
  onView(view: unknown, deadline: number | null, gameId: string): void
  onLobby(players: Player[]): void
  onStatus(status: 'connecting' | 'open' | 'closed'): void
  /** 'live' while the host is heartbeating, 'gone' when it stops or says goodbye. */
  onHostStatus(status: 'live' | 'gone'): void
  /** The host will not take this phone: it turned up after the game started. */
  onRejected(reason: string): void
}

export type PlayerClient = {
  join(name: string): void
  send(payload: unknown): void
  destroy(): void
  playerId: string
}

const IDENTITY_KEY = (code: string) => `ruckus:player:${code.toUpperCase()}`

/** How often an unanswered join is offered again. */
const ANNOUNCE_MS = 2000

function loadIdentity(code: string): { playerId: string; name: string } | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY(code))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.playerId !== 'string' || typeof parsed.name !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function createPlayerClient(code: string, cb: PlayerCallbacks): PlayerClient {
  const bus: Bus = createBus()
  const saved = loadIdentity(code)
  const playerId = saved?.playerId ?? newPlayerId()

  // Phones also publish on the public channel and receive their own echoes, so
  // only messages the host sends count as a sign of life.
  let lastHostMessage = Date.now()
  let hostStatus: 'live' | 'gone' = 'live'

  /**
   * Everything about getting back in. A phone announces itself and keeps
   * announcing until the host acknowledges it, because there is no reliable
   * moment at which the announcement is guaranteed to be heard:
   *
   *   - the join is an HTTP publish, the acceptance comes back over the
   *     WebSocket, and the two races. An acceptance sent before this phone's
   *     private subscription is live is simply lost.
   *   - a phone that goes offline mid game misses every view published while
   *     it was away, and would otherwise sit on a stale screen until the next
   *     time somebody happened to press something.
   *   - the host dropping back to its lobby empties the roster, and nobody
   *     tells the phones to come back.
   *
   * `rejoin` is not used: `join` already re-sends the acceptance for a known
   * id, and it additionally puts the player back after a lobby reset.
   */
  let myName: string | null = saved?.name ?? null
  let accepted = false
  let rejected = false

  function announce() {
    if (!myName || accepted || rejected) return
    bus.publish(publicChannel(code), { t: 'join', playerId, name: myName } satisfies ToHost)
  }

  bus.onStatus((status) => {
    cb.onStatus(status)
    // A fresh socket has a fresh subscription, so anything the host sent while
    // it was down is gone. Ask again.
    if (status === 'open') {
      accepted = false
      announce()
    }
  })

  const announcer = setInterval(announce, ANNOUNCE_MS)

  function markHostSeen() {
    lastHostMessage = Date.now()
    if (hostStatus === 'gone') {
      hostStatus = 'live'
      cb.onHostStatus('live')
    }
  }

  function markHostGone() {
    if (hostStatus === 'live') {
      hostStatus = 'gone'
      cb.onHostStatus('gone')
    }
  }

  const hostWatch = setInterval(() => {
    if (Date.now() - lastHostMessage > HOST_TIMEOUT_MS) markHostGone()
  }, HEARTBEAT_MS)


  bus.subscribe(privateChannel(code, playerId), (raw) => {
    const message = raw as ToPlayer
    markHostSeen()
    if (message.t === 'accepted') {
      accepted = true
      rejected = false
      cb.onAccepted(message.player)
    }
    if (message.t === 'rejected') {
      rejected = true
      cb.onRejected(message.reason)
    }
    if (message.t === 'you') {
      accepted = true
      cb.onView(message.view, message.deadline, message.gameId)
    }
  })

  bus.subscribe(publicChannel(code), (raw) => {
    const message = raw as ToRoom
    if (message.t === 'gone') {
      markHostGone()
      return
    }
    if (message.t === 'lobby' || message.t === 'host' || message.t === 'ping' || message.t === 'ended') {
      markHostSeen()
    }
    if (message.t === 'lobby') {
      // The roster is the host's own answer to who is in the room. Not being
      // on it means this phone has to introduce itself again, whether it was
      // never accepted or the host dropped back to an empty lobby.
      if (!message.players.some((p) => p.id === playerId)) {
        accepted = false
        rejected = false
        announce()
      }
      cb.onLobby(message.players)
    }
  })

  announce()

  return {
    playerId,

    join(name) {
      try {
        localStorage.setItem(IDENTITY_KEY(code), JSON.stringify({ playerId, name }))
      } catch {
        // Fine. They just cannot survive a refresh.
      }
      myName = name
      rejected = false
      announce()
    },

    send(payload) {
      bus.publish(publicChannel(code), { t: 'input', playerId, payload } satisfies ToHost)
    },

    destroy() {
      clearInterval(hostWatch)
      clearInterval(announcer)
      bus.close()
    },
  }
}
