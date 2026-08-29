'use client'

import { Countdown } from '@/components/Countdown'
import { GAMES } from '@/lib/games/registry'
import { createPlayerClient, type PlayerClient } from '@/lib/runtime/playerClient'
import { viewPhase } from '@/lib/runtime/protocol'
import type { Player } from '@/lib/types'
import { use, useEffect, useRef, useState } from 'react'

export default function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)

  const [me, setMe] = useState<Player | null>(null)
  const [name, setName] = useState('')
  const [view, setView] = useState<unknown>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [lobby, setLobby] = useState<Player[]>([])
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting')
  const client = useRef<PlayerClient | null>(null)

  useEffect(() => {
    const pc = createPlayerClient(code, {
      onAccepted: setMe,
      onView: (nextView, nextDeadline, nextGameId) => {
        setView(nextView)
        setDeadline(nextDeadline)
        setGameId(nextGameId)
      },
      onLobby: setLobby,
      onStatus: setStatus,
    })
    client.current = pc
    return () => pc.destroy()
  }, [code])

  if (!me) {
    return (
      <main className="flex h-full flex-col justify-center gap-5 p-6">
        <p className="text-center font-mono text-4xl font-black tracking-widest text-white/50">{code}</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 12))}
          placeholder="Your name"
          className="rounded-2xl border-4 border-white/30 bg-white/5 px-5 py-6 text-center text-3xl font-black"
        />
        <button
          disabled={name.trim().length === 0 || status !== 'open'}
          onClick={() => client.current?.join(name.trim())}
          className="rounded-2xl bg-white py-6 text-3xl font-black uppercase text-black disabled:opacity-30"
        >
          {status === 'open' ? 'Join' : 'Connecting...'}
        </button>
      </main>
    )
  }

  if (!view) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-4xl font-black uppercase">You&apos;re in</p>
        <p className="text-xl font-bold text-white/50">{lobby.length} in the room. Watch the big screen.</p>
      </main>
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
      <div className="absolute right-4 top-3 text-2xl font-black">
        <Countdown deadline={ended ? null : deadline} />
      </div>
      <Screen view={view} send={(input: unknown) => client.current?.send(input)} />
    </main>
  )
}
