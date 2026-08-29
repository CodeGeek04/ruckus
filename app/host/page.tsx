'use client'

import { QrCode } from '@/components/QrCode'
import { Countdown } from '@/components/Countdown'
import { PlayerChip } from '@/components/PlayerChip'
import { GAMES } from '@/lib/games/registry'
import { newRoomCode } from '@/lib/ids'
import { createHostRuntime, type HostRuntime } from '@/lib/runtime/hostRuntime'
import type { GameModule, Player } from '@/lib/types'
import { useEffect, useRef, useState } from 'react'

export default function HostPage() {
  const [code] = useState(newRoomCode)
  const [players, setPlayers] = useState<Player[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [game, setGame] = useState<GameModule<any, any, any, any> | null>(null)
  const [view, setView] = useState<unknown>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const runtime = useRef<HostRuntime | null>(null)

  useEffect(() => {
    const rt = createHostRuntime(code, {
      onPlayers: setPlayers,
      onView: (nextView, nextDeadline) => {
        setView(nextView)
        setDeadline(nextDeadline)
      },
      onGame: setGame,
      onSound: () => {},
    })
    runtime.current = rt
    return () => rt.destroy()
  }, [code])

  const joinUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/play/${code}`
  const hearsay = GAMES.hearsay
  const canStart = players.length >= hearsay.minPlayers

  if (game && view) {
    const Screen = game.HostScreen
    return (
      <main className="relative h-full">
        <div className="absolute right-10 top-8 z-10 text-7xl font-black">
          <Countdown deadline={deadline} />
        </div>
        <Screen view={view} />
      </main>
    )
  }

  return (
    <main className="flex h-full flex-col items-center justify-center gap-10 p-10">
      <h1 className="text-5xl font-black uppercase tracking-widest text-white/50">Ruckus</h1>

      <div className="flex items-center gap-12">
        <div className="text-center">
          <p className="text-2xl font-bold uppercase tracking-widest text-white/50">Go to ruckus and enter</p>
          <p className="font-mono text-[10rem] font-black leading-none tracking-widest">{code}</p>
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

      <button
        disabled={!canStart}
        onClick={() => runtime.current?.start(hearsay)}
        className="rounded-2xl bg-white px-16 py-6 text-4xl font-black uppercase text-black disabled:opacity-20"
      >
        {canStart ? 'Start Hearsay' : `Need ${hearsay.minPlayers} players`}
      </button>
    </main>
  )
}
