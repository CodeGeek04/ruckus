'use client'

import { Aside, Face, Field, HUES, Slab, Sticker, type Hue } from '@/components/kit'
import { flavorFor } from '@/lib/flavor'
import { PLACEHOLDER_IMAGE, type Phase } from './state'
import type { Beat, TelephoneHostView } from './views'
import { initials } from '@/lib/text'

/**
 * The reveal is the whole game. Everything here exists to make one picture and
 * one sentence land hard, one beat at a time, on a screen that never scrolls.
 *
 * Layout contract: three rows, header, a middle row that flexes and clips, a
 * footer. The middle row is `minmax(0,1fr)` with `min-h-0` inside it, and every
 * picture is bounded in viewport units, so a tall image can never push the
 * frame. See DESIGN.md.
 */

/** Each phase drenches the room in its own colour. */
const PHASE_HUE: Record<Phase, Hue> = {
  write: 'orange',
  describe: 'blue',
  drawing: 'violet',
  reveal: 'yellow',
  vote: 'pink',
  ended: 'lime',
}

const PHASE_PATTERN: Record<Phase, 'dots' | 'stripes'> = {
  write: 'dots',
  describe: 'stripes',
  drawing: 'stripes',
  reveal: 'dots',
  vote: 'dots',
  ended: 'stripes',
}

/** The reducer swaps in a placeholder when the model refuses. Presentation only. */
function isMissing(url: string, failed = false): boolean {
  return failed || url === PLACEHOLDER_IMAGE || url.length === 0
}

/** A picture the machine never produced, made to look deliberate. */
function NoPicture({ height }: { height: string }) {
  return (
    <div
      className="grid place-items-center px-[clamp(1.5rem,4vw,3.5rem)]"
      style={{ height, aspectRatio: '1 / 1', backgroundColor: HUES.red }}
    >
      <div className="text-center">
        <p className="text-[clamp(3rem,9vh,6rem)] leading-none font-extrabold">¯\_(ツ)_/¯</p>
        <p className="mt-3 font-mono text-[clamp(0.7rem,1.3vw,1rem)] font-bold tracking-[0.2em] uppercase">
          the machine refused
        </p>
      </div>
    </div>
  )
}

/**
 * A picture, framed like a photograph: hard border, hard offset shadow, and a
 * bounded box so `object-contain` decides the shape rather than the image.
 */
function Picture({
  url,
  failed,
  height,
  tilt = 0,
}: {
  url: string
  failed?: boolean
  height: string
  tilt?: number
}) {
  return (
    <Slab tone="chalk" className="overflow-hidden p-[clamp(0.4rem,0.9vh,0.8rem)]" tilt={tilt}>
      {isMissing(url, failed) ? (
        <NoPicture height={height} />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={url}
          alt=""
          className="block w-auto max-w-full object-contain"
          style={{ height, maxHeight: height }}
        />
      )}
    </Slab>
  )
}

/** A chunky segmented meter. Flat blocks, no bar, no fill animation. */
function Meter({
  done,
  total,
  label,
  tone = 'ink',
}: {
  done: number
  total: number
  label: string
  tone?: 'ink' | Hue
}) {
  return (
    <div className="flex flex-col items-center gap-[clamp(0.5rem,1.4vh,1rem)]">
      <div className="flex flex-wrap justify-center gap-[clamp(0.3rem,0.8vw,0.6rem)]">
        {Array.from({ length: Math.max(total, 1) }).map((_, i) => (
          <span
            key={i}
            className={`slab-sm block ${i < done ? 'pop' : ''}`}
            style={{
              height: 'clamp(1.4rem,3.4vh,2.6rem)',
              width: 'clamp(2.2rem,4.4vw,4rem)',
              backgroundColor:
                i < done ? (tone === 'ink' ? 'var(--color-ink)' : HUES[tone]) : 'var(--color-chalk)',
            }}
          />
        ))}
      </div>
      <p className="tnum font-mono text-[clamp(0.85rem,1.7vw,1.4rem)] font-bold tracking-[0.25em] uppercase">
        {done} of {total} {label}
      </p>
    </div>
  )
}

/** The middle row. Flexes, clips, never grows the page. */
function Stage({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`flex min-h-0 flex-col items-center justify-center gap-[clamp(0.7rem,2.2vh,1.8rem)] overflow-hidden text-center ${className}`}
    >
      {children}
    </section>
  )
}

function Headline({ children, size = 'lg' }: { children: React.ReactNode; size?: 'lg' | 'md' }) {
  const scale = size === 'lg' ? 'clamp(2.2rem,7.5vw,6rem)' : 'clamp(1.6rem,4.4vw,3.4rem)'
  return (
    <h2
      className="rise max-w-[22ch] leading-[0.92] font-extrabold tracking-tighter uppercase"
      style={{ fontSize: scale }}
    >
      {children}
    </h2>
  )
}

/** Did the sentence survive the chain? Presentation only, for the commentary. */
function drifted(beats: Beat[]): boolean {
  const texts = beats.filter((b): b is Extract<Beat, { kind: 'text' }> => b.kind === 'text')
  if (texts.length < 2) return false

  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? [])
  const first = words(texts[0].text)
  const last = words(texts[texts.length - 1].text)
  if (first.size === 0 || last.size === 0) return true

  let shared = 0
  for (const w of last) if (first.has(w)) shared += 1
  return shared / Math.max(first.size, last.size) < 0.5
}

function Reveal({ view }: { view: TelephoneHostView }) {
  const reveal = view.reveal!
  const current = reveal.beats[reveal.beats.length - 1]
  const atEnd = reveal.beat >= reveal.totalBeats - 1
  const line = atEnd
    ? flavorFor({
        game: 'telephone',
        kind: 'chain',
        drifted: drifted(reveal.beats),
        failedImages: reveal.beats.filter((b) => b.kind === 'image' && isMissing(b.imageUrl, b.failed)).length,
        index: reveal.chainNumber - 1,
      })
    : null

  return (
    <Stage>
      {/* Keyed on the beat so every step arrives with its own entrance. */}
      <div
        key={reveal.beat}
        className="flex min-h-0 w-full flex-col items-center justify-center gap-[clamp(0.6rem,1.8vh,1.4rem)]"
      >
        {current?.kind === 'image' ? (
          <div className="stamp">
            <Picture
              url={current.imageUrl}
              failed={current.failed}
              height="clamp(10rem,44vh,32rem)"
              tilt={-1.2}
            />
          </div>
        ) : null}

        {current?.kind === 'text' ? (
          <Slab tone="paper" className="rise max-w-[85vw] px-[clamp(1.2rem,4vw,3.5rem)] py-[clamp(1rem,3.5vh,2.5rem)]" tilt={-0.8}>
            <p
              className="max-w-[18ch] leading-[0.95] font-extrabold tracking-tight"
              style={{ fontSize: 'clamp(1.8rem,5.6vw,4.6rem)' }}
            >
              &ldquo;{current.text}&rdquo;
            </p>
          </Slab>
        ) : null}

        {current && (
          <div className="stamp flex items-center gap-3">
            <span
              className="slab-sm block h-[clamp(1.1rem,2.4vh,1.8rem)] w-[clamp(1.1rem,2.4vh,1.8rem)]"
              style={{ backgroundColor: current.color, borderRadius: 999 }}
            />
            <span className="font-mono text-[clamp(0.8rem,1.6vw,1.3rem)] font-bold tracking-[0.2em] uppercase">
              {current.kind === 'text'
                ? `${current.authorName} wrote it`
                : isMissing(current.imageUrl, current.failed)
                  ? 'the machine gave up'
                  : 'the machine drew it'}
            </span>
          </div>
        )}
      </div>

      <div className="min-h-[clamp(1rem,3vh,2rem)]">
        <Aside line={line} />
      </div>
    </Stage>
  )
}

/** The trail of everything this chain has already been. */
function Trail({ view }: { view: TelephoneHostView }) {
  const reveal = view.reveal!
  const size = 'clamp(2.4rem,7vh,4.5rem)'

  return (
    <div className="flex items-center justify-center gap-[clamp(0.35rem,0.9vw,0.75rem)] overflow-hidden">
      {reveal.beats.map((beat, index) => {
        const live = index === reveal.beats.length - 1
        return (
          <div
            key={index}
            className={`slab-sm grid shrink-0 place-items-center overflow-hidden ${live ? 'pop' : 'opacity-45'}`}
            style={{
              height: size,
              width: size,
              backgroundColor:
                beat.kind === 'text'
                  ? beat.color
                  : isMissing(beat.imageUrl, beat.failed)
                    ? HUES.red
                    : 'var(--color-chalk)',
              transform: live ? 'scale(1.14)' : undefined,
            }}
          >
            {beat.kind === 'image' && !isMissing(beat.imageUrl, beat.failed) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={beat.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[clamp(0.7rem,1.6vh,1.1rem)] font-extrabold uppercase">
                {beat.kind === 'text' ? initials(beat.authorName) : '?'}
              </span>
            )}
          </div>
        )
      })}
      <span className="tnum ml-3 font-mono text-[clamp(0.7rem,1.3vw,1rem)] font-bold tracking-[0.2em] uppercase opacity-60">
        beat {reveal.beat + 1} / {reveal.totalBeats}
      </span>
    </div>
  )
}

/** Who the room is still waiting on, as faces rather than a sentence. */
function Waiting({ view }: { view: TelephoneHostView }) {
  const pending = new Set(view.waitingOn)
  return (
    <div className="flex flex-wrap items-end justify-center gap-[clamp(0.6rem,1.6vw,1.4rem)] pr-64">
      {view.players.map((player) => (
        <Face key={player.id} name={player.name} color={player.color} size="sm" dim={pending.has(player.name)} />
      ))}
    </div>
  )
}

function Scoreboard({ view }: { view: TelephoneHostView }) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-[clamp(0.7rem,2vw,1.8rem)] pr-64">
      {[...view.players]
        .sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0))
        .map((player) => (
          <div key={player.id} className="flex items-center gap-2">
            <Face name={player.name} color={player.color} size="sm" />
            <span className="tnum text-[clamp(1.1rem,2.2vw,1.9rem)] font-extrabold">
              {view.scores[player.id] ?? 0}
            </span>
            {(view.awarded[player.id] ?? 0) > 0 && (
              <Sticker tone="lime" tilt={-6} className="pop">
                +{view.awarded[player.id]}
              </Sticker>
            )}
          </div>
        ))}
    </div>
  )
}

/** Filler for the twelve seconds the machine spends misunderstanding everyone. */
const MACHINE_MUTTERING = [
  'consulting the vibes',
  'misreading your sentence on purpose',
  'inventing a hand with six fingers',
  'rendering something regrettable',
  'adding details nobody asked for',
  'this will be worse than you think',
]

/**
 * The wait is a phase, not a spinner. Every chain gets a tile that fidgets
 * until its picture lands and then slams shut, so the room can watch the
 * machine work rather than wonder whether the game has hung.
 */
function Drawing({ view }: { view: TelephoneHostView }) {
  const total = Math.max(view.total, 1)
  // Deterministic, so the line does not flicker between broadcasts, and it
  // still changes as pictures come back.
  const muttering = MACHINE_MUTTERING[(view.stepIndex + view.drawn) % MACHINE_MUTTERING.length]

  return (
    <Stage>
      <Headline>Drawing</Headline>

      <div className="flex flex-wrap items-center justify-center gap-[clamp(0.5rem,1.4vw,1.1rem)]">
        {Array.from({ length: total }).map((_, i) => {
          const back = i < view.drawn
          return (
            <div
              key={i}
              className={`slab-sm grid place-items-center ${back ? 'pop' : 'wobble'}`}
              style={{
                height: 'clamp(3rem,11vh,7rem)',
                width: 'clamp(3rem,11vh,7rem)',
                backgroundColor: back ? HUES.yellow : 'var(--color-chalk)',
              }}
            >
              <span className="text-[clamp(1.2rem,4vh,2.4rem)] leading-none font-extrabold">
                {back ? '★' : '···'}
              </span>
            </div>
          )
        })}
      </div>

      <p className="tnum font-mono text-[clamp(0.85rem,1.7vw,1.4rem)] font-bold tracking-[0.25em] uppercase">
        {view.drawn} of {view.total} pictures back
      </p>

      <Slab tone="chalk" className="max-w-[46ch] px-[clamp(1rem,3vw,2.5rem)] py-[clamp(0.4rem,1.4vh,1rem)]" tilt={-1}>
        <p className="truncate font-mono text-[clamp(0.8rem,1.6vw,1.3rem)] font-bold lowercase">
          {muttering}
        </p>
      </Slab>

      <div className="min-h-[clamp(1.2rem,3.5vh,2.2rem)]">
        {view.waitingOn.length > 0 && (
          <p className="max-w-[44ch] truncate font-mono text-[clamp(0.75rem,1.4vw,1.1rem)] font-bold lowercase opacity-65">
            still waiting on {view.waitingOn.join(', ')}
          </p>
        )}
      </div>
    </Stage>
  )
}

export function TelephoneHostScreen({ view }: { view: TelephoneHostView }) {
  const writing = view.phase === 'write' || view.phase === 'describe'
  const hue = PHASE_HUE[view.phase]

  return (
    <Field hue={hue} pattern={PHASE_PATTERN[view.phase]}>
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-[clamp(0.6rem,2vh,1.6rem)] p-[clamp(1rem,3vh,2.5rem)]">
        <header className="flex shrink-0 items-center justify-between gap-4 pr-40">
          <Sticker tone="chalk" tilt={-2}>
            Broken Telephone
          </Sticker>
          <span className="tnum font-mono text-[clamp(0.75rem,1.5vw,1.2rem)] font-bold tracking-[0.2em] uppercase">
            {view.phase === 'reveal' && view.reveal
              ? `Chain ${view.reveal.chainNumber} of ${view.reveal.chainCount} · ${view.reveal.starterName} started it`
              : view.phase === 'vote'
                ? 'Pick a favourite'
                : view.phase === 'ended'
                  ? 'The room has spoken'
                  : `Step ${view.stepIndex + 1} of ${view.steps}`}
          </span>
        </header>

        {writing && (
          <Stage>
            <Headline>{view.phase === 'write' ? 'Write a sentence' : 'What was the sentence?'}</Headline>
            <Slab tone="chalk" className="px-[clamp(1rem,3vw,2.5rem)] py-[clamp(0.6rem,1.8vh,1.2rem)]" tilt={0.8}>
              <p className="max-w-[34ch] text-[clamp(1rem,2.4vw,2rem)] leading-tight font-bold">
                {view.phase === 'write'
                  ? 'Anything at all. A machine is about to have a go at it.'
                  : 'You only get the picture. Guess what made it.'}
              </p>
            </Slab>
            <Meter done={view.submitted} total={view.total} label="in" />
          </Stage>
        )}

        {view.phase === 'drawing' && <Drawing view={view} />}

        {view.phase === 'reveal' && view.reveal && <Reveal view={view} />}

        {view.phase === 'vote' && (
          <Stage>
            <Headline size="md">Which chain broke best?</Headline>
            <div className="flex min-h-0 flex-wrap items-start justify-center gap-[clamp(0.8rem,2.5vw,2rem)]">
              {view.chainLabels.map((chain, i) => (
                <div
                  key={chain.index}
                  className="rise flex flex-col items-center gap-2"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <Picture url={chain.thumbnail ?? ''} height="clamp(5rem,20vh,12rem)" tilt={i % 2 ? 1.5 : -1.5} />
                  <Sticker tone="chalk" tilt={i % 2 ? -3 : 3}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3"
                        style={{ backgroundColor: chain.color, borderRadius: 999 }}
                      />
                      {chain.starterName}
                    </span>
                  </Sticker>
                </div>
              ))}
            </div>
            <Meter done={view.voteCount} total={view.players.length} label="voted" />
          </Stage>
        )}

        {view.phase === 'ended' && (
          <Stage>
            {view.finale?.length ? (
              <>
                <Sticker tone="yellow" tilt={-4}>
                  Winner
                </Sticker>
                <div className="flex min-h-0 flex-wrap items-start justify-center gap-[clamp(1rem,3vw,2.5rem)] overflow-hidden">
                  {view.finale.map((chain) => (
                    <Slab
                      key={chain.chainIndex}
                      tone="chalk"
                      className="rise max-w-[36ch] px-[clamp(1rem,3vw,2.5rem)] py-[clamp(0.8rem,2.2vh,1.6rem)]"
                      tilt={-0.8}
                    >
                      <p className="text-[clamp(1rem,2vw,1.6rem)] font-extrabold tracking-tight uppercase">
                        {chain.starterName}&rsquo;s chain &middot; {chain.votes} votes
                      </p>
                      <p className="mt-3 text-[clamp(1.1rem,2.4vw,2rem)] leading-tight font-bold">
                        &ldquo;{chain.first}&rdquo;
                      </p>
                      <p className="my-2 font-mono text-[clamp(0.75rem,1.4vw,1.1rem)] font-bold tracking-[0.3em] uppercase opacity-55">
                        became
                      </p>
                      <p className="text-[clamp(1.3rem,3vw,2.6rem)] leading-tight font-extrabold">
                        &ldquo;{chain.last}&rdquo;
                      </p>
                    </Slab>
                  ))}
                </div>
              </>
            ) : (
              <Headline size="md">Nobody voted. Nobody wins.</Headline>
            )}
          </Stage>
        )}

        <footer className="flex shrink-0 items-center justify-center">
          {view.phase === 'reveal' && view.reveal ? (
            <Trail view={view} />
          ) : writing || view.phase === 'drawing' ? (
            <Waiting view={view} />
          ) : (
            <Scoreboard view={view} />
          )}
        </footer>
      </div>
    </Field>
  )
}
