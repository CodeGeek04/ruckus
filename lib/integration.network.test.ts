// lib/integration.network.test.ts
//
// A HEADLESS PLAYTHROUGH AGAINST THE REAL APPSYNC EVENTS BUS.
//
// This is not a unit test. It opens five real WebSockets to AWS, stands up the
// actual host runtime and four actual player clients, and plays a complete
// eight round game of Hearsay over the wire. It is excluded from `npm test`
// and is run on purpose with `node scripts/play-through.mjs`.
//
// Everything on the host side is production code: the real GameModule, the
// real reducer, the real hostView and playerView. The only things invented
// here are the four simulated humans and the assertions.

import { expect, it } from 'vitest'
import { hearsay } from '@/lib/games/hearsay'
import type { HearsayInput } from '@/lib/games/hearsay/state'
import type { HearsayHostView, HearsayPlayerView } from '@/lib/games/hearsay/views'
import { newRoomCode } from '@/lib/ids'
import { createHostRuntime } from '@/lib/runtime/hostRuntime'
import { createPlayerClient, type PlayerClient } from '@/lib/runtime/playerClient'
import type { Player } from '@/lib/types'

const NAMES = ['Sam', 'Mike', 'Ron', 'Emily'] as const

/** Long enough for a subscribe to be acked on the far side of the Atlantic. */
const SETTLE_MS = 2_500
/** Pause on a host driven phase, so a human reading the trace can follow it. */
const STEP_MS = 400
const JOIN_RETRY_MS = 1_500
const JOIN_TIMEOUT_MS = 30_000
const GAME_TIMEOUT_MS = 420_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type RoundTrace = {
  round: number
  accusedName: string
  question: string
  /** Voter name to the name they pointed at. */
  votes: Record<string, string>
  predictions: Record<string, boolean>
  guessedRight: boolean
  awarded: Record<string, number>
}

type HostSample = { phase: string; round: number; json: string }
type PlayerSample = { name: string; view: HearsayPlayerView }

const failures: string[] = []
function check(ok: boolean, label: string, detail = '') {
  if (ok) {
    console.log(`  PASS  ${label}`)
    return
  }
  failures.push(detail ? `${label}: ${detail}` : label)
  console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ''}`)
}

it('plays a whole game of Hearsay over the live bus', async () => {
  const code = newRoomCode()
  console.log(`\n=== Ruckus live playthrough, room ${code} ===\n`)

  // ---------------------------------------------------------------- host ---

  const hostSamples: HostSample[] = []
  const playerSamples: PlayerSample[] = []
  const sounds: string[] = []
  const traces: RoundTrace[] = []

  let lobby: Player[] = []
  /** Round number the host is currently showing, 1 based. Read by the phones. */
  let currentRound = 0
  /** Question text for the current round, learned from a voter's phone. */
  let currentQuestion: string | null = null
  const questionByRound = new Map<number, string>()
  /** Predictions seen for the round in play, reset whenever the round turns. */
  let livePredictions: Record<string, boolean> = {}

  const handled = new Set<string>()
  let finished: (() => void) | null = null
  const ended = new Promise<void>((resolve) => {
    finished = resolve
  })

  const runtime = createHostRuntime(code, {
    onPlayers: (players) => {
      lobby = players
    },
    onView: (raw) => {
      const view = raw as HearsayHostView
      hostSamples.push({ phase: view.phase, round: view.roundNumber, json: JSON.stringify(view) })

      if (view.roundNumber !== currentRound) {
        currentRound = view.roundNumber
        currentQuestion = null
        livePredictions = {}
      }

      if (view.phase === 'verdict') {
        const voteNames: Record<string, string> = {}
        for (const [voterId, targetId] of Object.entries(view.voters ?? {})) {
          voteNames[nameOf(voterId)] = nameOf(targetId)
        }
        const predictions = { ...livePredictions }
        if (!traces.some((t) => t.round === view.roundNumber)) {
          traces.push({
            round: view.roundNumber,
            accusedName: view.accusedName,
            question: view.question ?? '(missing)',
            votes: voteNames,
            predictions,
            guessedRight: view.accusedPickedCorrectly === true,
            awarded: Object.fromEntries(
              Object.entries(view.awarded).map(([id, points]) => [nameOf(id), points])
            ),
          })
        }
      }

      if (view.phase === 'ended') {
        finished?.()
        return
      }

      // The host drives every phase the players do not finish themselves.
      // charge, evidence, verdict and scoreboard all end on the host's clock,
      // so pressing on immediately is exactly what the real host button does.
      const key = `${view.roundNumber}:${view.phase}`
      if (handled.has(key)) return
      handled.add(key)

      if (
        view.phase === 'charge' ||
        view.phase === 'evidence' ||
        view.phase === 'verdict' ||
        view.phase === 'scoreboard'
      ) {
        setTimeout(() => runtime.advance(), STEP_MS)
      }
    },
    onGame: () => {},
    onSound: (name) => sounds.push(name),
  })

  function nameOf(playerId: string): string {
    return lobby.find((p) => p.id === playerId)?.name ?? playerId
  }

  // -------------------------------------------------------------- players ---

  const accepted = new Map<string, Player>()

  type Sim = { name: string; client: PlayerClient; sent: Set<string> }
  const sims: Sim[] = []

  await sleep(SETTLE_MS)

  for (const name of NAMES) {
    const sent = new Set<string>()
    const sim: Sim = { name, client: null as unknown as PlayerClient, sent }

    sim.client = createPlayerClient(code, {
      onAccepted: (player) => accepted.set(name, player),
      onLobby: () => {},
      onStatus: () => {},
      onHostStatus: () => {},
      onRejected: () => {},
      onView: (raw) => {
        const view = raw as HearsayPlayerView
        playerSamples.push({ name, view })

        // A voter is the only one who ever sees the charge, so this is also
        // how the harness itself learns what was asked.
        if (view.charge && !questionByRound.has(currentRound)) {
          questionByRound.set(currentRound, view.charge)
        }
        if (view.charge) currentQuestion = view.charge

        const key = `${currentRound}:${view.action}`
        if (view.action === 'wait' || sent.has(key)) return
        sent.add(key)

        if (view.action === 'vote') {
          const target = view.targets.find((p) => p.name !== name && p.name !== view.accusedName)
          if (target) send(sim, { kind: 'vote', targetId: target.id })
          return
        }

        if (view.action === 'predict') {
          const willGetIt = currentRound % 2 === 0
          // Recorded here rather than read back off a later view: the host
          // reaches the verdict the instant the last input lands, well before
          // the echo of that input comes back over the wire.
          livePredictions[name] = willGetIt
          send(sim, { kind: 'predict', willGetIt })
          return
        }

        if (view.action === 'guess') {
          const options = view.options ?? []
          // The harness knows the real question because a voter's phone told
          // it. The accused deliberately gets it right on even rounds and
          // wrong on odd ones, so both scoring branches are exercised.
          const truth = options.find((o) => o.text === currentQuestion)
          const lie = options.find((o) => o.text !== currentQuestion)
          const pick = currentRound % 2 === 0 ? (truth ?? options[0]) : (lie ?? options[0])
          if (pick) send(sim, { kind: 'guess', questionId: pick.id })
        }
      },
    })

    sims.push(sim)
  }

  function send(sim: Sim, input: HearsayInput) {
    sim.client.send(input)
  }

  await sleep(SETTLE_MS)

  const joinDeadline = Date.now() + JOIN_TIMEOUT_MS
  while (accepted.size < NAMES.length && Date.now() < joinDeadline) {
    for (const sim of sims) {
      if (!accepted.has(sim.name)) sim.client.join(sim.name)
    }
    await sleep(JOIN_RETRY_MS)
  }

  console.log('--- lobby ---')
  for (const name of NAMES) {
    console.log(`  ${accepted.has(name) ? 'joined' : 'MISSING'}  ${name}`)
  }
  console.log('')

  check(accepted.size === NAMES.length, 'all four players accepted into the lobby', `${accepted.size}/4`)
  if (accepted.size < NAMES.length) {
    runtime.destroy()
    for (const sim of sims) sim.client.destroy()
    throw new Error('PLAYTHROUGH FAIL: lobby never filled')
  }

  // ----------------------------------------------------------------- play ---

  runtime.start(hearsay as never)

  let timedOut = false
  await Promise.race([
    ended,
    sleep(GAME_TIMEOUT_MS).then(() => {
      timedOut = true
    }),
  ])

  const finalView = hostSamples[hostSamples.length - 1]
  runtime.destroy()
  for (const sim of sims) sim.client.destroy()

  // ---------------------------------------------------------------- trace ---

  console.log('--- round by round ---')
  for (const t of traces) {
    const votes = Object.entries(t.votes).map(([voter, target]) => `${voter}->${target}`).join(', ')
    const predictions = Object.entries(t.predictions).map(([n, v]) => `${n}:${v ? 'yes' : 'no'}`).join(', ')
    const awarded = Object.entries(t.awarded).map(([n, p]) => `${n} +${p}`).join(', ')
    console.log(`  Round ${t.round}  accused: ${t.accusedName}`)
    console.log(`    charge      ${t.question}`)
    console.log(`    votes       ${votes || '(none)'}`)
    console.log(`    crowd       ${predictions || '(none)'}`)
    console.log(`    verdict     ${t.guessedRight ? 'GOT IT' : 'no idea'}`)
    console.log(`    awarded     ${awarded || '(nobody)'}`)
  }
  console.log('')

  const endedView: HearsayHostView | null =
    finalView && finalView.phase === 'ended' ? (JSON.parse(finalView.json) as HearsayHostView) : null

  console.log('--- final scores ---')
  if (endedView) {
    for (const player of [...endedView.players].sort((a, b) => endedView.scores[b.id] - endedView.scores[a.id])) {
      console.log(`  ${player.name.padEnd(8)} ${endedView.scores[player.id] ?? 0}`)
    }
  }
  console.log(`\n  sounds fired: ${sounds.join(', ') || '(none)'}\n`)

  // ----------------------------------------------------------- invariants ---

  console.log('--- invariants ---')

  check(!timedOut, 'the game finished inside the timeout')
  check(endedView !== null, 'the game reached the ended phase', finalView?.phase ?? 'no view at all')

  const accusedCounts = new Map<string, number>()
  for (const t of traces) accusedCounts.set(t.accusedName, (accusedCounts.get(t.accusedName) ?? 0) + 1)
  check(traces.length === 8, 'eight rounds were played', `saw ${traces.length}`)
  check(
    NAMES.every((n) => accusedCounts.get(n) === 2),
    'every player was accused exactly twice',
    [...accusedCounts].map(([n, c]) => `${n}=${c}`).join(' ')
  )

  const questions = traces.map((t) => t.question)
  check(
    new Set(questions).size === questions.length,
    'no question was asked twice',
    questions.length ? '' : 'no questions recorded'
  )

  const hidden: HostSample[] = hostSamples.filter((s) =>
    ['charge', 'testimony', 'evidence', 'guess'].includes(s.phase)
  )
  const leaks = hidden.filter((s) => {
    const question = questionByRound.get(s.round)
    return question !== undefined && s.json.includes(question)
  })
  check(
    leaks.length === 0,
    'the host view never carries the question before the verdict',
    leaks.length ? `${leaks.length} leaking host views` : ''
  )

  const optionLeaks = playerSamples.filter((s) => s.view.options !== null && !s.view.isAccused)
  check(
    optionLeaks.length === 0,
    'only the accused ever receives the three options',
    optionLeaks.length ? `${optionLeaks.length} views` : ''
  )
  const chargeLeaks = playerSamples.filter((s) => s.view.isAccused && s.view.charge !== null)
  check(
    chargeLeaks.length === 0,
    'the accused never receives the charge',
    chargeLeaks.length ? `${chargeLeaks.length} views` : ''
  )

  const expected: Record<string, number> = {}
  for (const t of traces) {
    for (const [name, points] of Object.entries(t.awarded)) {
      expected[name] = (expected[name] ?? 0) + points
    }
  }
  const actual: Record<string, number> = {}
  if (endedView) {
    for (const player of endedView.players) actual[player.name] = endedView.scores[player.id] ?? 0
  }
  const mismatched = NAMES.filter((n) => (actual[n] ?? 0) !== (expected[n] ?? 0))
  check(
    mismatched.length === 0,
    'final scores equal the sum of the per round awards',
    mismatched.map((n) => `${n}: total ${actual[n]} vs awarded ${expected[n] ?? 0}`).join('; ')
  )

  console.log('')
  console.log(failures.length === 0 ? 'PLAYTHROUGH PASS' : `PLAYTHROUGH FAIL\n  - ${failures.join('\n  - ')}`)
  console.log('')

  expect(failures).toEqual([])
})
