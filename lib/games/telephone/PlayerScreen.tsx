'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, Field, HUES, Slab, Sticker } from '@/components/kit'
import { PLACEHOLDER_IMAGE, type TelephoneInput } from './state'
import type { TelephonePlayerView } from './views'
import { truncate } from '@/lib/text'

/** How often a phone re-offers a picture the host has not acknowledged. */
const RESEND_MS = 5000

/** The reducer swaps in a placeholder when the model refuses. Presentation only. */
function isMissing(url: string | null): boolean {
  return url === null || url === PLACEHOLDER_IMAGE || url.length === 0
}

/**
 * The phone that wrote a sentence is the one that turns it into a picture.
 *
 * That is not where this belongs architecturally: the host tab is the game
 * server and should own every API call. It cannot here, because the shell
 * gives HostScreen no way to dispatch back into the reducer, so a host driven
 * `callApi` command would have nowhere to land. See the note in index.ts.
 *
 * The upside is that it parallelises for free: N phones generate N pictures at
 * once, each one starting the instant its own sentence is submitted rather than
 * waiting for the slowest writer in the room.
 */
function useImageGeneration(view: TelephonePlayerView, send: (input: TelephoneInput) => void) {
  // Held in a ref so the generation effect never re-runs just because the page
  // handed down a fresh closure.
  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  })

  const requested = useRef<string | null>(null)
  const result = useRef<{ key: string; url: string | null } | null>(null)

  const { pendingKey, pendingPrompt } = view

  useEffect(() => {
    if (!pendingKey || !pendingPrompt || requested.current === pendingKey) return
    requested.current = pendingKey

    const deliver = (url: string | null) => {
      result.current = { key: pendingKey, url }
      sendRef.current({ kind: 'image', url, key: pendingKey })
    }

    fetch('/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: pendingPrompt }),
    })
      .then((res) => res.json())
      .then((data: { url?: unknown }) => deliver(typeof data.url === 'string' ? data.url : null))
      // A placeholder keeps the room moving. A hang would not.
      .catch(() => deliver(null))
  }, [pendingKey, pendingPrompt])

  // The host is still asking for a picture we already have, so the message was
  // lost on the way. Offer it again rather than making the room wait out the timer.
  useEffect(() => {
    if (!pendingKey) return
    const id = setInterval(() => {
      if (result.current?.key === pendingKey) {
        sendRef.current({ kind: 'image', url: result.current.url, key: pendingKey })
      }
    }, RESEND_MS)
    return () => clearInterval(id)
  }, [pendingKey])
}

/** A picture the machine never produced, made to look deliberate. */
function NoPicture({ className = '' }: { className?: string }) {
  return (
    <div
      className={`grid place-items-center text-center ${className}`}
      style={{ backgroundColor: HUES.red }}
    >
      <div>
        <p className="text-4xl leading-none font-extrabold">¯\_(ツ)_/¯</p>
        <p className="mt-2 font-mono text-[0.65rem] font-bold tracking-[0.2em] uppercase">
          no picture. guess anyway.
        </p>
      </div>
    </div>
  )
}

/**
 * The writing screen. Cream, one job, a thumb sized target at the bottom, and
 * a count you can actually see while you type.
 */
function Composer({
  view,
  send,
}: {
  view: TelephonePlayerView
  send: (input: TelephoneInput) => void
}) {
  const [text, setText] = useState('')
  const describing = view.action === 'describe'
  const left = view.maxTextLength - text.length
  const tight = left <= 15

  return (
    <div
      className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-4"
      style={{ backgroundColor: 'var(--color-paper)' }}
    >
      <header className="flex items-start justify-between gap-3 pr-12">
        <h2 className="max-w-[14ch] text-2xl leading-[0.95] font-extrabold tracking-tight uppercase">
          {describing ? 'What was the sentence?' : 'Write a sentence'}
        </h2>
        <Sticker tone={describing ? 'blue' : 'orange'} tilt={3}>
          {describing ? 'guess' : 'start'}
        </Sticker>
      </header>

      <div className="flex min-h-0 flex-col gap-3">
        {describing && view.sourceImage && (
          <Slab tone="chalk" className="min-h-0 flex-1 overflow-hidden p-1.5" tilt={-1}>
            {isMissing(view.sourceImage) ? (
              <NoPicture className="h-full w-full" />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={view.sourceImage}
                alt="The picture you have to describe"
                className="h-full w-full object-contain"
              />
            )}
          </Slab>
        )}

        {!describing && (
          <p className="text-base leading-snug font-bold opacity-65">
            Anything you like. The stranger the better. A machine is about to have a go at it.
          </p>
        )}

        {/* With no picture above it the box takes the whole screen: a big
            comfortable place to type, not a slot at the top of a blank page. */}
        <div className={`relative ${describing ? 'shrink-0' : 'min-h-0 flex-1'}`}>
          <textarea
            value={text}
            onChange={(e) => setText(truncate(e.target.value, view.maxTextLength))}
            placeholder="A cat running a bank..."
            rows={describing ? 3 : undefined}
            autoComplete="off"
            className={`slab w-full resize-none px-4 py-3 pb-8 text-xl leading-snug font-bold placeholder:opacity-35 ${
              describing ? '' : 'h-full'
            }`}
            style={{ backgroundColor: 'var(--color-chalk)' }}
          />
          <span
            className="tnum absolute right-4 bottom-4 font-mono text-xs font-bold"
            style={{ color: tight ? HUES.red : 'var(--color-ink)', opacity: tight ? 1 : 0.5 }}
          >
            {text.length} / {view.maxTextLength}
          </span>
        </div>
      </div>

      <Button
        disabled={text.trim().length === 0}
        onClick={() => send({ kind: 'submit', text })}
        tone={describing ? 'blue' : 'orange'}
        size="lg"
        className="w-full"
      >
        Send it
      </Button>
    </div>
  )
}

export function TelephonePlayerScreen({
  view,
  send,
}: {
  view: TelephonePlayerView
  send: (input: TelephoneInput) => void
}) {
  useImageGeneration(view, send)

  if (view.action === 'write' || view.action === 'describe') {
    return <Composer view={view} send={send} />
  }

  if (view.action === 'drawing') {
    return (
      <Field hue="violet" pattern="stripes">
        <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
          <Sticker tone="chalk" tilt={-4} className="wobble">
            the machine is thinking
          </Sticker>

          <Slab tone="paper" className="max-w-xs px-5 py-4" tilt={-1}>
            <p className="text-xl leading-snug font-extrabold">&ldquo;{view.myText}&rdquo;</p>
          </Slab>

          <div className="flex gap-1.5">
            {Array.from({ length: Math.max(view.total, 1) }).map((_, i) => (
              <span
                key={i}
                className={`slab-sm block h-6 w-8 ${i < view.drawn ? 'pop' : ''}`}
                style={{
                  backgroundColor: i < view.drawn ? 'var(--color-ink)' : 'var(--color-chalk)',
                }}
              />
            ))}
          </div>
          <p className="tnum font-mono text-xs font-bold tracking-[0.2em] uppercase">
            {view.drawn} of {view.total} pictures back
          </p>
        </div>
      </Field>
    )
  }

  if (view.action === 'vote') {
    return (
      <Field hue="pink">
        <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-3 p-4">
          <header className="pr-12">
            <h2 className="text-2xl leading-none font-extrabold tracking-tight uppercase">Best chain?</h2>
            <p className="mt-1 font-mono text-xs font-bold lowercase opacity-65">
              you cannot pick your own
            </p>
          </header>

          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pb-2">
            {view.voteOptions.map((option) => (
              <button
                key={option.index}
                onClick={() => send({ kind: 'vote', chainIndex: option.index })}
                className={`slab press flex w-full items-center gap-3 p-2 text-left ${
                  view.myVote === option.index ? 'ring-4 ring-[var(--color-ink)] ring-inset' : ''
                }`}
                style={{
                  backgroundColor:
                    view.myVote === option.index ? 'var(--color-yellow)' : 'var(--color-chalk)',
                }}
              >
                <span className="slab-sm block h-16 w-16 shrink-0 overflow-hidden">
                  {isMissing(option.thumbnail) ? (
                    <NoPicture className="h-full w-full" />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={option.thumbnail!} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="flex items-center gap-2 text-lg font-extrabold uppercase">
                  <span
                    className="block h-4 w-4 shrink-0"
                    style={{ backgroundColor: option.color, borderRadius: 999 }}
                  />
                  {option.starterName}
                </span>
              </button>
            ))}
          </div>
        </div>
      </Field>
    )
  }

  return (
    <Field hue={view.phase === 'ended' ? 'lime' : 'yellow'} pattern="dots">
      <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
        <h2 className="max-w-[12ch] text-4xl leading-[0.95] font-extrabold tracking-tight uppercase">
          {view.phase === 'reveal'
            ? 'Watch the screen'
            : view.phase === 'ended'
              ? 'Thanks for playing'
              : 'Hold tight'}
        </h2>
        <Slab tone="chalk" className="px-8 py-4" tilt={-2}>
          <p className="font-mono text-[0.65rem] font-bold tracking-[0.25em] uppercase opacity-55">
            your score
          </p>
          <p className="tnum text-6xl font-extrabold">{view.myScore}</p>
        </Slab>
      </div>
    </Field>
  )
}
