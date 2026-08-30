'use client'

import type { CSSProperties, ReactNode } from 'react'

/**
 * The shared vocabulary. Both surfaces use these, so the host screen and the
 * phone are visibly the same product despite being completely different design
 * problems. See DESIGN.md.
 */

/** The drench palette, in the order the player wheel assigns them. */
export const HUES = {
  pink: 'var(--color-pink)',
  yellow: 'var(--color-yellow)',
  blue: 'var(--color-blue)',
  mint: 'var(--color-mint)',
  orange: 'var(--color-orange)',
  violet: 'var(--color-violet)',
  lime: 'var(--color-lime)',
  red: 'var(--color-red)',
} as const

export type Hue = keyof typeof HUES

/**
 * A flat field of colour with a pattern laid over it. Every phase gets its own,
 * so the room can tell what is happening from across a lounge without reading.
 */
export function Field({
  hue,
  pattern = 'dots',
  children,
  className = '',
}: {
  hue: Hue
  pattern?: 'dots' | 'stripes' | 'none'
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`relative h-full overflow-hidden transition-colors duration-500 ${className}`}
      style={{ backgroundColor: HUES[hue] }}
    >
      {pattern !== 'none' && (
        <div className={`pointer-events-none absolute inset-0 ${pattern}`} aria-hidden />
      )}
      <div className="relative h-full">{children}</div>
    </div>
  )
}

/** A bordered block with a hard offset shadow. Never nested inside another. */
export function Slab({
  children,
  className = '',
  tone = 'chalk',
  tilt = 0,
  style,
}: {
  children: ReactNode
  className?: string
  tone?: Hue | 'chalk' | 'paper' | 'ink'
  tilt?: number
  style?: CSSProperties
}) {
  const background =
    tone === 'chalk'
      ? 'var(--color-chalk)'
      : tone === 'paper'
        ? 'var(--color-paper)'
        : tone === 'ink'
          ? 'var(--color-ink)'
          : HUES[tone]

  return (
    <div
      className={`slab ${className}`}
      style={{
        backgroundColor: background,
        color: tone === 'ink' ? 'var(--color-paper)' : 'var(--color-ink)',
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** The primary action. Thumb sized, depresses by its own shadow offset. */
export function Button({
  children,
  onClick,
  disabled = false,
  tone = 'pink',
  size = 'md',
  selected = false,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  tone?: Hue | 'chalk' | 'ink'
  size?: 'sm' | 'md' | 'lg'
  selected?: boolean
  className?: string
}) {
  const pad = { sm: 'px-5 py-3 text-base', md: 'px-7 py-4 text-xl', lg: 'px-10 py-5 text-3xl' }[size]

  // Selection is shown by an inset ring and a lift, never by swapping the fill
  // to ink: a black chip in a row of coloured ones reads as switched off.
  const background =
    tone === 'chalk' ? 'var(--color-chalk)' : tone === 'ink' ? 'var(--color-ink)' : HUES[tone]

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected || undefined}
      className={`slab press ${pad} font-extrabold uppercase tracking-tight transition-[opacity,transform] ${
        selected ? 'scale-105 ring-4 ring-[var(--color-ink)] ring-inset' : ''
      } ${className}`}
      style={{
        // Disabled falls back to chalk: a washed-out saturated fill on a
        // saturated field turns muddy.
        backgroundColor: disabled ? 'var(--color-chalk)' : background,
        color: tone === 'ink' && !disabled ? 'var(--color-paper)' : 'var(--color-ink)',
        opacity: disabled ? 0.55 : selected ? 1 : 0.92,
      }}
    >
      {children}
    </button>
  )
}

/** A rotated sticker. Decoration with a job: it names the moment. */
export function Sticker({
  children,
  tone = 'yellow',
  tilt = -3,
  className = '',
}: {
  children: ReactNode
  tone?: Hue | 'chalk'
  tilt?: number
  className?: string
}) {
  return (
    <span
      className={`slab-sm inline-block px-4 py-1.5 text-sm font-extrabold uppercase tracking-widest ${className}`}
      style={{
        backgroundColor: tone === 'chalk' ? 'var(--color-chalk)' : HUES[tone],
        transform: `rotate(${tilt}deg)`,
      }}
    >
      {children}
    </span>
  )
}

/** A player, as a face. The colour is their identity all game. */
export function Face({
  name,
  color,
  size = 'md',
  dim = false,
  crown = false,
}: {
  name: string
  color: string
  size?: 'sm' | 'md' | 'lg'
  dim?: boolean
  crown?: boolean
}) {
  const box = {
    sm: 'h-11 w-11 text-base',
    md: 'h-16 w-16 text-2xl',
    lg: 'h-24 w-24 text-4xl',
  }[size]

  return (
    <div className={`flex flex-col items-center gap-1.5 ${dim ? 'opacity-35' : ''}`}>
      <div className="relative">
        {crown && <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-2xl">👑</span>}
        <div
          className={`slab-sm grid place-items-center font-extrabold uppercase ${box}`}
          style={{ backgroundColor: color, borderRadius: 999 }}
        >
          {name.slice(0, 2)}
        </div>
      </div>
      <span className="max-w-20 truncate text-xs font-extrabold uppercase tracking-wide">{name}</span>
    </div>
  )
}

/**
 * The commentary slot. Reserved space that can be empty without anything
 * moving, because the line is optional by design.
 */
export function Aside({ line }: { line: string | null }) {
  if (!line) return null
  return (
    <p className="stamp font-mono text-[clamp(0.85rem,1.4vw,1.15rem)] font-medium lowercase opacity-70">
      {line}
    </p>
  )
}
