'use client'

import { Countdown } from '@/components/Countdown'
import { Button, Field, Slab, Sticker } from '@/components/kit'
import { GAMES } from '@/lib/games/registry'
import { createPlayerClient, type PlayerClient } from '@/lib/runtime/playerClient'
import { viewPhase } from '@/lib/runtime/protocol'
import { cleanName, truncateName } from '@/lib/text'
import type { Player } from '@/lib/types'
import { use, useEffect, useRef, useState } from 'react'

export default function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  // Normalised here too: a link can arrive with a lower case code from a chat
  // app that helpfully lowercased it, and the channel helpers are case
  // sensitive about what the host is listening on.
  const { code: rawCode } = use(params)
  const code = rawCode.trim().toUpperCase()

  const [me, setMe] = useState<Player | null>(null)
  const [name, setName] = useState('')
  const [view, setView] = useState<unknown>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [lobby, setLobby] = useState<Player[]>([])
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting')
  const [hostStatus, setHostStatus] = useState<'live' | 'gone'>('live')
  const [rejected, setRejected] = useState<string | null>(null)
  const client = useRef<PlayerClient | null>(null)

  useEffect(() => {
    const pc = createPlayerClient(code, {
      onAccepted: (player) => {
        setRejected(null)
        setMe(player)
      },
      onView: (nextView, nextDeadline, nextGameId) => {
        setView(nextView)
        setDeadline(nextDeadline)
        setGameId(nextGameId)
      },
      onLobby: (players) => {
        setLobby(players)
        // The host is back in its lobby, so whatever it turned this phone away
        // for is over. The client re-announces on its own.
        setRejected(null)
        // The host went back to its lobby, so drop the last game screen rather
        // than leaving a dead round on everyone's phone.
        setView(null)
        setGameId(null)
        setDeadline(null)
      },
      onStatus: setStatus,
      onHostStatus: setHostStatus,
      onRejected: setRejected,
    })
    client.current = pc
    return () => pc.destroy()
  }, [code])

  if (rejected) {
    return (
      <Field hue="orange" pattern="stripes">
        <main className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
          <p className="text-6xl">⏳</p>
          <h1 className="text-[length:var(--text-title)] leading-[1.05] font-extrabold uppercase">
            Already started
          </h1>
          <Slab tone="chalk" className="max-w-xs px-5 py-4" tilt={-1}>
            <p className="text-[length:var(--text-body)] font-bold">{rejected}</p>
          </Slab>
          <Sticker tone="chalk" tilt={2}>room {code}</Sticker>
        </main>
      </Field>
    )
  }

  if (!me) {
    const ready = cleanName(name).length > 0 && status === 'open'
    return (
      <Field hue="yellow">
        <main className="flex h-full flex-col justify-center gap-5 p-6">
          <div className="flex flex-col items-center gap-2">
            <Sticker tone="pink" tilt={-3}>joining</Sticker>
            <p className="text-center font-mono text-[length:var(--text-hero)] leading-none font-bold tracking-[0.15em]">
              {code}
            </p>
          </div>

          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (ready) client.current?.join(cleanName(name))
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(truncateName(e.target.value))}
              placeholder="Your name"
              aria-label="Your name"
              autoComplete="off"
              className="slab w-full bg-[var(--color-chalk)] px-5 py-6 text-center text-3xl font-extrabold outline-none placeholder:opacity-30"
            />
            <Button disabled={!ready} size="lg" tone="pink" className="w-full">
              {status === 'open' ? 'Join' : 'Connecting'}
            </Button>
          </form>

          <p className="text-center font-mono text-[length:var(--text-micro)] font-bold lowercase opacity-55">
            {status === 'open' ? 'then watch the big screen' : 'finding the room'}
          </p>
        </main>
      </Field>
    )
  }

  if (hostStatus === 'gone') {
    return (
      <Field hue="red" pattern="stripes">
        <main className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
          <p className="text-6xl">📺</p>
          <h1 className="text-[length:var(--text-title)] leading-[1.05] font-extrabold uppercase">
            Lost the host
          </h1>
          <Slab tone="chalk" className="max-w-xs px-5 py-4" tilt={1}>
            <p className="text-[length:var(--text-body)] font-bold">
              The big screen stopped responding. This reconnects on its own the moment it is back.
            </p>
          </Slab>
          <Sticker tone="chalk" tilt={-2}>room {code}</Sticker>
        </main>
      </Field>
    )
  }

  if (!view) {
    return (
      <Field hue="mint">
        <main className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
          <Sticker tone="chalk" tilt={-3}>you are in</Sticker>
          <h1 className="text-[length:var(--text-hero)] leading-[0.95] font-extrabold uppercase">
            {me.name}
          </h1>
          <Slab tone="chalk" className="px-6 py-4" tilt={1.5}>
            <p className="text-[length:var(--text-lead)] font-extrabold tabular-nums">
              {lobby.length} in the room
            </p>
            <p className="mt-1 font-mono text-[length:var(--text-micro)] font-bold lowercase opacity-55">
              watch the big screen
            </p>
          </Slab>
        </main>
      </Field>
    )
  }

  // The wire carries the game id, so the phone never has to know which game
  // the host picked. An id this build does not have simply renders nothing.
  const gameModule = gameId ? GAMES[gameId] : undefined
  if (!gameModule) return null
  const Screen = gameModule.PlayerScreen
  const ended = viewPhase(view) === 'ended'

  return (
    <main className="relative h-full">
      <div className="pointer-events-none absolute top-3 right-3 z-20">
        <Slab tone="chalk" className="px-3 py-0.5" tilt={3}>
          <Countdown deadline={ended ? null : deadline} className="text-2xl font-extrabold" />
        </Slab>
      </div>
      <Screen view={view} send={(input: unknown) => client.current?.send(input)} />
    </main>
  )
}
