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
/**
 * The room this browser was last hosting, whether or not a game was running.
 *
 * This deliberately does not require a resumable game. The code is printed on
 * the TV and scanned off it, and everyone in the room has already typed it, so
 * minting a new one on a refresh strands the whole party on a dead room with a
 * QR code that no longer goes anywhere. "New room" is how a host asks for a
 * different code, and it is the only thing that gives one.
 */
function resumableCode(): string | null {
  try {
    const last = localStorage.getItem(LAST_ROOM_KEY)
    return last && last.length === 4 ? last : null
  } catch {
    return null
  }
}

/** Drops the saved round. The room code itself survives: see resumableCode. */
function forget(code: string) {
  try {
    localStorage.removeItem(SNAPSHOT_KEY(code))
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

/**
 * Phases where the round is decided and the scoreboard is the only thing left
 * before the next one. Skipping straight past it is two clicks saved every
 * round, and the standings are on screen the whole time anyway.
 */
const SKIPPABLE_SCOREBOARD: Record<string, string> = {
  hearsay: 'verdict',
  whosaidit: 'reveal',
}

/** Fixed at mount: a QR that resizes when you change games is the jump. */
const QR_PX = 132

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
  const [copied, setCopied] = useState(false)
  const [expandedReset, setExpandedReset] = useState(0)
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
    try {
      localStorage.removeItem(LAST_ROOM_KEY)
    } catch {
      // Storage is unavailable, so there was nothing pinning the code anyway.
    }
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
  // The QR points at the room directly. The shareable link uses /join so it
  // survives being lowercased, wrapped or mangled by a chat app.
  const joinUrl = code && origin ? `${origin}/play/${code}` : ''
  const shareUrl = code && origin ? `${origin}/join?code=${code}` : ''
  const selected = GAMES[pick]

  // Every game needs enough players. Who Said It additionally needs a chat
  // export loaded with enough authors on the answer board, and says so in its
  // own words.
  const enoughPlayers = players.length >= selected.minPlayers
  const extra = pick === 'whosaidit' && chatSource ? whoSaidItStatus(players) : { ready: pick !== 'whosaidit', reason: pick === 'whosaidit' ? 'Load a chat export' : '' }
  const canStart = enoughPlayers && extra.ready
  const blockedReason = !enoughPlayers ? `Need ${selected.minPlayers} players` : extra.reason

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

        <Screen key={expandedReset} view={view} />

        <div className="absolute right-8 bottom-6 z-20 flex items-center gap-3">
          <button
            onClick={endGame}
            className="font-mono text-xs font-bold tracking-widest uppercase underline decoration-2 underline-offset-4 opacity-45 transition-opacity hover:opacity-90"
          >
            End game
          </button>
          {ended && (
            <Button
              onClick={() => {
                // Same game, same players, fresh state. Works for every game
                // because it goes through the module contract, not a per game
                // restart path.
                setExpandedReset((n) => n + 1)
                runtime.current?.start(game)
              }}
              tone="mint"
              size="md"
            >
              Play again
            </Button>
          )}
          {!ended && SKIPPABLE_SCOREBOARD[game.id] === viewPhase(view) && (
            <button
              onClick={() => {
                // Through the scoreboard and into the next round. Two separate
                // advances, so the reducer runs exactly as it would by hand.
                runtime.current?.advance()
                runtime.current?.advance()
              }}
              className="font-mono text-xs font-bold tracking-widest uppercase underline decoration-2 underline-offset-4 opacity-60 transition-opacity hover:opacity-100"
            >
              Next round
            </button>
          )}
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
      className="relative grid min-h-full grid-rows-[auto_1fr_auto] gap-4 overflow-y-auto p-6"
      style={{ backgroundColor: 'var(--color-yellow)' }}
    >
      <div className="dots pointer-events-none absolute inset-0" aria-hidden />

      <header className="relative flex items-center justify-between">
        <h1 className="text-[length:var(--text-title)] font-extrabold tracking-tighter uppercase">Ruckus</h1>
        <Sticker tone="pink" tilt={2}>
          {players.length === 0 ? 'waiting' : `${players.length} in`}
        </Sticker>
      </header>

      {/*
       * Every row below has a FIXED height. Switching games swaps what is
       * inside the options row and nothing else moves: an earlier version
       * resized the room code and the QR depending on the selected game, so
       * the whole screen jumped every time somebody changed their mind.
       */}
      <div className="relative grid grid-rows-[auto_auto_minmax(var(--row-players),auto)_auto_auto] content-center items-center justify-items-center gap-5 py-2">
        <div className="flex items-center gap-6">
          <Slab tone="chalk" className="px-8 py-3" tilt={-1.5}>
            <p className="text-center font-mono text-[length:var(--text-micro)] font-bold tracking-[0.25em] uppercase opacity-55">
              go to {hostName || 'ruckus'}
            </p>
            <p
              data-room-code={code ?? ''}
              className="mt-1 text-center font-mono text-[length:var(--text-mega)] leading-[1] font-bold tracking-[0.12em] tabular-nums"
            >
              {code ?? '••••'}
            </p>
          </Slab>
          <Slab tone="chalk" className="p-2" tilt={2.5}>
            {joinUrl ? (
              <QrCode value={joinUrl} size={QR_PX} />
            ) : (
              <div style={{ width: QR_PX, height: QR_PX }} />
            )}
          </Slab>
        </div>

        <button
          onClick={() => {
            if (!shareUrl) return
            // Clipboard access can be refused (insecure origin, denied
            // permission). Falling back to selecting nothing is worse than
            // saying so, hence the state either way.
            navigator.clipboard
              ?.writeText(shareUrl)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }}
          className="slab-sm press-sm flex items-center gap-2 bg-[var(--color-chalk)] px-4 py-2 font-mono text-[length:var(--text-micro)] font-bold lowercase"
        >
          <span className="opacity-55">{copied ? 'copied, paste it in discord' : 'copy join link'}</span>
          <span aria-hidden>{copied ? '✓' : '⧉'}</span>
        </button>

        <div className="flex w-full items-center justify-center gap-4 overflow-hidden">
          {players.map((player, i) => (
            <div key={player.id} className="rise" style={{ animationDelay: `${i * 55}ms` }}>
              <Face name={player.name} color={player.color} size="lg" dim={!player.connected} />
            </div>
          ))}
          {players.length === 0 && (
            <p className="font-mono text-[length:var(--text-body)] font-bold lowercase opacity-45">
              nobody yet. type the code on your phone.
            </p>
          )}
        </div>

        <div className="grid min-h-[var(--row-tiles)] grid-cols-3 items-stretch gap-4">
          {GAME_ORDER.map((id, i) => {
            const g = GAMES[id]
            const active = pick === id
            return (
              <button
                key={id}
                onClick={() => setPick(id)}
                aria-pressed={active}
                className="slab press-sm flex h-full w-full flex-col justify-center px-5 py-4 text-left transition-transform"
                style={{
                  backgroundColor: active ? `var(--color-${GAME_TONES[id]})` : 'var(--color-chalk)',
                  transform: active ? 'rotate(-1.5deg) scale(1.04)' : `rotate(${i % 2 ? 1 : -1}deg)`,
                  opacity: active ? 1 : 0.85,
                }}
              >
                <span className="block text-[length:var(--text-lead)] leading-[1.05] font-extrabold uppercase text-balance">
                  {g.name}
                </span>
                <span className="mt-1.5 block text-[length:var(--text-label)] leading-snug font-semibold opacity-65">
                  {g.tagline}
                </span>
              </button>
            )
          })}
        </div>

        {/* Fixed height, so what is inside can change without anything moving. */}
        <div className="flex min-h-[var(--row-options)] w-full items-center justify-center">
          {pick === 'hearsay' && (
            <div className="flex items-center gap-3">
              <span className="font-mono text-[length:var(--text-micro)] font-bold tracking-widest uppercase opacity-50">
                how mean
              </span>
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

          {pick === 'telephone' && (
            <p className="max-w-md text-center font-mono text-[length:var(--text-label)] font-bold lowercase opacity-55">
              everyone writes, a machine draws it, the next person guesses what you wrote.
            </p>
          )}
        </div>
      </div>

      <div className="relative flex items-center justify-center gap-4">
        <button
          onClick={newRoom}
          className="font-mono text-[length:var(--text-micro)] font-bold tracking-widest uppercase underline decoration-2 underline-offset-4 opacity-45 transition-opacity hover:opacity-90"
        >
          New room
        </button>
        <div className="flex h-[4.8rem] flex-col items-center justify-center gap-1">
          <Button disabled={!canStart} onClick={() => runtime.current?.start(selected)} size="lg" tone="pink">
            Start {selected.name}
          </Button>
          <p className="h-4 text-center font-mono text-[length:var(--text-micro)] font-bold lowercase opacity-60">
            {canStart ? '' : blockedReason}
          </p>
        </div>
      </div>
    </main>
  )
}
