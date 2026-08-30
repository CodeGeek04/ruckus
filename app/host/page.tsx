'use client'

import { QrCode } from '@/components/QrCode'
import { Countdown } from '@/components/Countdown'
import { Button, Face, Slab, Sticker } from '@/components/kit'
import { setHearsayTone } from '@/lib/games/hearsay'
import {
  getServerSource,
  getWhoSaidItSource,
  subscribeWhoSaidItSource,
  WhoSaidItLobbySetup,
  whoSaidItStatus,
} from '@/lib/games/whosaidit'
import { GAMES, GAME_ORDER } from '@/lib/games/registry'
import { newRoomCode } from '@/lib/ids'
import {
  createHostRuntime,
  LAST_ROOM_KEY,
  SNAPSHOT_KEY,
  type HostRuntime,
  type HostSnapshot,
} from '@/lib/runtime/hostRuntime'
import { viewPhase } from '@/lib/runtime/protocol'
import { playSound } from '@/lib/sound'
import type { GameModule, Player } from '@/lib/types'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** Every localStorage call is wrapped: private browsing throws on access. */
function readSnapshot(code: string): HostSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY(code))
    if (!raw) return null
    const parsed = JSON.parse(raw) as HostSnapshot
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.gameId !== 'string' || !GAMES[parsed.gameId]) return null
    if (!Array.isArray(parsed.players) || parsed.players.length === 0) return null
    if (!parsed.state || typeof parsed.state !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

/** The room this browser was last hosting, if it still has a resumable game. */
function resumableCode(): string | null {
  try {
    const last = localStorage.getItem(LAST_ROOM_KEY)
    if (!last) return null
    return readSnapshot(last) ? last : null
  } catch {
    return null
  }
}

function forget(code: string) {
  try {
    localStorage.removeItem(SNAPSHOT_KEY(code))
    localStorage.removeItem(LAST_ROOM_KEY)
  } catch {
    // Nothing to forget if storage is unavailable.
  }
}

/**
 * The room code cannot be decided on the server: it depends on localStorage
 * and on Math.random. It lives in a tiny external store so hydration renders
 * the server's null and only then swaps in the real code, with no mismatch
 * and no setState in an effect.
 */
let roomCode: string | null = null
const roomListeners = new Set<() => void>()

function subscribeRoom(listener: () => void) {
  roomListeners.add(listener)
  return () => {
    roomListeners.delete(listener)
  }
}

function getRoom(): string {
  if (roomCode === null) roomCode = resumableCode() ?? newRoomCode()
  return roomCode
}

function getServerRoom(): string | null {
  return null
}

function setRoom(next: string) {
  roomCode = next
  for (const listener of roomListeners) listener()
}

/** The host drives pacing manually; timers are a backstop, not the conductor. */
const ADVANCE_LABELS: Record<string, Record<string, string>> = {
  hearsay: {
    charge: 'Start voting',
    testimony: 'Show evidence',
    evidence: 'Let them guess',
    guess: 'Reveal',
    verdict: 'Scores',
    scoreboard: 'Next round',
  },
  whosaidit: {
    message: 'Reveal',
    reveal: 'Scores',
    scoreboard: 'Next message',
  },
  telephone: {
    write: 'Start drawing',
    describe: 'Start drawing',
    drawing: 'Skip wait',
    reveal: 'Next',
    vote: 'Results',
  },
}

function advanceLabel(gameId: string | undefined, phase: string | null): string {
  if (!gameId || !phase) return 'Next'
  return ADVANCE_LABELS[gameId]?.[phase] ?? 'Next'
}

const subscribeNothing = () => () => {}
const getOrigin = () => window.location.origin
const getHostName = () => window.location.host
const getEmpty = () => ''

export default function HostPage() {
  const code = useSyncExternalStore(subscribeRoom, getRoom, getServerRoom)
  const [epoch, setEpoch] = useState(0)
  const [players, setPlayers] = useState<Player[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [game, setGame] = useState<GameModule<any, any, any, any> | null>(null)
  const [view, setView] = useState<unknown>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [tone, setTone] = useState<'mild' | 'spicy'>('spicy')
  const [pick, setPick] = useState<string>('hearsay')
  // Subscribing matters: without it the readiness check runs once against an
  // empty chat store and never recomputes, so the lobby panel says "ready" while
  // the start button stays disabled forever.
  const chatSource = useSyncExternalStore(subscribeWhoSaidItSource, getWhoSaidItSource, getServerSource)
  const runtime = useRef<HostRuntime | null>(null)

  useEffect(() => {
    if (!code) return

    // Read the snapshot before the runtime starts: creating it immediately
    // pushes an empty lobby over the top of whatever was stored.
    const snapshot = readSnapshot(code)

    try {
      localStorage.setItem(LAST_ROOM_KEY, code)
    } catch {
      // A host that cannot store its code just cannot survive a refresh.
    }

    const rt = createHostRuntime(code, {
      onPlayers: setPlayers,
      onView: (nextView, nextDeadline) => {
        setView(nextView)
        setDeadline(nextDeadline)
      },
      onGame: setGame,
      onSound: playSound,
    })
    runtime.current = rt

    if (snapshot && snapshot.gameId) {
      rt.restore(GAMES[snapshot.gameId], snapshot.state, snapshot.players)
    }

    return () => {
      runtime.current = null
      rt.destroy()
    }
  }, [code, epoch])

  const reset = useCallback(() => {
    setGame(null)
    setView(null)
    setDeadline(null)
    setPlayers([])
  }, [])

  /** Abandon a restored room deliberately and hand out a fresh code. */
  const newRoom = useCallback(() => {
    if (code) forget(code)
    reset()
    setRoom(newRoomCode())
  }, [code, reset])

  /** Drop back to the lobby on the same code. Phones stop receiving views. */
  const endGame = useCallback(() => {
    if (code) forget(code)
    reset()
    setEpoch((n) => n + 1)
  }, [code, reset])

  // Client-only values read through useSyncExternalStore rather than a bare
  // window check: /host prerenders, so a bare check renders one thing on the
  // server and another on the client, which is a hydration mismatch.
  const origin = useSyncExternalStore(subscribeNothing, getOrigin, getEmpty)
  const hostName = useSyncExternalStore(subscribeNothing, getHostName, getEmpty)
  const joinUrl = code && origin ? `${origin}/play/${code}` : ''
  const selected = GAMES[pick]

  // Every game needs enough players. Who Said It additionally needs a chat
  // export loaded with enough authors on the answer board, and says so in its
  // own words.
  const enoughPlayers = players.length >= selected.minPlayers
  const extra = pick === 'whosaidit' && chatSource ? whoSaidItStatus(players) : { ready: pick !== 'whosaidit', reason: pick === 'whosaidit' ? 'Load a chat export' : '' }
  const canStart = enoughPlayers && extra.ready
  const blockedReason = !enoughPlayers ? `Need ${selected.minPlayers} players` : extra.reason

  // Who Said It brings its own author list, which needs the vertical room.
  const hasSetupPanel = pick === 'whosaidit'

  if (game && view) {
    const Screen = game.HostScreen
    const ended = viewPhase(view) === 'ended'
    return (
      <main className="relative h-full">
        {/* A reserved lane down the right edge. The screen's own header stops
            short of it, so the clock can never land on the round counter. */}
        <div className="pointer-events-none absolute top-6 right-6 z-20 w-32 justify-items-end">
          {!ended && deadline !== null && (
            <Slab tone="chalk" className="px-5 py-1.5" tilt={3}>
              <Countdown deadline={deadline} className="tnum text-5xl font-extrabold" />
            </Slab>
          )}
        </div>

        <Screen view={view} />

        <div className="absolute right-8 bottom-6 z-20 flex items-center gap-3">
          <button
            onClick={endGame}
            className="font-mono text-xs font-bold tracking-widest uppercase underline decoration-2 underline-offset-4 opacity-45 transition-opacity hover:opacity-90"
          >
            End game
          </button>
          {!ended && (
            <Button onClick={() => runtime.current?.advance()} tone="ink" size="md">
              {advanceLabel(game.id, viewPhase(view))}
            </Button>
          )}
        </div>
      </main>
    )
  }

  const GAME_TONES = { hearsay: 'violet', whosaidit: 'mint', telephone: 'orange' } as const

  return (
    <main
      className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden p-6 transition-colors duration-500"
      style={{ backgroundColor: 'var(--color-yellow)' }}
    >
      <div className="dots pointer-events-none absolute inset-0" aria-hidden />

      <header className="relative flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tighter uppercase">Ruckus</h1>
        <Sticker tone="pink" tilt={2}>
          {players.length === 0 ? 'waiting' : `${players.length} in`}
        </Sticker>
      </header>

      <div className="relative flex min-h-0 flex-col items-center justify-center gap-5 overflow-y-auto">
        <div className="flex items-center gap-8">
          <Slab tone="chalk" className="px-8 py-4" tilt={-1.5}>
            <p className="text-center font-mono text-xs font-bold tracking-[0.25em] uppercase opacity-55">
              go to {hostName || 'ruckus'}
            </p>
            <p
              className={`text-center font-mono font-bold tracking-[0.15em] tabular-nums ${
                hasSetupPanel ? 'text-[clamp(2.5rem,6vw,4rem)]' : 'text-[clamp(3.5rem,9vw,7rem)]'
              }`}
            >
              {code ?? '••••'}
            </p>
          </Slab>
          {joinUrl && (
            <Slab tone="chalk" className="p-2" tilt={2.5}>
              <QrCode value={joinUrl} size={hasSetupPanel ? 104 : 156} />
            </Slab>
          )}
        </div>

        <div className="flex min-h-24 flex-wrap items-center justify-center gap-4">
          {players.map((player, i) => (
            <div key={player.id} className="rise" style={{ animationDelay: `${i * 55}ms` }}>
              <Face name={player.name} color={player.color} size="lg" dim={!player.connected} />
            </div>
          ))}
          {players.length === 0 && (
            <p className="font-mono text-lg font-bold lowercase opacity-45">
              nobody yet. type the code on your phone.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-4">
          {GAME_ORDER.map((id, i) => {
            const g = GAMES[id]
            const active = pick === id
            return (
              <button
                key={id}
                onClick={() => setPick(id)}
                className="slab press-sm w-60 px-5 py-4 text-left transition-transform"
                style={{
                  backgroundColor: active ? `var(--color-${GAME_TONES[id]})` : 'var(--color-chalk)',
                  transform: active ? 'rotate(-1.5deg) scale(1.03)' : `rotate(${i % 2 ? 1 : -1}deg)`,
                }}
              >
                <span className="block text-xl font-extrabold uppercase">{g.name}</span>
                <span className="mt-1 block text-sm leading-tight font-semibold opacity-65">{g.tagline}</span>
              </button>
            )
          })}
        </div>

        {pick === 'hearsay' && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold tracking-widest uppercase opacity-50">how mean</span>
            {(['mild', 'spicy'] as const).map((option) => (
              <Button
                key={option}
                size="sm"
                tone={option === 'spicy' ? 'red' : 'chalk'}
                selected={tone === option}
                onClick={() => {
                  setTone(option)
                  setHearsayTone(option)
                }}
              >
                {option}
              </Button>
            ))}
          </div>
        )}

        {pick === 'whosaidit' && <WhoSaidItLobbySetup players={players} />}
      </div>

      <div className="relative flex items-center justify-center gap-4">
        <button
          onClick={newRoom}
          className="font-mono text-xs font-bold tracking-widest uppercase underline decoration-2 underline-offset-4 opacity-45 transition-opacity hover:opacity-90"
        >
          New room
        </button>
        <div className="flex flex-col items-center gap-1.5">
          <Button disabled={!canStart} onClick={() => runtime.current?.start(selected)} size="lg" tone="pink">
            Start {selected.name}
          </Button>
          {!canStart && (
            <p className="max-w-md text-center font-mono text-xs font-bold lowercase opacity-60">{blockedReason}</p>
          )}
        </div>
      </div>
    </main>
  )
}
