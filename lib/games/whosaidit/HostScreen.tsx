'use client'

import { Aside, Face, Field, HUES, Slab, Sticker, type Hue } from '@/components/kit'
import { flavorFor } from '@/lib/flavor'
import type { Player, PlayerId } from '@/lib/types'
import type { AuthorKey } from './state'
import type { WhoSaidItHostView } from './views'
import { initials } from '@/lib/text'

/**
 * The shared screen for Who Said It.
 *
 * One message, blown up to poster size, on a field that changes colour with
 * the phase so the room knows what is happening before it reads a word. The
 * frame is fixed: three rows, the middle one clips, type sized in clamp().
 * Nothing here ever scrolls and nothing here ever falls off the bottom.
 */

/** Each phase gets drenched in its own colour. */
const FIELD: Record<WhoSaidItHostView['phase'], Hue> = {
  message: 'blue',
  reveal: 'pink',
  scoreboard: 'mint',
  ended: 'lime',
}

/**
 * A round message is capped at 200 characters upstream, but a chat export is a
 * chat export. Anything longer is trimmed rather than allowed to push the
 * screen off its own bottom edge.
 */
const MAX_QUOTE = 200

function trim(text: string): string {
  return text.length > MAX_QUOTE ? `${text.slice(0, MAX_QUOTE - 1).trimEnd()}…` : text
}

/**
 * Long messages shrink instead of overflowing. Two ladders: the hero, and the
 * quieter restatement at the reveal where the name has to win the screen.
 */
function quoteSize(text: string, dim: boolean): string {
  const n = text.length
  if (dim) {
    if (n <= 60) return 'clamp(1.3rem, min(2.4vw, 4.4vh), 3rem)'
    if (n <= 130) return 'clamp(1.05rem, min(1.9vw, 3.4vh), 2.4rem)'
    return 'clamp(0.9rem, min(1.5vw, 2.7vh), 1.9rem)'
  }
  if (n <= 40) return 'clamp(2.6rem, min(5.4vw, 9.6vh), 7rem)'
  if (n <= 90) return 'clamp(2.1rem, min(4.1vw, 7.3vh), 5.5rem)'
  if (n <= 140) return 'clamp(1.7rem, min(3.1vw, 5.5vh), 4.2rem)'
  return 'clamp(1.4rem, min(2.5vw, 4.4vh), 3.2rem)'
}

/** The message, as a chat bubble that has been enlarged until it is a poster. */
function Bubble({ text, dim = false }: { text: string; dim?: boolean }) {
  const body = trim(text)
  return (
    <Slab
      tone="chalk"
      className={`min-w-0 flex-1 ${dim ? '' : 'rise'}`}
      style={{
        borderRadius: dim ? '20px 20px 20px 5px' : '30px 30px 30px 6px',
        padding: dim ? 'clamp(0.6rem,1.4vw,1.2rem) clamp(0.9rem,1.8vw,1.6rem)' : 'clamp(1rem,2vw,2rem) clamp(1.3rem,2.6vw,2.6rem)',
      }}
    >
      <p
        className="font-extrabold tracking-tight break-words hyphens-auto"
        style={{ fontSize: quoteSize(body, dim), lineHeight: 1.15 }}
      >
        {body}
      </p>
    </Slab>
  )
}

/** The sender, unknown until they are not. A circle, because chat apps taught it. */
function Avatar({ label, color, big = false }: { label: string; color: string; big?: boolean }) {
  return (
    <div
      className="slab-sm grid shrink-0 place-items-center font-extrabold uppercase"
      style={{
        backgroundColor: color,
        borderRadius: 999,
        width: big ? 'clamp(3.2rem,min(6vw,10.6vh),7rem)' : 'clamp(2.4rem,min(4vw,7vh),4.6rem)',
        height: big ? 'clamp(3.2rem,min(6vw,10.6vh),7rem)' : 'clamp(2.4rem,min(4vw,7vh),4.6rem)',
        fontSize: big ? 'clamp(1.3rem,min(2.6vw,4.6vh),3rem)' : 'clamp(0.9rem,min(1.6vw,2.8vh),1.8rem)',
      }}
    >
      {label}
    </div>
  )
}

/** One name on the answer board, with the faces of everyone who fell for it. */
function Column({
  author,
  voters,
  correct,
}: {
  author: AuthorKey
  voters: Player[]
  correct: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <span
        className="slab-sm max-w-[14rem] truncate px-3 py-1 font-extrabold uppercase"
        style={{
          backgroundColor: correct ? HUES.lime : 'var(--color-chalk)',
          fontSize: 'clamp(0.75rem,min(1.25vw,2.2vh),1.4rem)',
        }}
      >
        {author}
      </span>
      <div className="flex flex-wrap justify-center gap-1.5">
        {voters.map((voter) => (
          <Face key={voter.id} name={voter.name} color={voter.color} size="sm" />
        ))}
      </div>
    </div>
  )
}

function ranked(view: WhoSaidItHostView): Player[] {
  return [...view.players].sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0))
}

function votersFor(view: WhoSaidItHostView, author: AuthorKey): Player[] {
  const guesses = view.guesses ?? {}
  const ids = Object.entries(guesses)
    .filter(([, target]) => target === author)
    .map(([id]) => id as PlayerId)
  return ids.map((id) => view.players.find((p) => p.id === id)).filter((p): p is Player => Boolean(p))
}

/**
 * The answer board only shows names somebody actually chose. Ten empty columns
 * is a spreadsheet, and repeating the author under their own stamp when nobody
 * picked them is just saying the same thing twice.
 */
function boardFor(view: WhoSaidItHostView): { author: AuthorKey; voters: Player[]; correct: boolean }[] {
  const wrong = view.candidates
    .filter((a) => a !== view.author)
    .map((author) => ({ author, voters: votersFor(view, author), correct: false }))
    .filter((c) => c.voters.length > 0)
    .sort((a, b) => b.voters.length - a.voters.length)

  const right = view.author ? votersFor(view, view.author) : []
  const truth =
    view.author && right.length > 0 ? [{ author: view.author, voters: right, correct: true }] : []

  return [...truth, ...wrong].slice(0, 6)
}

export function WhoSaidItHostScreen({ view }: { view: WhoSaidItHostView }) {
  const broken = view.totalRounds === 0
  const hue: Hue = broken ? 'red' : FIELD[view.phase]
  const board = view.phase === 'reveal' ? boardFor(view) : []
  const fooled = view.mostFooled
  const line =
    view.phase === 'reveal'
      ? flavorFor({
          game: 'whosaidit',
          kind: 'reveal',
          correctCount: view.correctIds.length,
          total: view.expectedGuesses,
          round: view.roundNumber,
        })
      : null

  return (
    <Field hue={hue} pattern={view.phase === 'reveal' ? 'stripes' : 'dots'}>
      <div
        className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden"
        style={{ padding: 'clamp(1rem,2.2vw,2.25rem)' }}
      >
        {/* The clock lives in a reserved lane down the right edge of the host
            frame, so the header stops well short of it. */}
        <header className="flex items-center justify-between gap-4 pr-40">
          <Sticker tone="chalk" tilt={-2}>
            Who Said It
          </Sticker>
          {view.totalRounds > 0 && (
            <span className="font-mono text-[clamp(0.8rem,min(1.4vw,2.5vh),1.6rem)] font-bold tracking-[0.2em] uppercase tabular-nums opacity-70">
              {view.roundNumber} / {view.totalRounds}
            </span>
          )}
        </header>

        <section className="flex min-h-0 flex-col items-center justify-center overflow-hidden">
          {broken && (
            <div className="flex flex-col items-center gap-5 text-center">
              <p className="text-[clamp(2.5rem,min(6vw,10vh),7rem)] leading-none font-extrabold tracking-tighter uppercase">
                No chat loaded
              </p>
              {view.problem && (
                <Slab tone="chalk" className="max-w-[60ch] px-8 py-5" tilt={-1}>
                  <p className="text-[clamp(1rem,min(2vw,3.5vh),2.2rem)] font-bold">{view.problem}</p>
                </Slab>
              )}
            </div>
          )}

          {!broken && view.phase === 'message' && view.message && (
            <div className="flex w-full min-h-0 flex-col items-center justify-center gap-[clamp(0.75rem,2.5vh,2rem)]">
              <Sticker tone="yellow" tilt={-2}>
                Who typed this
              </Sticker>
              <div className="flex w-full max-w-[min(1400px,94%)] items-center gap-[clamp(0.6rem,1.4vw,1.25rem)]">
                <Avatar label="??" color={HUES.yellow} big />
                <Bubble text={view.message} />
              </div>
              <Slab tone="ink" className="px-[clamp(1rem,2vw,2rem)] py-[clamp(0.3rem,0.9vh,0.7rem)]" tilt={1}>
                <span className="font-mono text-[clamp(0.9rem,min(1.7vw,3vh),2.1rem)] font-bold tracking-widest uppercase tabular-nums">
                  {view.guessedCount} of {view.expectedGuesses} locked in
                </span>
              </Slab>
            </div>
          )}

          {!broken && view.phase === 'reveal' && view.message && view.author && (
            <div className="flex w-full min-h-0 flex-col items-center justify-center gap-[clamp(0.5rem,1.6vh,1.1rem)]">
              <div className="flex w-full max-w-[min(1200px,90%)] items-center gap-[clamp(0.5rem,1vw,0.9rem)]">
                <Avatar label={initials(view.author)} color={HUES.lime} />
                <Bubble text={view.message} dim />
              </div>

              {/* The name arrives as a stamp. The rotation lives on the slab and
                  the animation on the wrapper, because `stamp` ends on
                  transform:none and would otherwise flatten the tilt. */}
              <div className="stamp">
                <Slab
                  tone="lime"
                  tilt={-2}
                  className="px-[clamp(1rem,3vw,2.75rem)] py-[clamp(0.2rem,1vh,0.7rem)]"
                >
                  <span className="block max-w-[16ch] truncate text-[clamp(2rem,min(5.4vw,9.6vh),7rem)] leading-none font-extrabold tracking-tighter uppercase">
                    {view.author}
                  </span>
                </Slab>
              </div>

              {board.length > 0 && (
                <div className="flex min-h-0 flex-col items-center gap-1.5 overflow-hidden pt-1">
                  <p className="font-mono text-[clamp(0.6rem,min(1vw,1.8vh),1.05rem)] font-bold tracking-[0.3em] uppercase opacity-55">
                    the room said
                  </p>
                  <div className="flex min-h-0 flex-wrap items-start justify-center gap-[clamp(0.6rem,1.6vw,1.5rem)] overflow-hidden">
                    {board.map((column) => (
                      <Column key={column.author} {...column} />
                    ))}
                  </div>
                </div>
              )}

              {fooled && (
                <Slab tone="yellow" tilt={1.5} className="px-[clamp(0.8rem,1.8vw,1.6rem)] py-[clamp(0.15rem,0.7vh,0.5rem)]">
                  <span className="text-[clamp(0.85rem,min(1.7vw,3vh),2.1rem)] font-extrabold uppercase">
                    {fooled.count} of you looked at that and thought {fooled.authors.join(' or ')}
                  </span>
                </Slab>
              )}

              <Aside line={line} />
            </div>
          )}

          {!broken && (view.phase === 'scoreboard' || view.phase === 'ended') && (
            <Standings view={view} />
          )}
        </section>

        {/* The advance button and End game sit bottom right in the host frame. */}
        <footer className="flex items-end justify-start gap-[clamp(0.75rem,2vw,2rem)] pr-[22rem]">
          {view.phase === 'message' || view.phase === 'reveal'
            ? ranked(view).map((player) => (
                <div key={player.id} className="flex flex-col items-center gap-0.5">
                  <Face name={player.name} color={player.color} size="sm" dim={!player.connected} />
                  <span className="text-[clamp(0.8rem,min(1.3vw,2.3vh),1.5rem)] font-extrabold tabular-nums">
                    {view.scores[player.id] ?? 0}
                    {view.phase === 'reveal' && (view.awarded[player.id] ?? 0) > 0 && (
                      <span className="pl-1 opacity-70">+{view.awarded[player.id]}</span>
                    )}
                  </span>
                </div>
              ))
            : null}
        </footer>
      </div>
    </Field>
  )
}

/** The table. Two columns once there are more people than a row can hold. */
function Standings({ view }: { view: WhoSaidItHostView }) {
  const order = ranked(view)
  const ended = view.phase === 'ended'
  const wide = order.length > 5
  const rowSize = order.length > 8 ? 'clamp(0.9rem,min(1.5vw,2.7vh),1.8rem)' : 'clamp(1.1rem,min(2.1vw,3.7vh),2.6rem)'

  return (
    <div className="flex w-full min-h-0 flex-col items-center gap-[clamp(0.6rem,2vh,1.5rem)] overflow-hidden">
      <Sticker tone="chalk" tilt={-2}>
        {ended ? 'Final read on the room' : 'The table'}
      </Sticker>
      <div
        className={`grid w-full max-w-[min(1000px,92%)] gap-[clamp(0.4rem,1.2vh,0.85rem)] ${
          wide ? 'grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {order.map((player, index) => (
          <Slab
            key={player.id}
            tone={index === 0 ? 'yellow' : 'chalk'}
            className="rise flex items-center gap-[clamp(0.5rem,1.2vw,1rem)] px-[clamp(0.6rem,1.4vw,1.25rem)] py-[clamp(0.25rem,0.9vh,0.6rem)]"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <span className="w-6 shrink-0 font-mono font-bold tabular-nums opacity-45" style={{ fontSize: rowSize }}>
              {index + 1}
            </span>
            <span
              className="h-[1.4em] w-[1.4em] shrink-0 rounded-full border-[3px] border-[var(--color-ink)]"
              style={{ backgroundColor: player.color, fontSize: rowSize }}
            />
            <span
              className="min-w-0 flex-1 truncate font-extrabold uppercase"
              style={{ fontSize: rowSize }}
            >
              {player.name}
            </span>
            {(view.awarded[player.id] ?? 0) > 0 && (
              <span
                className="shrink-0 font-extrabold tabular-nums opacity-55"
                style={{ fontSize: `calc(${rowSize} * 0.75)` }}
              >
                +{view.awarded[player.id]}
              </span>
            )}
            <span className="shrink-0 font-extrabold tabular-nums" style={{ fontSize: rowSize }}>
              {view.scores[player.id] ?? 0}
            </span>
          </Slab>
        ))}
      </div>
    </div>
  )
}
