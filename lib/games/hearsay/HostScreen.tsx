'use client'

import { PlayerChip } from '@/components/PlayerChip'
import type { HearsayHostView } from './views'

function VoteBar({ view }: { view: HearsayHostView }) {
  const max = Math.max(1, ...Object.values(view.voteCounts))

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm font-black uppercase tracking-[0.3em] text-white/30">Votes</p>
      <div className="flex items-end justify-center gap-5">
      {view.players.map((player) => {
        const count = view.voteCounts[player.id] ?? 0
        const whoVoted = view.voters
          ? Object.entries(view.voters).filter(([, target]) => target === player.id).map(([voter]) => voter)
          : []

        return (
          <div key={player.id} className="flex flex-col items-center gap-2">
            <div className="flex h-[22vh] w-16 items-end">
              <div
                className="w-full rounded-t-lg transition-all duration-700"
                style={{ height: `${(count / max) * 100}%`, backgroundColor: player.color, minHeight: count ? 12 : 0 }}
              />
            </div>
            <div className="text-3xl font-black text-white tabular-nums">{count}</div>
            <PlayerChip player={player} size="sm" />
            {whoVoted.length > 0 && (
              <div className="flex gap-1">
                {whoVoted.map((voterId) => {
                  const voter = view.players.find((p) => p.id === voterId)!
                  return <div key={voterId} className="h-3 w-3 rounded-full" style={{ backgroundColor: voter.color }} />
                })}
              </div>
            )}
          </div>
        )
      })}
      </div>
    </div>
  )
}

export function HearsayHostScreen({ view }: { view: HearsayHostView }) {
  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden p-8">
      <header className="flex items-center justify-between pr-36 text-white/50">
        <span className="text-2xl font-black uppercase tracking-widest">Hearsay</span>
        <span className="text-2xl font-bold tabular-nums">
          Round {view.roundNumber} of {view.totalRounds}
        </span>
      </header>

      <main className="flex min-h-0 flex-col items-center justify-center gap-5 overflow-hidden text-center">
        {view.phase === 'charge' && (
          <>
            <p className="text-[clamp(1.2rem,2vw,2rem)] font-bold uppercase tracking-widest text-white/50">The room is being asked</p>
            <p className="text-[clamp(2.5rem,6vw,5rem)] font-black uppercase leading-none text-white">something about {view.accusedName}</p>
            <p className="text-[clamp(1.2rem,2vw,1.75rem)] font-bold text-yellow-400">{view.accusedName}, mute yourself.</p>
          </>
        )}

        {view.phase === 'testimony' && (
          <>
            <p className="text-[clamp(3rem,8vw,6rem)] font-black uppercase leading-none text-white">Testimony</p>
            <p className="text-[clamp(1.2rem,2.2vw,2rem)] font-bold text-white/60">The room is deciding.</p>
          </>
        )}

        {view.phase === 'evidence' && (
          <>
            <p className="text-[clamp(2rem,4vw,3.5rem)] font-black uppercase leading-none text-white">The Evidence</p>
            <VoteBar view={view} />
            <p className="text-[clamp(1rem,1.8vw,1.6rem)] font-bold text-white/60">
              {view.accusedName}, what do you think they were asked?
            </p>
          </>
        )}

        {view.phase === 'guess' && (
          <>
            <p className="text-[clamp(2rem,4vw,3.5rem)] font-black uppercase leading-none text-white">{view.accusedName} is deciding</p>
            <VoteBar view={view} />
            <div className="flex gap-10 text-[clamp(1.2rem,2.4vw,2.25rem)] font-black">
              <span className="text-green-400">{view.crowdPredictions.yes} say yes</span>
              <span className="text-red-400">{view.crowdPredictions.no} say no</span>
            </div>
          </>
        )}

        {(view.phase === 'verdict' || view.phase === 'scoreboard') && (
          <>
            <p className="text-[clamp(1rem,1.6vw,1.5rem)] font-bold uppercase tracking-widest text-white/50">The charge was</p>
            <p className="max-w-5xl text-[clamp(1.8rem,4vw,3.75rem)] font-black leading-tight text-white">{view.question}</p>
            <VoteBar view={view} />
            <p className={`text-[clamp(1.8rem,3.5vw,3rem)] font-black uppercase leading-none ${view.accusedPickedCorrectly ? 'text-green-400' : 'text-red-500'}`}>
              {view.accusedPickedCorrectly ? `${view.accusedName} knew it` : `${view.accusedName} had no idea`}
            </p>
          </>
        )}

        {view.phase === 'ended' && (
          <>
            <p className="text-4xl font-bold uppercase tracking-widest text-white/50">Final verdict</p>
            {[...view.players]
              .sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0))
              .map((player, index) => (
                <div key={player.id} className="flex items-center gap-6 text-6xl font-black">
                  <span className="w-16 text-white/30 tabular-nums">{index + 1}</span>
                  <span className="h-10 w-10 rounded-full" style={{ backgroundColor: player.color }} />
                  <span className={index === 0 ? 'text-yellow-400' : 'text-white'}>{player.name}</span>
                  <span className="tabular-nums text-white/60">{view.scores[player.id] ?? 0}</span>
                </div>
              ))}
          </>
        )}
      </main>

      <footer className="flex flex-col items-center gap-1 pr-56">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-white/25">Scores</p>
        <div className="flex items-end justify-center gap-8">
        {[...view.players]
          .sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0))
          .map((player) => (
            <div key={player.id} className="flex flex-col items-center gap-1">
              <PlayerChip player={player} size="sm" />
              <span className="text-2xl font-black text-white tabular-nums">{view.scores[player.id] ?? 0}</span>
              {(view.awarded[player.id] ?? 0) > 0 && view.phase !== 'charge' && (
                <span className="text-lg font-bold text-green-400">+{view.awarded[player.id]}</span>
              )}
            </div>
          ))}
        </div>
      </footer>
    </div>
  )
}
