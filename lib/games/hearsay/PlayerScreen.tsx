'use client'

import { BigButton } from '@/components/BigButton'
import type { HearsayInput } from './state'
import type { HearsayPlayerView } from './views'

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
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
        <p className="text-5xl font-black uppercase text-white">Look away</p>
        <p className="text-2xl font-bold text-white/60">They are talking about you.</p>
        <p className="text-xl font-bold text-yellow-400">Mute yourself.</p>
      </div>
    )
  }

  if (view.action === 'vote') {
    return (
      <div className="flex h-full flex-col gap-4 p-5">
        <p className="text-2xl font-bold leading-tight text-white">{view.charge}</p>
        <div className="flex flex-col gap-3 overflow-y-auto">
          {view.targets.map((player) => (
            <BigButton
              key={player.id}
              selected={view.myVote === player.id}
              onClick={() => send({ kind: 'vote', targetId: player.id })}
            >
              <span className="flex items-center gap-3">
                <span className="h-6 w-6 rounded-full" style={{ backgroundColor: player.color }} />
                {player.name}
              </span>
            </BigButton>
          ))}
        </div>
      </div>
    )
  }

  if (view.action === 'guess' && view.options) {
    return (
      <div className="flex h-full flex-col gap-4 p-5">
        <p className="text-2xl font-black uppercase text-white">What were they asked?</p>
        <div className="flex flex-col gap-3">
          {view.options.map((option) => (
            <BigButton
              key={option.id}
              selected={view.myPick === option.id}
              onClick={() => send({ kind: 'guess', questionId: option.id })}
            >
              {option.text}
            </BigButton>
          ))}
        </div>
      </div>
    )
  }

  if (view.action === 'predict') {
    return (
      <div className="flex h-full flex-col justify-center gap-4 p-5">
        <p className="text-3xl font-black uppercase text-white">Will {view.accusedName} work it out?</p>
        <div className="flex flex-col gap-3">
          <BigButton selected={view.myPrediction === true} onClick={() => send({ kind: 'predict', willGetIt: true })}>
            Yes
          </BigButton>
          <BigButton selected={view.myPrediction === false} onClick={() => send({ kind: 'predict', willGetIt: false })}>
            No
          </BigButton>
        </div>
        <p className="text-center text-sm font-bold uppercase tracking-widest text-white/40">
          No points. Just judgement.
        </p>
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
