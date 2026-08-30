'use client'

import { Button, Slab, Sticker } from '@/components/kit'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const SHOUTS = [
  'who is the problem',
  'the room is talking about you',
  'nobody is safe',
  'your own group chat, weaponised',
  'the machine misunderstood you',
  'point at your friends',
]

export default function Landing() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const ready = code.trim().length === 4

  return (
    <main className="relative h-full overflow-hidden" style={{ backgroundColor: 'var(--color-yellow)' }}>
      <div className="dots pointer-events-none absolute inset-0" aria-hidden />

      {/* The ticker is duplicated so the loop has no seam. */}
      <div className="absolute top-0 left-0 w-full overflow-hidden border-b-4 border-[var(--color-ink)] py-2">
        <div className="marquee flex w-max gap-8 font-mono text-sm font-bold uppercase tracking-widest">
          {[...SHOUTS, ...SHOUTS].map((s, i) => (
            <span key={i}>{s} ✦</span>
          ))}
        </div>
      </div>

      <div className="relative flex h-full flex-col items-center justify-center gap-8 px-6">
        <div className="flex flex-col items-center gap-3">
          <Sticker tone="pink" tilt={-4}>party games</Sticker>
          <h1 className="text-[clamp(4rem,18vw,9rem)] leading-[0.82] font-extrabold tracking-tighter uppercase">
            Ruckus
          </h1>
          <p className="max-w-xs text-center text-lg font-bold text-balance">
            For people who know each other far too well.
          </p>
        </div>

        <Slab className="w-full max-w-sm p-5" tilt={-1}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (ready) router.push(`/play/${code.trim().toUpperCase()}`)
            }}
          >
            <label className="text-center text-xs font-extrabold tracking-[0.3em] uppercase opacity-60">
              Room code
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="••••"
              autoCapitalize="characters"
              autoComplete="off"
              inputMode="text"
              aria-label="Room code"
              className="slab-sm w-full bg-[var(--color-paper)] py-5 text-center font-mono text-5xl font-bold tracking-[0.25em] outline-none"
            />
            <Button disabled={!ready} size="lg" tone="pink" className="w-full">
              {ready ? 'Join' : 'Four letters'}
            </Button>
          </form>
        </Slab>

        <button
          onClick={() => router.push('/host')}
          className="font-mono text-sm font-bold uppercase tracking-widest underline decoration-2 underline-offset-4 opacity-60 transition-opacity hover:opacity-100"
        >
          I am the big screen
        </button>
      </div>
    </main>
  )
}
