'use client'

import { PlayerChip } from '@/components/PlayerChip'
import type { HearsayHostView } from './views'

function VoteBar({ view }: { view: HearsayHostView }) {
  const max = Math.max(1, ...Object.values(view.voteCounts))

  return (
    <div className="flex items-end justify-center gap-6">
      {view.players.map((player) => {
        const count = view.voteCounts[player.id] ?? 0
        const whoVoted = view.voters
          ? Object.entries(view.voters).filter(([, target]) => target === player.id).map(([voter]) => voter)
          : []

        return (
          <div key={player.id} className="flex flex-col items-center gap-2">
            <div className="flex h-56 w-20 items-end">
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
  )
}

export function HearsayHostScreen({ view }: { view: HearsayHostView }) {
  return (
    <div className="flex h-full flex-col justify-between p-10">
      <header className="flex items-center justify-between text-white/50">
        <span className="text-2xl font-black uppercase tracking-widest">Hearsay</span>
        <span className="text-2xl font-bold tabular-nums">
          Round {view.roundNumber} of {view.totalRounds}
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        {view.phase === 'charge' && (
          <>
            <p className="text-4xl font-bold uppercase tracking-widest text-white/50">The room is being asked</p>
            <p className="text-8xl font-black uppercase text-white">something about {view.accusedName}</p>
            <p className="text-3xl font-bold text-yellow-400">{view.accusedName}, mute yourself.</p>
          </>
        )}

        {view.phase === 'testimony' && (
          <>
            <p className="text-8xl font-black uppercase text-white">Testimony</p>
            <p className="text-4xl font-bold text-white/60">The room is deciding.</p>
          </>
        )}

        {view.phase === 'evidence' && (
          <>
            <p className="text-6xl font-black uppercase text-white">The Evidence</p>
            <VoteBar view={view} />
            <p className="text-3xl font-bold text-white/60">
              {view.accusedName}, what do you think they were asked?
            </p>
          </>
        )}

        {view.phase === 'guess' && (
          <>
            <p className="text-6xl font-black uppercase text-white">{view.accusedName} is deciding</p>
            <VoteBar view={view} />
            <div className="flex gap-10 text-4xl font-black">
              <span className="text-green-400">{view.crowdPredictions.yes} say yes</span>
              <span className="text-red-400">{view.crowdPredictions.no} say no</span>
            </div>
          </>
        )}

        {(view.phase === 'verdict' || view.phase === 'scoreboard') && (
          <>
            <p className="text-3xl font-bold uppercase tracking-widest text-white/50">The charge was</p>
            <p className="max-w-5xl text-7xl font-black leading-tight text-white">{view.question}</p>
            <VoteBar view={view} />
            <p className={`text-6xl font-black uppercase ${view.accusedPickedCorrectly ? 'text-green-400' : 'text-red-500'}`}>
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

      <footer className="flex items-end justify-center gap-8">
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
      </footer>
    </div>
  )
}
