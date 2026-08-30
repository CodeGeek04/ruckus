'use client'

import { BigButton } from '@/components/BigButton'
import type { WhoSaidItInput } from './state'
import type { WhoSaidItPlayerView } from './views'

/** Mirrored to the phone: Discord compression makes this text unreadable on
 *  the shared screen, and it is the only thing the round is about. */
function Quote({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p className="rounded-2xl bg-white/5 p-4 text-xl font-bold leading-snug text-white">
      &ldquo;{text}&rdquo;
    </p>
  )
}

export function WhoSaidItPlayerScreen({
  view,
  send,
}: {
  view: WhoSaidItPlayerView
  send: (input: WhoSaidItInput) => void
}) {
  if (view.phase === 'ended' && view.totalRounds === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-4xl font-black uppercase text-white">Nothing to play</p>
        <p className="text-lg font-bold text-white/50">The host has to load a chat first.</p>
      </div>
    )
  }

  if (view.isAuthor && view.phase === 'message') {
    return (
      <div className="flex h-full flex-col justify-center gap-5 p-5 text-center">
        <p className="text-4xl font-black uppercase text-yellow-400">You said this</p>
        <Quote text={view.message} />
        <p className="text-lg font-bold text-white/50">Say nothing. Let them work.</p>
      </div>
    )
  }

  if (view.action === 'guess') {
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
        <Quote text={view.message} />
        <p className="text-sm font-black uppercase tracking-widest text-white/40">Who said it?</p>
        <div className="flex flex-col gap-3 pb-6">
          {view.candidates.map((author) => (
            <BigButton
              key={author}
              selected={view.myGuess === author}
              onClick={() => send({ kind: 'guess', target: author })}
            >
              {author}
            </BigButton>
          ))}
        </div>
      </div>
    )
  }

  if (view.phase === 'reveal') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
        <p className="text-2xl font-bold uppercase tracking-widest text-white/50">It was</p>
        <p className="text-5xl font-black uppercase text-white">{view.authorName}</p>
        {view.wasCorrect === true && <p className="text-4xl font-black uppercase text-green-400">+500</p>}
        {view.wasCorrect === false && <p className="text-3xl font-black uppercase text-red-500">Wrong</p>}
        {view.isAuthor && <p className="text-2xl font-black uppercase text-yellow-400">That was you</p>}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-4xl font-black uppercase text-white">Watch the screen</p>
      <p className="text-6xl font-black tabular-nums text-white/80">{view.myScore}</p>
    </div>
  )
}
