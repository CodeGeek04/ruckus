'use client'

import { Aside, Face, Field, Slab, Sticker, type Hue } from '@/components/kit'
import { flavorFor } from '@/lib/flavor'
import type { Player } from '@/lib/types'
import type { Phase } from './state'
import type { HearsayHostView } from './views'
import { initials } from '@/lib/text'

/**
 * The host screen is a stage, not a dashboard.
 *
 * Every phase drenches the whole frame in its own colour, so the room can tell
 * what is happening from the far side of a lounge without reading a word. The
 * frame is fixed: header, a middle row that flexes and clips, a footer. Nothing
 * scrolls, nothing is allowed to fall off the bottom.
 *
 * The security boundary lives in views.ts, not here. `view.question` is null
 * until the verdict and `view.voters` is null until the verdict, so this file
 * physically cannot leak either one early.
 */

const PHASE_HUE: Record<Phase, Hue> = {
  charge: 'violet',
  testimony: 'blue',
  evidence: 'yellow',
  guess: 'orange',
  verdict: 'pink',
  scoreboard: 'mint',
  ended: 'lime',
}

const PHASE_LABEL: Record<Phase, string> = {
  charge: 'the charge',
  testimony: 'testimony',
  evidence: 'the evidence',
  guess: 'deliberation',
  verdict: 'verdict',
  scoreboard: 'standings',
  ended: 'final',
}

/** Type that has to survive a compressed stream at four metres. */
const HEADLINE = 'text-[clamp(2.2rem,6.5vw,5.5rem)] leading-[0.92] font-extrabold uppercase tracking-tighter'
const SUB = 'text-[clamp(1rem,2vw,1.75rem)] font-extrabold uppercase tracking-tight'

/** One vote, as a brick. Chunky enough to read as an object from four metres. */
const BRICK = 'w-[clamp(2.75rem,5.5vw,5rem)] h-[clamp(1rem,3vh,2rem)] rounded-[7px]'

function totalVotes(view: HearsayHostView): number {
  return Object.values(view.voteCounts).reduce((sum, n) => sum + n, 0)
}

/**
 * The tally, as physical stacked blocks rather than a chart.
 *
 * Before the verdict a block is just the accused-of player's colour: a count,
 * with no hint of who cast it. From the verdict onward each block takes the
 * colour of the voter who cast it, so the room's colours visibly land on the
 * answer.
 */
function Tally({ view }: { view: HearsayHostView }) {
  const revealed = view.voters !== null

  return (
    // The tally stands on a chalk plinth. Player colours are the same eight
    // hues the phases are drenched in, so on the bare field a yellow player
    // vanishes into a yellow phase. On cream every identity survives.
    <Slab
      tone="chalk"
      tilt={-0.6}
      className="px-[clamp(0.9rem,2.5vw,2.25rem)] py-[clamp(0.5rem,1.5vh,1.1rem)]"
    >
      <div className="flex flex-wrap items-end justify-center gap-x-[clamp(0.6rem,2vw,2rem)] gap-y-2">
        {view.players.map((player) => {
          const count = view.voteCounts[player.id] ?? 0
          const voterIds = view.voters
            ? Object.entries(view.voters)
                .filter(([, target]) => target === player.id)
                .map(([voter]) => voter)
            : []
          const leads = revealed && count > 0 && view.topVoted.includes(player.id)

          return (
            <div key={player.id} className="flex flex-col items-center gap-1.5">
              <span
                className={`tnum text-[clamp(1.2rem,2.6vw,2.2rem)] leading-none font-extrabold ${
                  leads ? 'slab-sm px-3 py-0.5' : 'px-3 py-0.5'
                }`}
                style={leads ? { backgroundColor: 'var(--color-yellow)' } : undefined}
              >
                {count}
              </span>

              {/* Stacked bricks, not bars. Flat inside the plinth: a shadow on
                  every brick would turn one object into a pile of cards. */}
              <div className="flex flex-col-reverse gap-[3px]">
                {count === 0 && (
                  <div
                    className={`${BRICK} border-[3px] border-dashed opacity-25`}
                    style={{ borderColor: 'var(--color-ink)' }}
                  />
                )}
                {Array.from({ length: count }, (_, i) => {
                  const voter = view.players.find((p) => p.id === voterIds[i])
                  return (
                    <div
                      key={i}
                      className={`pop ${BRICK} border-[3px]`}
                      style={{
                        backgroundColor: voter ? voter.color : player.color,
                        borderColor: 'var(--color-ink)',
                        animationDelay: `${i * 60}ms`,
                      }}
                    />
                  )
                })}
              </div>

              <Face name={player.name} color={player.color} size="sm" />
            </div>
          )
        })}
      </div>
    </Slab>
  )
}

function Standings({ view, awarded }: { view: HearsayHostView; awarded: boolean }) {
  const ranked = [...view.players].sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0))

  return (
    <div className="flex w-full max-w-3xl flex-col gap-[clamp(0.3rem,1vh,0.7rem)]">
      {ranked.map((player, index) => (
        <Slab
          key={player.id}
          tone={index === 0 ? 'yellow' : 'chalk'}
          tilt={index === 0 ? -0.8 : 0}
          className="rise flex items-center gap-[clamp(0.6rem,1.6vw,1.5rem)] px-4 py-[clamp(0.25rem,0.9vh,0.6rem)]"
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <span
            className={`w-9 text-[clamp(0.9rem,1.8vw,1.6rem)] font-extrabold ${
              index === 0 && !awarded ? '' : 'tnum opacity-35'
            }`}
          >
            {index === 0 && !awarded ? '👑' : index + 1}
          </span>
          <span
            className="slab-sm grid h-[clamp(1.7rem,3.2vh,2.4rem)] w-[clamp(1.7rem,3.2vh,2.4rem)] shrink-0 place-items-center text-[clamp(0.6rem,1.1vw,0.95rem)] font-extrabold uppercase"
            style={{ backgroundColor: player.color, borderRadius: 999 }}
          >
            {initials(player.name)}
          </span>
          <span className="flex-1 truncate text-[clamp(1rem,2.2vw,2rem)] font-extrabold uppercase tracking-tight">
            {player.name}
          </span>
          {awarded && (view.awarded[player.id] ?? 0) > 0 && (
            <span className="tnum stamp text-[clamp(0.85rem,1.6vw,1.4rem)] font-extrabold">
              +{view.awarded[player.id]}
            </span>
          )}
          <span className="tnum text-[clamp(1rem,2.2vw,2rem)] font-extrabold">
            {view.scores[player.id] ?? 0}
          </span>
        </Slab>
      ))}
    </div>
  )
}

/**
 * The commentary line, built only from facts this view already carries.
 * Presentation only: it can be absent and nothing moves.
 */
function verdictLine(view: HearsayHostView): string | null {
  const cast = totalVotes(view)
  if (cast === 0) return null

  const receivers = view.players.filter((p) => (view.voteCounts[p.id] ?? 0) > 0).length
  const top = Math.max(...view.players.map((p) => view.voteCounts[p.id] ?? 0))

  return flavorFor({
    game: 'hearsay',
    kind: 'verdict',
    correct: view.accusedPickedCorrectly === true,
    unanimous: receivers === 1 && cast >= 2,
    selfIncriminated: view.topVoted.length === 1 && view.topVoted[0] === view.accusedId,
    landslide: view.topVoted.length === 1 && top > cast / 2 && cast >= 3,
    round: view.roundNumber,
  })
}

export function HearsayHostScreen({ view }: { view: HearsayHostView }) {
  const accused = view.players.find((p: Player) => p.id === view.accusedId)
  const correct = view.accusedPickedCorrectly === true

  return (
    <Field hue={PHASE_HUE[view.phase]} pattern={view.phase === 'verdict' ? 'stripes' : 'dots'}>
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden p-8">
        <header className="flex items-center gap-4 pr-40">
          <span className="text-[clamp(1.1rem,1.8vw,1.6rem)] font-extrabold tracking-tighter uppercase">
            Hearsay
          </span>
          <Sticker tone="chalk" tilt={-2}>
            {PHASE_LABEL[view.phase]}
          </Sticker>
          <span className="tnum ml-auto font-mono text-[clamp(0.75rem,1.3vw,1.05rem)] font-bold tracking-widest uppercase opacity-60">
            Round {view.roundNumber} / {view.totalRounds}
          </span>
        </header>

        <main className="flex min-h-0 flex-col items-center justify-center gap-[clamp(0.5rem,2vh,1.5rem)] overflow-hidden text-center">
          {view.phase === 'charge' && (
            <>
              <Sticker tone="chalk" tilt={-3}>
                the room is being asked
              </Sticker>
              <p className="text-[clamp(1.2rem,3vw,2.75rem)] leading-none font-extrabold uppercase tracking-tight opacity-70">
                something about
              </p>
              <p className="stamp max-w-full text-[clamp(2.75rem,10vw,8.5rem)] leading-[0.9] font-extrabold uppercase tracking-tighter break-words">
                {view.accusedName}
              </p>
              {accused && (
                <div className="wobble">
                  <Face name={accused.name} color={accused.color} size="lg" />
                </div>
              )}
              <Slab tone="ink" className="px-6 py-2.5">
                <p className={SUB}>{view.accusedName}, mute yourself</p>
              </Slab>
            </>
          )}

          {view.phase === 'testimony' && (
            <>
              <p className={`${HEADLINE} stamp`}>Testimony</p>
              <p className={`${SUB} opacity-70`}>the room is deciding</p>
              <Slab tone="chalk" className="px-8 py-3" tilt={1.5}>
                <p className="tnum text-[clamp(1.5rem,3.5vw,3rem)] font-extrabold uppercase">
                  {totalVotes(view)} of {Math.max(0, view.players.length - 1)} in
                </p>
              </Slab>
            </>
          )}

          {view.phase === 'evidence' && (
            <>
              <p className={`${HEADLINE} stamp`}>The evidence</p>
              <Tally view={view} />
              <p className={`${SUB} opacity-70`}>
                {view.accusedName}, what were they asked?
              </p>
            </>
          )}

          {view.phase === 'guess' && (
            <>
              <p className={`${HEADLINE} stamp max-w-5xl`}>{view.accusedName} is deciding</p>
              <Tally view={view} />
              <div className="flex gap-4">
                <Slab tone="mint" className="px-6 py-2">
                  <p className="tnum text-[clamp(1rem,2.2vw,1.8rem)] font-extrabold uppercase">
                    {view.crowdPredictions.yes} say yes
                  </p>
                </Slab>
                <Slab tone="red" className="px-6 py-2">
                  <p className="tnum text-[clamp(1rem,2.2vw,1.8rem)] font-extrabold uppercase">
                    {view.crowdPredictions.no} say no
                  </p>
                </Slab>
              </div>
            </>
          )}

          {view.phase === 'verdict' && (
            <>
              <Sticker tone="chalk" tilt={-2}>
                the charge was
              </Sticker>
              <Slab tone="chalk" className="max-w-4xl px-6 py-3" tilt={-0.8}>
                <p className="text-[clamp(1.1rem,2.9vw,2.6rem)] leading-tight font-extrabold">
                  {view.question}
                </p>
              </Slab>
              <Tally view={view} />
              <Slab tone={correct ? 'lime' : 'red'} className="stamp px-7 py-2.5" tilt={1.2}>
                <p className="text-[clamp(1.3rem,3.2vw,2.75rem)] leading-none font-extrabold uppercase tracking-tighter">
                  {correct ? `${view.accusedName} knew it` : `${view.accusedName} had no idea`}
                </p>
              </Slab>
              <Aside line={verdictLine(view)} />
            </>
          )}

          {view.phase === 'scoreboard' && (
            <>
              <Sticker tone="chalk" tilt={-2}>
                after round {view.roundNumber}
              </Sticker>
              <Standings view={view} awarded />
            </>
          )}

          {view.phase === 'ended' && (
            <>
              <p className="text-[clamp(1.6rem,4vw,3.25rem)] leading-none font-extrabold uppercase tracking-tighter">
                Final verdict
              </p>
              <Standings view={view} awarded={false} />
            </>
          )}
        </main>

        <footer className="flex items-end justify-center gap-[clamp(0.75rem,2.5vw,2.5rem)] pr-[22rem]">
          {view.phase !== 'scoreboard' &&
            view.phase !== 'ended' &&
            [...view.players]
              .sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0))
              .map((player) => (
                <div key={player.id} className="flex items-center gap-2">
                  <Face name={player.name} color={player.color} size="sm" />
                  <span className="tnum text-[clamp(0.9rem,1.8vw,1.5rem)] font-extrabold">
                    {view.scores[player.id] ?? 0}
                  </span>
                  {(view.awarded[player.id] ?? 0) > 0 && view.phase !== 'charge' && (
                    <span className="tnum stamp text-[clamp(0.7rem,1.2vw,1rem)] font-extrabold opacity-70">
                      +{view.awarded[player.id]}
                    </span>
                  )}
                </div>
              ))}
        </footer>
      </div>
    </Field>
  )
}
