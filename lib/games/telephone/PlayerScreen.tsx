'use client'

import { useEffect, useRef, useState } from 'react'
import { BigButton } from '@/components/BigButton'
import type { TelephoneInput } from './state'
import type { TelephonePlayerView } from './views'

/** How often a phone re-offers a picture the host has not acknowledged. */
const RESEND_MS = 5000

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

function Composer({
  view,
  send,
}: {
  view: TelephonePlayerView
  send: (input: TelephoneInput) => void
}) {
  const [text, setText] = useState('')
  const describing = view.action === 'describe'

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <p className="text-2xl font-black uppercase leading-tight text-white">
        {describing ? 'What was the sentence?' : 'Write a sentence'}
      </p>

      {view.sourceImage && (
        <div className="min-h-0 flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={view.sourceImage}
            alt="The picture you have to describe"
            className="h-full w-full rounded-2xl border-4 border-white/20 object-contain"
          />
        </div>
      )}

      {!describing && (
        <p className="text-lg font-bold text-white/50">
          Anything you like. The stranger the better.
        </p>
      )}

      <input
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, view.maxTextLength))}
        placeholder={describing ? 'A cat running a bank...' : 'A cat running a bank...'}
        autoComplete="off"
        className="rounded-2xl border-4 border-white/30 bg-white/5 px-5 py-6 text-2xl font-bold text-white placeholder:text-white/25"
      />
      <p className="text-right text-sm font-bold tabular-nums text-white/30">
        {text.length} / {view.maxTextLength}
      </p>

      <BigButton disabled={text.trim().length === 0} onClick={() => send({ kind: 'submit', text })}>
        <span className="block text-center text-2xl font-black uppercase">Send it</span>
      </BigButton>
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
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="h-16 w-16 animate-spin rounded-full border-8 border-white/15 border-t-white" />
        <p className="text-3xl font-black uppercase text-white">Drawing it</p>
        <p className="max-w-xs text-xl font-bold italic leading-snug text-white/60">
          &ldquo;{view.myText}&rdquo;
        </p>
        <p className="text-sm font-black uppercase tracking-widest text-white/30">
          {view.drawn} of {view.total} pictures back
        </p>
      </div>
    )
  }

  if (view.action === 'vote') {
    return (
      <div className="flex h-full flex-col gap-3 p-5">
        <p className="text-2xl font-black uppercase text-white">Best chain?</p>
        <p className="text-base font-bold text-white/50">You cannot pick your own.</p>
        <div className="flex flex-col gap-3 overflow-y-auto">
          {view.voteOptions.map((option) => (
            <BigButton
              key={option.index}
              selected={view.myVote === option.index}
              onClick={() => send({ kind: 'vote', chainIndex: option.index })}
            >
              <span className="flex items-center gap-3">
                {option.thumbnail && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={option.thumbnail} alt="" className="h-14 w-14 rounded-lg object-cover" />
                )}
                <span className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full" style={{ backgroundColor: option.color }} />
                  {option.starterName} started it
                </span>
              </span>
            </BigButton>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-4xl font-black uppercase leading-tight text-white">
        {view.phase === 'reveal' ? 'Watch the screen' : view.phase === 'ended' ? 'Thanks for playing' : 'Hold tight'}
      </p>
      <p className="text-6xl font-black tabular-nums text-white/80">{view.myScore}</p>
    </div>
  )
}
