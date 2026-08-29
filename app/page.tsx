'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function Landing() {
  const router = useRouter()
  const [code, setCode] = useState('')

  return (
    <main className="flex h-full flex-col items-center justify-center gap-10 p-8">
      <h1 className="text-7xl font-black uppercase tracking-tighter">Ruckus</h1>

      <form
        className="flex w-full max-w-sm flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim().length === 4) router.push(`/play/${code.trim().toUpperCase()}`)
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
          placeholder="CODE"
          autoCapitalize="characters"
          autoComplete="off"
          className="w-full rounded-2xl border-4 border-white/30 bg-white/5 py-6 text-center font-mono text-5xl font-black tracking-[0.3em]"
        />
        <button
          type="submit"
          disabled={code.trim().length !== 4}
          className="rounded-2xl bg-white py-5 text-2xl font-black uppercase text-black disabled:opacity-30"
        >
          Join
        </button>
      </form>

      <button
        onClick={() => router.push('/host')}
        className="text-lg font-bold uppercase tracking-widest text-white/40 underline"
      >
        Host a game on this screen
      </button>
    </main>
  )
}
