'use client'

import { Button, Field, Slab, Sticker } from '@/components/kit'
import { useState } from 'react'
import type { AuthorKey, WhoSaidItInput } from './state'
import type { WhoSaidItPlayerView } from './views'

/**
 * The phone for Who Said It.
 *
 * The one screen that matters is the guess: cream paper, the message at the
 * top, and a stack of chunky thumb sized names under it. Everything else is a
 * drenched full bleed panel, because a phone that has nothing for you to do
 * should say so loudly and then get out of the way.
 */

/** Mirrored here because Discord compression makes the shared screen unreadable. */
function Quote({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <Slab tone="chalk" className="px-4 py-3" style={{ borderRadius: '20px 20px 20px 5px' }}>
      <p className="text-lg leading-snug font-extrabold tracking-tight break-words">{text}</p>
    </Slab>
  )
}

/** A whole screen of one colour, for the moments the phone is just an audience. */
function Panel({
  hue,
  children,
}: {
  hue: 'pink' | 'yellow' | 'blue' | 'lime' | 'red'
  children: React.ReactNode
}) {
  return (
    <Field hue={hue}>
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">{children}</div>
    </Field>
  )
}

export function WhoSaidItPlayerScreen({
  view,
  send,
}: {
  view: WhoSaidItPlayerView
  send: (input: WhoSaidItInput) => void
}) {
  // A tap has to look answered before the host has answered back, so the
  // choice is held locally and keyed to the round. Presentation only: the
  // guess that counts is the one the reducer recorded.
  const [tapped, setTapped] = useState<{ round: number; author: AuthorKey } | null>(null)
  const chosen = tapped && tapped.round === view.roundNumber ? tapped.author : view.myGuess

  if (view.phase === 'ended' && view.totalRounds === 0) {
    return (
      <Panel hue="red">
        <p className="text-4xl leading-none font-extrabold tracking-tighter uppercase">Nothing to play</p>
        <Slab tone="chalk" className="px-5 py-3">
          <p className="font-bold">The host has to load a chat first.</p>
        </Slab>
      </Panel>
    )
  }

  // You wrote it. You are not guessing, and you are not being asked to.
  if (view.isAuthor && view.phase === 'message') {
    return (
      <Panel hue="yellow">
        <Sticker tone="chalk" tilt={-3}>
          this one is yours
        </Sticker>
        <p className="text-4xl leading-none font-extrabold tracking-tighter uppercase">You typed this</p>
        <div className="w-full text-left">
          <Quote text={view.message} />
        </div>
        <p className="font-mono text-sm font-bold lowercase opacity-65">say nothing. let them work.</p>
      </Panel>
    )
  }

  if (view.action === 'guess') {
    return (
      <div
        className="h-full overflow-y-auto"
        style={{ backgroundColor: 'var(--color-paper)' }}
      >
        <div className="flex min-h-full flex-col gap-4 p-4 pt-12 pb-8">
          <Quote text={view.message} />
          <p className="font-mono text-xs font-bold tracking-[0.25em] uppercase opacity-55">
            who said it
          </p>
          <div className="flex flex-col gap-3">
            {view.candidates.map((author) => (
              <Button
                key={author}
                // The chosen name changes colour as well as taking the kit's
                // selected ring: on a cream page a ring alone is too quiet to
                // read at arm's length.
                tone={chosen === author ? 'pink' : 'chalk'}
                size="md"
                selected={chosen === author}
                onClick={() => {
                  setTapped({ round: view.roundNumber, author })
                  send({ kind: 'guess', target: author })
                }}
                className="w-full truncate text-left"
              >
                {author}
              </Button>
            ))}
          </div>
          {chosen && (
            <p className="text-center font-mono text-sm font-bold lowercase opacity-60">
              locked in. tap another to change it.
            </p>
          )}
        </div>
      </div>
    )
  }

  if (view.phase === 'reveal') {
    return (
      <Panel hue={view.wasCorrect === false ? 'red' : 'pink'}>
        <p className="font-mono text-sm font-bold tracking-[0.3em] uppercase opacity-65">it was</p>
        <div className="stamp w-full">
          <Slab tone="chalk" tilt={-2} className="px-4 py-3">
            <p className="text-4xl leading-none font-extrabold tracking-tighter uppercase break-words">
              {view.authorName}
            </p>
          </Slab>
        </div>
        {view.wasCorrect === true && (
          <Slab tone="lime" className="pop px-6 py-2" tilt={2}>
            <p className="text-4xl leading-none font-extrabold tabular-nums">+500</p>
          </Slab>
        )}
        {view.wasCorrect === false && (
          <p className="text-3xl leading-none font-extrabold tracking-tighter uppercase">Not even close</p>
        )}
        {view.isAuthor && (
          <Sticker tone="yellow" tilt={2}>
            that was you
          </Sticker>
        )}
      </Panel>
    )
  }

  return (
    <Panel hue="blue">
      <p className="text-3xl leading-none font-extrabold tracking-tighter uppercase">Watch the screen</p>
      <Slab tone="chalk" className="px-8 py-3" tilt={-1.5}>
        <p className="text-6xl leading-none font-extrabold tabular-nums">{view.myScore}</p>
      </Slab>
      <p className="font-mono text-xs font-bold tracking-[0.25em] uppercase opacity-60">your score</p>
    </Panel>
  )
}
