'use client'

import { PlayerChip } from '@/components/PlayerChip'
import type { Beat, TelephoneHostView } from './views'

/** Nothing here may grow the page: the host screen is a fixed viewport. */
function Stage({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 text-center">{children}</main>
}

function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      <div className="h-8 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-white transition-all duration-500"
          style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
        />
      </div>
      <p className="text-4xl font-black uppercase tabular-nums tracking-widest text-white/60">
        {done} of {total} {label}
      </p>
    </div>
  )
}

function BeatTile({ beat, current }: { beat: Beat; current: boolean }) {
  return (
    <div
      className={`flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border-4 ${
        current ? 'border-white' : 'border-white/15 opacity-50'
      }`}
      style={beat.kind === 'text' ? { backgroundColor: beat.color } : undefined}
    >
      {beat.kind === 'image' ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={beat.imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="px-1 text-4xl font-black text-black">{beat.authorName.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  )
}

function Reveal({ view }: { view: TelephoneHostView }) {
  const reveal = view.reveal!
  const current = reveal.beats[reveal.beats.length - 1]

  return (
    <>
      <Stage>
        <p className="text-2xl font-black uppercase tracking-[0.3em] text-white/40">
          Chain {reveal.chainNumber} of {reveal.chainCount} &middot; {reveal.starterName} started it
        </p>

        {current?.kind === 'text' && (
          <p className="max-w-6xl text-7xl font-black leading-tight text-white">
            &ldquo;{current.text}&rdquo;
          </p>
        )}

        {current?.kind === 'image' && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={current.imageUrl}
            alt=""
            className="max-h-[52vh] min-h-0 rounded-3xl border-8 border-white/15 object-contain"
          />
        )}

        {current && (
          <p className="flex items-center gap-3 text-3xl font-black uppercase tracking-widest">
            <span className="h-6 w-6 rounded-full" style={{ backgroundColor: current.color }} />
            <span className="text-white/60">
              {current.kind === 'text' ? `${current.authorName} wrote it` : current.failed ? 'no picture' : 'the machine drew it'}
            </span>
          </p>
        )}
      </Stage>

      <div className="flex shrink-0 items-center justify-center gap-3 overflow-hidden">
        {reveal.beats.map((beat, index) => (
          <BeatTile key={index} beat={beat} current={index === reveal.beats.length - 1} />
        ))}
      </div>
    </>
  )
}

function Scoreboard({ view }: { view: TelephoneHostView }) {
  return (
    <div className="flex shrink-0 items-end justify-center gap-8 pr-64">
      {[...view.players]
        .sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0))
        .map((player) => (
          <div key={player.id} className="flex flex-col items-center gap-1">
            <PlayerChip player={player} size="sm" />
            <span className="text-2xl font-black tabular-nums text-white">{view.scores[player.id] ?? 0}</span>
            {(view.awarded[player.id] ?? 0) > 0 && (
              <span className="text-lg font-bold text-green-400">+{view.awarded[player.id]}</span>
            )}
          </div>
        ))}
    </div>
  )
}

export function TelephoneHostScreen({ view }: { view: TelephoneHostView }) {
  const writing = view.phase === 'write' || view.phase === 'describe'

  return (
    <div className="flex h-full flex-col justify-between gap-6 overflow-hidden p-10">
      <header className="flex shrink-0 items-center justify-between pr-36 text-white/50">
        <span className="text-2xl font-black uppercase tracking-[0.3em]">Broken Telephone</span>
        <span className="text-2xl font-bold tabular-nums">
          {view.phase === 'reveal' || view.phase === 'vote' || view.phase === 'ended'
            ? 'The reveal'
            : `Step ${view.stepIndex + 1} of ${view.steps}`}
        </span>
      </header>

      {writing && (
        <Stage>
          <p className="text-8xl font-black uppercase leading-none text-white">
            {view.phase === 'write' ? 'Write a sentence' : 'What was the sentence?'}
          </p>
          <p className="text-4xl font-bold text-white/50">
            {view.phase === 'write'
              ? 'Anything at all. It is about to be drawn.'
              : 'You only get the picture. Guess what made it.'}
          </p>
          <Progress done={view.submitted} total={view.total} label="in" />
        </Stage>
      )}

      {view.phase === 'drawing' && (
        <Stage>
          <p className="text-8xl font-black uppercase leading-none text-white">Drawing</p>
          <Progress done={view.drawn} total={view.total} label="pictures back" />
          {view.waitingOn.length > 0 && (
            <p className="max-w-5xl text-3xl font-bold text-white/40">
              Still waiting on {view.waitingOn.join(', ')}
            </p>
          )}
        </Stage>
      )}

      {view.phase === 'reveal' && <Reveal view={view} />}

      {view.phase === 'vote' && (
        <Stage>
          <p className="text-7xl font-black uppercase leading-none text-white">Which chain broke best?</p>
          <div className="flex max-w-full flex-wrap items-center justify-center gap-6">
            {view.chainLabels.map((chain) => (
              <div key={chain.index} className="flex flex-col items-center gap-2">
                <div className="h-28 w-28 overflow-hidden rounded-2xl border-4 border-white/20">
                  {chain.thumbnail && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={chain.thumbnail} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <span className="text-2xl font-black uppercase" style={{ color: chain.color }}>
                  {chain.starterName}
                </span>
              </div>
            ))}
          </div>
          <Progress done={view.voteCount} total={view.players.length} label="voted" />
        </Stage>
      )}

      {view.phase === 'ended' && (
        <Stage>
          <p className="text-3xl font-black uppercase tracking-[0.3em] text-white/40">The room has spoken</p>
          {view.finale?.length ? (
            view.finale.map((chain) => (
              <div key={chain.chainIndex} className="flex max-w-6xl flex-col gap-3">
                <p className="text-5xl font-black uppercase text-yellow-400">
                  {chain.starterName}&rsquo;s chain
                </p>
                <p className="text-4xl font-bold italic leading-tight text-white/70">
                  &ldquo;{chain.first}&rdquo;
                </p>
                <p className="text-4xl font-black text-white/30">became</p>
                <p className="text-5xl font-black italic leading-tight text-white">
                  &ldquo;{chain.last}&rdquo;
                </p>
              </div>
            ))
          ) : (
            <p className="text-5xl font-black uppercase text-white/50">Nobody voted. Nobody wins.</p>
          )}
        </Stage>
      )}

      <Scoreboard view={view} />
    </div>
  )
}
