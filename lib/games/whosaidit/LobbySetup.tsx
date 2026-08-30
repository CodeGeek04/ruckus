'use client'

import type { Player, PlayerId } from '@/lib/types'
import { useCallback, useState, useSyncExternalStore } from 'react'
import { authorStats, parseWhatsAppExport, type AuthorStat } from './parse'
import {
  clearWhoSaidItSource,
  getServerSource,
  getWhoSaidItSource,
  setWhoSaidItSource,
  subscribeWhoSaidItSource,
  whoSaidItStatus,
} from './source'

/** Authors quieter than this are not worth a row: they cannot carry a round. */
const MIN_AUTHOR_MESSAGES = 3

/** Riya Sharma in the chat is very probably Riya in the lobby. */
function suggest(author: string, players: Player[], taken: Set<PlayerId>): PlayerId | null {
  const first = author.trim().toLowerCase().split(/\s+/)[0]
  if (!first) return null
  const match = players.find((p) => {
    if (taken.has(p.id)) return false
    const name = p.name.toLowerCase()
    return name === first || name.startsWith(first) || first.startsWith(name)
  })
  return match?.id ?? null
}

function autoMap(stats: AuthorStat[], players: Player[]): Record<string, PlayerId | null> {
  const mapping: Record<string, PlayerId | null> = {}
  const taken = new Set<PlayerId>()
  for (const stat of stats) {
    const guess = suggest(stat.author, players, taken)
    if (guess) taken.add(guess)
    mapping[stat.author] = guess
  }
  return mapping
}

function MessageRow({
  stat,
  players,
  value,
  onChange,
}: {
  stat: AuthorStat
  players: Player[]
  value: PlayerId | null
  onChange: (playerId: PlayerId | null) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="min-w-0 flex-1 truncate text-lg font-black text-white">{stat.author}</span>
      <span className="w-28 text-right text-sm font-bold tabular-nums text-white/40">
        {stat.usable} of {stat.total}
      </span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="w-44 rounded-lg border-2 border-white/20 bg-black px-3 py-2 text-base font-bold text-white"
      >
        <option value="">Ignore</option>
        {players.map((player) => (
          <option key={player.id} value={player.id}>
            {player.name}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * The game's own lobby setup. It lives here rather than in the shared shell
 * because no other game needs a chat import and the shell must not learn about
 * WhatsApp. The file is read with the File API and parsed in this tab: the
 * chat never touches a server.
 */
export function WhoSaidItLobbySetup({ players }: { players: Player[] }) {
  const source = useSyncExternalStore(subscribeWhoSaidItSource, getWhoSaidItSource, getServerSource)
  const [error, setError] = useState<string | null>(null)

  const onFile = useCallback(
    async (file: File | null) => {
      if (!file) return
      setError(null)
      try {
        const messages = parseWhatsAppExport(await file.text())
        if (messages.length === 0) {
          setError('No messages found. Export the chat from WhatsApp without media and upload the .txt.')
          return
        }
        setWhoSaidItSource({ messages, mapping: autoMap(authorStats(messages), players) })
      } catch {
        setError('Could not read that file.')
      }
    },
    [players]
  )

  if (source.messages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3">
        <label className="cursor-pointer rounded-xl border-4 border-white/30 px-8 py-3 text-xl font-black uppercase tracking-widest text-white/70 transition hover:border-white hover:text-white">
          Load chat export
          <input
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <p className="text-sm font-bold uppercase tracking-widest text-white/30">
          Parsed in this tab. It never leaves this browser.
        </p>
        {error && <p className="max-w-xl text-center text-base font-bold text-red-400">{error}</p>}
      </div>
    )
  }

  // Filter on usable, not total: an author with 40 messages that are all "ok"
  // and attachments has nothing to serve, and the group's own system author
  // ("Hackerhouse v2.0.0") shows up with messages but zero usable ones.
  const stats = authorStats(source.messages).filter((s) => s.usable >= MIN_AUTHOR_MESSAGES)
  const status = whoSaidItStatus(players)

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-3">
      <div className="max-h-52 w-full overflow-y-auto rounded-2xl border-2 border-white/10 px-4 py-2">
        {stats.map((stat) => (
          <MessageRow
            key={stat.author}
            stat={stat}
            players={players}
            value={source.mapping[stat.author] ?? null}
            onChange={(playerId) =>
              setWhoSaidItSource({
                messages: source.messages,
                mapping: { ...source.mapping, [stat.author]: playerId },
              })
            }
          />
        ))}
      </div>

      <div className="flex items-center gap-4">
        <p className={`text-base font-bold ${status.ready ? 'text-green-400' : 'text-red-400'}`}>
          {status.ready ? `Ready: ${status.rounds} rounds` : status.reason}
        </p>
        <button
          onClick={clearWhoSaidItSource}
          className="rounded-lg border-2 border-white/20 px-4 py-2 text-sm font-black uppercase tracking-widest text-white/40"
        >
          Clear chat
        </button>
      </div>
    </div>
  )
}
