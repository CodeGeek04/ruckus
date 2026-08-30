'use client'

import { useEffect, useState } from 'react'

/** Phones render from the deadline, so no per-tick messages cross the wire. */
export function Countdown({ deadline, className = '' }: { deadline: number | null; className?: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])

  if (deadline === null) return null

  const remaining = Math.max(0, deadline - now)
  const seconds = Math.ceil(remaining / 1000)
  const urgent = seconds <= 5

  return (
    <div
      className={`font-mono tabular-nums ${urgent ? 'shove' : ''} ${className}`}
      style={{ color: urgent ? 'var(--color-red)' : 'var(--color-ink)' }}
    >
      {seconds}
    </div>
  )
}
