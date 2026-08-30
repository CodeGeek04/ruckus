'use client'

import { PlayerChip } from '@/components/PlayerChip'
import type { Player } from '@/lib/types'
import type { WhoSaidItHostView } from './views'

/** Long messages have to shrink rather than push the screen off the bottom. */
function messageClass(text: string): string {
  if (text.length > 140) return 'text-4xl leading-snug'
  if (text.length > 80) return 'text-5xl leading-snug'
  return 'text-6xl leading-tight'
}

function Quote({ text, dim = false }: { text: string; dim?: boolean }) {
  return (
    <p
      className={`max-w-6xl overflow-hidden font-black ${messageClass(text)} ${dim ? 'text-white/70' : 'text-white'}`}
    >
      &ldquo;{text}&rdquo;
    </p>
  )
}

function GuessColumn({ player, view }: { player: Player; view: WhoSaidItHostView }) {
  const voters = view.guesses
    ? Object.entries(view.guesses).filter(([, target]) => target === player.id).map(([id]) => id)
    : []
  const isAuthor = view.authorId === player.id

  return (
    <div
      className={`flex min-w-28 flex-col items-center gap-2 rounded-2xl px-3 py-3 ${
        isAuthor ? 'bg-green-400/20 ring-4 ring-green-400' : ''
      }`}
    >
      <PlayerChip player={player} size="sm" />
      <div className="flex h-5 flex-wrap justify-center gap-1">
        {voters.map((voterId) => {
          const voter = view.players.find((p) => p.id === voterId)
          if (!voter) return null
          return <span key={voterId} className="h-4 w-4 rounded-full" style={{ backgroundColor: voter.color }} />
        })}
      </div>
    </div>
  )
}

export function WhoSaidItHostScreen({ view }: { view: WhoSaidItHostView }) {
  const fooled = view.mostFooled
    ? view.mostFooled.playerIds
        .map((id) => view.players.find((p) => p.id === id)?.name)
        .filter(Boolean)
        .join(' and ')
    : null
  const authorName = view.players.find((p) => p.id === view.authorId)?.name ?? null

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden p-10">
      <header className="flex items-center justify-between pr-36 text-white/50">
        <span className="text-2xl font-black uppercase tracking-widest">Who Said It</span>
        {view.totalRounds > 0 && (
          <span className="text-2xl font-bold tabular-nums">
            Round {view.roundNumber} of {view.totalRounds}
          </span>
        )}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 overflow-hidden text-center">
        {view.problem && view.phase === 'ended' && view.totalRounds === 0 && (
          <>
            <p className="text-6xl font-black uppercase text-red-500">No chat loaded</p>
            <p className="max-w-4xl text-3xl font-bold text-white/70">{view.problem}</p>
          </>
        )}

        {view.phase === 'message' && view.message && (
          <>
            <p className="text-3xl font-bold uppercase tracking-widest text-white/50">Who said it?</p>
            <Quote text={view.message} />
            <p className="text-3xl font-black tabular-nums text-white/50">
              {view.guessedCount} of {view.expectedGuesses} locked in
            </p>
          </>
        )}

        {view.phase === 'reveal' && view.message && (
          <>
            <Quote text={view.message} dim />
            <p className="text-7xl font-black uppercase text-green-400">{authorName} said it</p>
            <div className="flex flex-wrap items-start justify-center gap-4">
              {view.candidates.map((player) => (
                <GuessColumn key={player.id} player={player} view={view} />
              ))}
            </div>
            {fooled && (
              <p className="text-4xl font-black uppercase text-yellow-400">
                {view.mostFooled!.count} of you blamed {fooled}
              </p>
            )}
          </>
        )}

        {(view.phase === 'scoreboard' || (view.phase === 'ended' && view.totalRounds > 0)) && (
          <>
            <p className="text-3xl font-bold uppercase tracking-widest text-white/50">
              {view.phase === 'ended' ? 'Final read on the room' : 'Standings'}
            </p>
            {[...view.players]
              .sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0))
              .map((player, index) => (
                <div key={player.id} className="flex items-center gap-6 text-5xl font-black">
                  <span className="w-14 text-white/30 tabular-nums">{index + 1}</span>
                  <span className="h-9 w-9 rounded-full" style={{ backgroundColor: player.color }} />
                  <span className={index === 0 ? 'text-yellow-400' : 'text-white'}>{player.name}</span>
                  <span className="tabular-nums text-white/60">{view.scores[player.id] ?? 0}</span>
                </div>
              ))}
          </>
        )}
      </main>

      <footer className="flex items-end justify-center gap-8 pr-64">
        {[...view.players]
          .sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0))
          .map((player) => (
            <div key={player.id} className="flex flex-col items-center gap-1">
              <PlayerChip player={player} size="sm" />
              <span className="text-2xl font-black tabular-nums text-white">{view.scores[player.id] ?? 0}</span>
              {(view.awarded[player.id] ?? 0) > 0 && view.phase !== 'message' && (
                <span className="text-lg font-bold text-green-400">+{view.awarded[player.id]}</span>
              )}
            </div>
          ))}
      </footer>
    </div>
  )
}
