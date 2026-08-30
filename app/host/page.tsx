'use client'

import { QrCode } from '@/components/QrCode'
import { Countdown } from '@/components/Countdown'
import { PlayerChip } from '@/components/PlayerChip'
import { setHearsayTone } from '@/lib/games/hearsay'
import { WhoSaidItLobbySetup, whoSaidItStatus } from '@/lib/games/whosaidit'
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

  const joinUrl = !code || typeof window === 'undefined' ? '' : `${window.location.origin}/play/${code}`
  const selected = GAMES[pick]

  // Every game needs enough players. Who Said It additionally needs a chat
  // export loaded and its authors mapped, and says so in its own words.
  const enoughPlayers = players.length >= selected.minPlayers
  const extra = pick === 'whosaidit' ? whoSaidItStatus(players) : { ready: true, reason: '' }
  const canStart = enoughPlayers && extra.ready
  const blockedReason = !enoughPlayers ? `Need ${selected.minPlayers} players` : extra.reason

  if (game && view) {
    const Screen = game.HostScreen
    const ended = viewPhase(view) === 'ended'
    return (
      <main className="relative h-full">
        {/* Reserved lane down the right edge. The screen's own header stops short
            of it, so the countdown cannot land on top of the round counter. */}
        <div className="pointer-events-none absolute right-6 top-6 z-10 flex w-28 justify-end">
          <div className="rounded-2xl bg-black/60 px-5 py-2 text-6xl font-black leading-none backdrop-blur">
            <Countdown deadline={ended ? null : deadline} />
          </div>
        </div>

        <Screen view={view} />

        <div className="absolute bottom-6 right-8 z-10 flex items-center gap-3">
          <button
            onClick={endGame}
            className="rounded-xl border-2 border-white/20 px-5 py-3 text-base font-black uppercase tracking-widest text-white/40 transition hover:border-white/40 hover:text-white/70"
          >
            End game
          </button>
          {!ended && (
            <button
              onClick={() => runtime.current?.advance()}
              className="rounded-xl bg-white px-8 py-3 text-xl font-black uppercase tracking-widest text-black transition active:scale-95"
            >
              {advanceLabel(game.id, viewPhase(view))}
            </button>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="flex h-full flex-col items-center justify-center gap-10 p-10">
      <h1 className="text-5xl font-black uppercase tracking-widest text-white/50">Ruckus</h1>

      <div className="flex items-center gap-12">
        <div className="text-center">
          <p className="text-2xl font-bold uppercase tracking-widest text-white/50">Go to ruckus and enter</p>
          <p className="font-mono text-[10rem] font-black leading-none tracking-widest">{code ?? '----'}</p>
        </div>
        {joinUrl && <QrCode value={joinUrl} size={240} />}
      </div>

      <div className="flex min-h-32 flex-wrap items-center justify-center gap-6">
        {players.map((player) => (
          <PlayerChip key={player.id} player={player} size="lg" />
        ))}
        {players.length === 0 && (
          <p className="text-3xl font-bold text-white/30">Waiting for players...</p>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        {GAME_ORDER.map((id) => {
          const g = GAMES[id]
          const active = pick === id
          return (
            <button
              key={id}
              onClick={() => setPick(id)}
              className={`w-64 rounded-2xl border-4 px-6 py-4 text-left transition ${
                active ? 'border-white bg-white text-black' : 'border-white/20 text-white/60 hover:border-white/40'
              }`}
            >
              <span className="block text-2xl font-black uppercase">{g.name}</span>
              <span className={`block text-sm font-bold ${active ? 'text-black/60' : 'text-white/40'}`}>
                {g.tagline}
              </span>
            </button>
          )
        })}
      </div>

      {pick === 'hearsay' && (
        <div className="flex gap-3">
          {(['mild', 'spicy'] as const).map((option) => (
            <button
              key={option}
              onClick={() => {
                setTone(option)
                setHearsayTone(option)
              }}
              className={`rounded-xl border-4 px-8 py-3 text-xl font-black uppercase ${
                tone === option ? 'border-white bg-white text-black' : 'border-white/30 text-white/50'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {pick === 'whosaidit' && <WhoSaidItLobbySetup players={players} />}

      <button
        disabled={!canStart}
        onClick={() => runtime.current?.start(selected)}
        className="rounded-2xl bg-white px-16 py-6 text-4xl font-black uppercase text-black disabled:opacity-20"
      >
        {canStart ? `Start ${selected.name}` : blockedReason}
      </button>

      <button
        onClick={newRoom}
        className="rounded-xl border-4 border-white/30 px-8 py-3 text-xl font-black uppercase tracking-widest text-white/60"
      >
        New room
      </button>
    </main>
  )
}
