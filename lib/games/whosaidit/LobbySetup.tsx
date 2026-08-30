'use client'

import { Slab, Sticker } from '@/components/kit'
import type { Player, PlayerId } from '@/lib/types'
import { useCallback, useState, useSyncExternalStore } from 'react'
import { authorStats, parseWhatsAppExport, type AuthorStat, MIN_AUTHOR_MESSAGES } from './parse'
import {
  clearWhoSaidItSource,
  getServerSource,
  getWhoSaidItSource,
  setWhoSaidItSource,
  subscribeWhoSaidItSource,
  whoSaidItStatus,
} from './source'
import type { AuthorEntry } from './state'

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

/**
 * Everybody in the chat is an answer by default, whether or not they came to
 * play. The link to a lobby player is a courtesy: it stops that person being
 * asked to guess their own message, and nothing else.
 */
export function autoAuthors(stats: AuthorStat[], players: Player[]): Record<string, AuthorEntry> {
  const authors: Record<string, AuthorEntry> = {}
  const taken = new Set<PlayerId>()
  for (const stat of stats) {
    const guess = suggest(stat.author, players, taken)
    if (guess) taken.add(guess)
    authors[stat.author] = { included: true, playerId: guess }
  }
  return authors
}

/**
 * One line of the checklist. A tick box you want to tap, the name, how much
 * material that person has, and who they are in the room. Bordered but not
 * shadowed: these sit inside a scroller and are not slabs in their own right.
 */
function AuthorRow({
  stat,
  players,
  entry,
  onChange,
}: {
  stat: AuthorStat
  players: Player[]
  entry: AuthorEntry
  onChange: (entry: AuthorEntry) => void
}) {
  const { included } = entry
  return (
    <div
      className="flex min-w-0 items-center gap-2 px-2 py-1 transition-colors"
      style={{
        border: '3px solid var(--color-ink)',
        borderRadius: 12,
        backgroundColor: included ? 'var(--color-chalk)' : 'transparent',
        opacity: included ? 1 : 0.55,
      }}
    >
      <button
        onClick={() => onChange({ ...entry, included: !included })}
        className="press-sm grid h-6 w-6 shrink-0 place-items-center text-sm leading-none font-extrabold"
        style={{
          border: '3px solid var(--color-ink)',
          borderRadius: 8,
          backgroundColor: included ? 'var(--color-lime)' : 'transparent',
          boxShadow: included ? '3px 3px 0 var(--color-ink)' : 'none',
          color: included ? 'var(--color-ink)' : 'transparent',
        }}
        aria-label={included ? `Exclude ${stat.author}` : `Include ${stat.author}`}
      >
        ✓
      </button>

      <span className="min-w-0 flex-1 truncate text-sm font-extrabold uppercase">{stat.author}</span>

      <span
        className="shrink-0 font-mono text-[0.65rem] font-bold tracking-wider tabular-nums"
        style={{ opacity: 0.6 }}
        title={`${stat.usable} usable of ${stat.total} messages`}
      >
        {stat.usable}/{stat.total}
      </span>

      <select
        value={entry.playerId ?? ''}
        onChange={(event) => onChange({ ...entry, playerId: event.target.value || null })}
        className="w-24 shrink-0 appearance-none px-2 py-1 text-center font-mono text-[0.7rem] font-bold uppercase"
        style={{
          border: '3px solid var(--color-ink)',
          borderRadius: 8,
          backgroundColor: entry.playerId ? 'var(--color-yellow)' : 'transparent',
          color: 'var(--color-ink)',
        }}
        aria-label={`Which player is ${stat.author}`}
      >
        <option value="">not here</option>
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
 *
 * It sits in the middle row of the host lobby, which flexes and clips, so this
 * component owns its own scroller and has a hard height cap. It may never grow
 * enough to push the Start button off the bottom of the screen.
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
        // Filter on usable, not total: an author with 40 messages that are all
        // "ok" and attachments has nothing to serve, and the group's own system
        // author ("Hackerhouse v2.0.0") shows up with messages but zero usable
        // ones. Those never become rows, and never become answers.
        const stats = authorStats(messages).filter((s) => s.usable >= MIN_AUTHOR_MESSAGES)
        setWhoSaidItSource({ messages, authors: autoAuthors(stats, players) })
      } catch {
        setError('Could not read that file.')
      }
    },
    [players]
  )

  if (source.messages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2">
        <label className="slab press cursor-pointer px-8 py-4 text-xl font-extrabold tracking-tight uppercase"
          style={{ backgroundColor: 'var(--color-mint)' }}
        >
          Load chat export
          <input
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <p className="font-mono text-xs font-bold lowercase opacity-55">
          parsed in this tab. it never leaves this browser.
        </p>
        {error && (
          <Slab tone="red" className="max-w-xl px-4 py-2">
            <p className="text-center text-sm font-bold">{error}</p>
          </Slab>
        )}
      </div>
    )
  }

  const stats = authorStats(source.messages).filter((s) => s.usable >= MIN_AUTHOR_MESSAGES)
  const status = whoSaidItStatus(players)
  const included = stats.filter((s) => (source.authors[s.author] ?? { included: true }).included).length

  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-2">
      {/* Its own scroller with a hard cap. The lobby's middle row is shared
          with the room code, the faces and the game tiles, so this panel is
          kept deliberately short: it may never grow enough to shove the Start
          button off the bottom at 720p. */}
      <Slab tone="paper" className="w-full p-1.5">
        <div
          className={`grid max-h-[min(7rem,10vh)] gap-1.5 overflow-y-auto ${
            stats.length > 4 ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {stats.map((stat) => (
            <AuthorRow
              key={stat.author}
              stat={stat}
              players={players}
              entry={source.authors[stat.author] ?? { included: true, playerId: null }}
              onChange={(entry) =>
                setWhoSaidItSource({
                  messages: source.messages,
                  authors: { ...source.authors, [stat.author]: entry },
                })
              }
            />
          ))}
        </div>
      </Slab>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Sticker tone={status.ready ? 'lime' : 'red'} tilt={1.5}>
          {status.ready ? `${status.rounds} rounds ready` : status.reason}
        </Sticker>
        <p className="font-mono text-xs font-bold lowercase opacity-60">
          {included} of {stats.length} on the board. tick who counts, say who is in the room.
        </p>
        <button
          onClick={clearWhoSaidItSource}
          className="font-mono text-xs font-bold tracking-widest uppercase underline decoration-2 underline-offset-4 opacity-45 transition-opacity hover:opacity-90"
        >
          Clear chat
        </button>
      </div>
    </div>
  )
}
