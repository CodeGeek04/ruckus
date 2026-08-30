'use client'

import { Button, Slab, Sticker } from '@/components/kit'
import type { HearsayInput } from './state'
import type { HearsayPlayerView } from './views'

/**
 * The phone. Cream, one action per screen, everything thumb sized.
 *
 * The accused's three options come from the view and only ever exist on the
 * accused's own phone: `view.options` is null for everybody else, and null for
 * the accused outside the guess phase. Nothing here works around that.
 */

// overflow-hidden matters: the stamp entrance starts at 1.4x scale, and on a
// 390px phone that transient width would otherwise bounce a scrollbar in.
const SHELL = 'flex h-full flex-col gap-4 overflow-hidden p-5'
/** The play page floats a countdown in the top right, so top aligned screens
 *  start below it rather than sliding a coloured slab under the clock. */
const TOP = 'pt-12'

/** A sentence inside a button must not shout: the kit's Button uppercases. */
function Plain({ children }: { children: React.ReactNode }) {
  return <span className="block normal-case">{children}</span>
}

export function HearsayPlayerScreen({
  view,
  send,
}: {
  view: HearsayPlayerView
  send: (input: HearsayInput) => void
}) {
  // Phase-based, not action-based: the accused also has action 'wait' during
  // evidence (when they must study the tally) and after the game ends.
  if (view.isAccused && (view.phase === 'charge' || view.phase === 'testimony')) {
    return (
      <div className={`${SHELL} items-center justify-center text-center`}>
        <Sticker tone="violet" tilt={-3}>
          you are the accused
        </Sticker>
        <p className="stamp text-6xl leading-none font-extrabold uppercase tracking-tighter">
          Look away
        </p>
        <Slab tone="chalk" className="px-5 py-4" tilt={1.5}>
          <p className="text-lg leading-snug font-extrabold">
            They are talking about you. Mute yourself.
          </p>
        </Slab>
      </div>
    )
  }

  // The room can already see the charge while the accused is still muting.
  // Reading it early is the whole point of the phase, and the view hands it to
  // everyone except the accused.
  if (!view.isAccused && view.phase === 'charge' && view.charge) {
    return (
      <div className={`${SHELL} ${TOP}`}>
        <span className="self-start">
          <Sticker tone="violet" tilt={-3}>
            the charge
          </Sticker>
        </span>
        <Slab tone="yellow" className="px-4 py-4" tilt={-1}>
          <p className="text-xl leading-snug font-extrabold">{view.charge}</p>
        </Slab>
        <p className="font-mono text-xs font-bold tracking-widest uppercase opacity-55">
          read it. do not say it out loud.
        </p>
      </div>
    )
  }

  if (view.action === 'vote') {
    return (
      <div className={`${SHELL} ${TOP}`}>
        <Slab tone="yellow" className="shrink-0 px-4 py-4" tilt={-1}>
          <p className="text-xl leading-snug font-extrabold">{view.charge}</p>
        </Slab>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
          {view.targets.map((player) => (
            <Button
              key={player.id}
              tone="chalk"
              selected={view.myVote === player.id}
              onClick={() => send({ kind: 'vote', targetId: player.id })}
              className="w-full shrink-0 text-left"
            >
              <span className="flex items-center gap-3">
                <span
                  className="h-7 w-7 shrink-0 border-[3px] border-[var(--color-ink)]"
                  style={{ backgroundColor: player.color, borderRadius: 999 }}
                />
                {player.name}
              </span>
            </Button>
          ))}
        </div>
      </div>
    )
  }

  if (view.action === 'guess' && view.options) {
    return (
      <div className={`${SHELL} ${TOP}`}>
        <p className="shrink-0 text-3xl leading-none font-extrabold uppercase tracking-tighter">
          What were they asked?
        </p>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
          {view.options.map((option) => (
            <Button
              key={option.id}
              tone="orange"
              selected={view.myPick === option.id}
              onClick={() => send({ kind: 'guess', questionId: option.id })}
              className="w-full shrink-0 text-left"
            >
              <Plain>
                <span className="text-lg leading-snug font-extrabold">{option.text}</span>
              </Plain>
            </Button>
          ))}
        </div>
      </div>
    )
  }

  if (view.action === 'predict') {
    return (
      <div className={`${SHELL} justify-center`}>
        <p className="text-3xl leading-none font-extrabold uppercase tracking-tighter">
          Will {view.accusedName} work it out?
        </p>
        <div className="flex flex-col gap-4">
          <Button
            tone="mint"
            size="lg"
            selected={view.myPrediction === true}
            onClick={() => send({ kind: 'predict', willGetIt: true })}
            className="w-full"
          >
            Yes
          </Button>
          <Button
            tone="red"
            size="lg"
            selected={view.myPrediction === false}
            onClick={() => send({ kind: 'predict', willGetIt: false })}
            className="w-full"
          >
            No
          </Button>
        </div>
        <p className="text-center font-mono text-xs font-bold tracking-widest uppercase opacity-55">
          no points. just judgement.
        </p>
      </div>
    )
  }

  return (
    <div className={`${SHELL} items-center justify-center text-center`}>
      <Sticker tone="pink" tilt={-2}>
        watch the big screen
      </Sticker>
      <Slab tone="chalk" className="px-10 py-6" tilt={-1.5}>
        <p className="font-mono text-xs font-bold tracking-[0.25em] uppercase opacity-55">score</p>
        <p className="tnum text-6xl leading-none font-extrabold">{view.myScore}</p>
      </Slab>
    </div>
  )
}
