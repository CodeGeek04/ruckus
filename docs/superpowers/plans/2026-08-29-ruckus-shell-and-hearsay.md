# Ruckus Shell and Hearsay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a playable Jackbox-style party game, Hearsay, on a reusable Ruckus shell where the host browser tab is the game server and phones are controllers.

**Architecture:** The host tab holds all state and runs a pure reducer. AWS AppSync Events is a dumb message bus with two channel shapes: a public channel per room, and a private channel per player for anything secret. No database, no API routes, no server state. Every game implements the same four-function module contract, so game two costs no new infrastructure.

**Tech Stack:** Next.js 16 (App Router, Turbopack default, `params` is a Promise), React 19, Tailwind 4, TypeScript, Vitest for pure logic, AWS AppSync Events over native browser `WebSocket` and `fetch`.

**Spec:** `docs/superpowers/specs/2026-08-29-ruckus-design.md`

**Verified before writing this plan:**
- AppSync Events dev API is provisioned and working. Publish returns 200 in ~300ms; subscribers receive in ~30ms.
- Nested channels (`/room/BLOB/p/p123`) route correctly, so the private channel design is sound.
- Bedrock is reachable but **not needed for Hearsay**. No AI in this plan at all.

---

## File structure

```
lib/
  ids.ts                    room codes, player ids
  types.ts                  Player, GameEvent, Command, GameModule
  bus/channels.ts           channel name helpers
  bus/client.ts             AppSync Events connect / subscribe / publish
  runtime/hostRuntime.ts    drives a GameModule: state, timers, broadcast, snapshot
  runtime/playerClient.ts   phone side: subscribe public + private, send input
  games/registry.ts         id -> GameModule
  games/hearsay/state.ts    state and input types, config defaults
  games/hearsay/rounds.ts   shuffle bag, accused order
  games/hearsay/questions.ts bank, families, decoy selection
  games/hearsay/scoring.ts  pure round scoring
  games/hearsay/reduce.ts   pure phase machine
  games/hearsay/index.ts    GameModule wiring
  games/hearsay/HostScreen.tsx
  games/hearsay/PlayerScreen.tsx
app/
  page.tsx                  landing: join by code, or host
  host/page.tsx             host screen
  play/[code]/page.tsx      phone
components/
  Screen.tsx, Countdown.tsx, PlayerChip.tsx, BigButton.tsx, Scoreboard.tsx, QrCode.tsx
```

One responsibility per file. `reduce.ts`, `scoring.ts`, `rounds.ts` and `questions.ts` are pure and fully unit tested. Everything else is verified by playing the game.

---

## Task 1: Project setup

**Files:**
- Create: `vitest.config.ts`
- Create: `.env.local`
- Modify: `package.json`

- [ ] **Step 1: Install dev and runtime dependencies**

```bash
npm install --save-dev vitest
npm install qrcode
npm install --save-dev @types/qrcode
```

- [ ] **Step 2: Create `vitest.config.ts`**

Tests are pure logic only, so the node environment is correct and no DOM shim is needed.

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add the test script to `package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create `.env.local` with the verified AppSync values**

```
NEXT_PUBLIC_EVENTS_HTTP=rqkxngnivjhcbnidvhp745xmpq.appsync-api.ap-south-1.amazonaws.com
NEXT_PUBLIC_EVENTS_REALTIME=rqkxngnivjhcbnidvhp745xmpq.appsync-realtime-api.ap-south-1.amazonaws.com
NEXT_PUBLIC_EVENTS_API_KEY=da2-iuxktnitlbbx7fbbvq4j6zp4jy
```

- [ ] **Step 5: Confirm `.env.local` is ignored**

Run: `git check-ignore -v .env.local`
Expected: a line naming `.gitignore` and the `.env*` pattern. If it prints nothing, add `.env*.local` to `.gitignore` before continuing.

- [ ] **Step 6: Verify the test runner starts**

Run: `npm test`
Expected: `No test files found` and exit code 1. That is correct at this point.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest and qrcode, configure test runner"
```

---

## Task 2: Room codes and ids

**Files:**
- Create: `lib/ids.ts`
- Test: `lib/ids.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { CODE_ALPHABET, newPlayerId, newRoomCode } from './ids'

describe('newRoomCode', () => {
  it('is four characters long', () => {
    expect(newRoomCode()).toHaveLength(4)
  })

  it('only uses the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      for (const ch of newRoomCode()) {
        expect(CODE_ALPHABET).toContain(ch)
      }
    }
  })

  it('excludes characters that are misread over a compressed video stream', () => {
    expect(CODE_ALPHABET).not.toContain('I')
    expect(CODE_ALPHABET).not.toContain('O')
    expect(CODE_ALPHABET).not.toContain('0')
    expect(CODE_ALPHABET).not.toContain('1')
  })
})

describe('newPlayerId', () => {
  it('produces distinct ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newPlayerId()))
    expect(ids.size).toBe(500)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/ids.test.ts`
Expected: FAIL, cannot resolve `./ids`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/ids.ts

/** No I, O, 0 or 1: those are the characters people misread off a Discord stream. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function newRoomCode(): string {
  let out = ''
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

export function newPlayerId(): string {
  return `p_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/ids.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/ids.ts lib/ids.test.ts
git commit -m "feat: room codes and player ids"
```

---

## Task 3: Shared types and the game module contract

**Files:**
- Create: `lib/types.ts`

No test. This file contains only types and one trivial constant, so a test would assert nothing real.

- [ ] **Step 1: Write the file**

```ts
// lib/types.ts
import type { ComponentType } from 'react'

export type PlayerId = string

export type Player = {
  id: PlayerId
  name: string
  color: string
  connected: boolean
}

export const PLAYER_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#a855f7', '#ec4899',
  '#14b8a6', '#f43f5e', '#8b5cf6', '#84cc16',
] as const

/** Anything a phone can send to the host. Games narrow the payload. */
export type GameEvent<Input = unknown> =
  | { type: 'input'; playerId: PlayerId; payload: Input }
  | { type: 'deadline' }
  | { type: 'hostAdvance' }

/** How a pure reducer asks the runtime to do impure work. */
export type Command =
  | { kind: 'timer'; ms: number }
  | { kind: 'sound'; name: string }

export type Reduced<State> = { state: State; commands?: Command[] }

/**
 * Every game implements this. `hostView` output is public and goes on the
 * shared screen. `playerView` output goes to one phone over its private
 * channel and is the ONLY place secrets may appear.
 */
export type GameModule<State, Input, HostView, PlayerView> = {
  id: string
  name: string
  tagline: string
  minPlayers: number
  maxPlayers: number
  init(players: Player[]): State
  reduce(state: State, event: GameEvent<Input>): Reduced<State>
  hostView(state: State): HostView
  playerView(state: State, playerId: PlayerId): PlayerView
  HostScreen: ComponentType<{ view: HostView }>
  PlayerScreen: ComponentType<{ view: PlayerView; send: (input: Input) => void }>
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: shared types and game module contract"
```

---

## Task 4: Channel helpers

**Files:**
- Create: `lib/bus/channels.ts`
- Test: `lib/bus/channels.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { privateChannel, publicChannel } from './channels'

describe('channels', () => {
  it('namespaces the public channel under room', () => {
    expect(publicChannel('BLOB')).toBe('/room/BLOB')
  })

  it('puts each player on their own nested channel', () => {
    expect(privateChannel('BLOB', 'p_abc')).toBe('/room/BLOB/p/p_abc')
  })

  it('uppercases the code so a typed lowercase code still joins', () => {
    expect(publicChannel('blob')).toBe('/room/BLOB')
    expect(privateChannel('blob', 'p_abc')).toBe('/room/BLOB/p/p_abc')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/bus/channels.test.ts`
Expected: FAIL, cannot resolve `./channels`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/bus/channels.ts
export function publicChannel(code: string): string {
  return `/room/${code.toUpperCase()}`
}

export function privateChannel(code: string, playerId: string): string {
  return `/room/${code.toUpperCase()}/p/${playerId}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/bus/channels.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/bus/channels.ts lib/bus/channels.test.ts
git commit -m "feat: appsync events channel helpers"
```

---

## Task 5: The AppSync Events client

**Files:**
- Create: `lib/bus/client.ts`

This is I/O against a live AWS service, so it is verified by a live smoke test in Task 6 rather than by a unit test. Mocking a WebSocket here would only test the mock.

The wire protocol below is verified working against the provisioned API, not inferred:

1. Open `wss://<realtime>/event/realtime` with two subprotocols: `aws-appsync-event-ws` and `header-<base64url(JSON auth header)>`.
2. Send `{"type":"connection_init"}`, wait for `connection_ack`.
3. Send `{"type":"subscribe","id":"<id>","channel":"<channel>","authorization":<auth>}`, wait for `subscribe_success`.
4. Publish over HTTPS: `POST https://<http>/event` with `{"channel":"<channel>","events":["<json string>"]}`.
5. Inbound messages arrive as `{"type":"data","id":"<subId>","event":"<json string>"}`. Server also sends `ka` keepalives, which are ignored.

- [ ] **Step 1: Write the file**

```ts
// lib/bus/client.ts
'use client'

const HTTP = process.env.NEXT_PUBLIC_EVENTS_HTTP!
const REALTIME = process.env.NEXT_PUBLIC_EVENTS_REALTIME!
const API_KEY = process.env.NEXT_PUBLIC_EVENTS_API_KEY!

const authHeader = { host: HTTP, 'x-api-key': API_KEY }

function base64url(value: object): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export type Bus = {
  subscribe(channel: string, onEvent: (data: unknown) => void): () => void
  publish(channel: string, data: unknown): Promise<void>
  close(): void
  onStatus(cb: (status: 'connecting' | 'open' | 'closed') => void): void
}

/**
 * One WebSocket per client, many subscriptions multiplexed over it.
 * Reconnects with backoff and re-subscribes everything, because phones
 * lock their screens constantly and Discord notifications steal focus.
 */
export function createBus(): Bus {
  let ws: WebSocket | null = null
  let ready = false
  let closedByUs = false
  let attempt = 0
  let statusCb: ((s: 'connecting' | 'open' | 'closed') => void) | null = null

  const subs = new Map<string, { channel: string; onEvent: (data: unknown) => void }>()
  const pending: string[] = []

  const setStatus = (s: 'connecting' | 'open' | 'closed') => statusCb?.(s)

  function send(message: object) {
    const text = JSON.stringify(message)
    if (ready && ws) ws.send(text)
    else pending.push(text)
  }

  function sendSubscribe(id: string, channel: string) {
    send({ type: 'subscribe', id, channel, authorization: authHeader })
  }

  function connect() {
    setStatus('connecting')
    ws = new WebSocket(`wss://${REALTIME}/event/realtime`, [
      'aws-appsync-event-ws',
      `header-${base64url(authHeader)}`,
    ])

    ws.onopen = () => ws!.send(JSON.stringify({ type: 'connection_init' }))

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string)
      if (msg.type === 'connection_ack') {
        ready = true
        attempt = 0
        setStatus('open')
        for (const [id, sub] of subs) sendSubscribe(id, sub.channel)
        while (pending.length) ws!.send(pending.shift()!)
        return
      }
      if (msg.type === 'data') {
        const sub = subs.get(msg.id)
        if (sub) sub.onEvent(JSON.parse(msg.event))
      }
    }

    ws.onclose = () => {
      ready = false
      setStatus('closed')
      if (closedByUs) return
      attempt += 1
      setTimeout(connect, Math.min(500 * attempt, 5000))
    }

    ws.onerror = () => ws?.close()
  }

  connect()

  return {
    subscribe(channel, onEvent) {
      const id = `s_${Math.random().toString(36).slice(2, 10)}`
      subs.set(id, { channel, onEvent })
      sendSubscribe(id, channel)
      return () => {
        subs.delete(id)
        send({ type: 'unsubscribe', id })
      }
    },

    async publish(channel, data) {
      await fetch(`https://${HTTP}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ channel, events: [JSON.stringify(data)] }),
      })
    },

    close() {
      closedByUs = true
      ws?.close()
    },

    onStatus(cb) {
      statusCb = cb
    },
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/bus/client.ts
git commit -m "feat: appsync events bus client with reconnect"
```

---

## Task 6: Live smoke test of the bus

**Files:**
- Create: `scripts/bus-smoke.mjs`

- [ ] **Step 1: Write the script**

```js
// scripts/bus-smoke.mjs
// Run against the real AppSync Events API. Node 22+ has WebSocket and fetch built in.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => line.split('=').map((part) => part.trim()))
)

const HTTP = env.NEXT_PUBLIC_EVENTS_HTTP
const RT = env.NEXT_PUBLIC_EVENTS_REALTIME
const KEY = env.NEXT_PUBLIC_EVENTS_API_KEY
const auth = { host: HTTP, 'x-api-key': KEY }
const b64url = (o) =>
  Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const channel = '/room/SMOK/p/p_test'
const ws = new WebSocket(`wss://${RT}/event/realtime`, ['aws-appsync-event-ws', `header-${b64url(auth)}`])

let failed = true

ws.onopen = () => ws.send(JSON.stringify({ type: 'connection_init' }))
ws.onmessage = async (ev) => {
  const m = JSON.parse(ev.data)
  if (m.type === 'connection_ack') {
    ws.send(JSON.stringify({ type: 'subscribe', id: 'sub1', channel, authorization: auth }))
  }
  if (m.type === 'subscribe_success') {
    const res = await fetch(`https://${HTTP}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
      body: JSON.stringify({ channel, events: [JSON.stringify({ hello: 'ruckus' })] }),
    })
    console.log('publish status', res.status)
  }
  if (m.type === 'data') {
    const payload = JSON.parse(m.event)
    console.log('received', payload)
    failed = payload.hello !== 'ruckus'
    ws.close()
    console.log(failed ? 'SMOKE FAIL' : 'SMOKE PASS')
    process.exit(failed ? 1 : 0)
  }
  if (m.type === 'subscribe_error' || m.type === 'connection_error') {
    console.error('SMOKE FAIL', JSON.stringify(m))
    process.exit(1)
  }
}

setTimeout(() => {
  console.error('SMOKE FAIL: timed out')
  process.exit(1)
}, 10000)
```

- [ ] **Step 2: Run it**

Run: `node scripts/bus-smoke.mjs`
Expected output, in order:

```
publish status 200
received { hello: 'ruckus' }
SMOKE PASS
```

If this fails, stop and fix the bus before building anything on top of it. Every later task assumes this passes.

- [ ] **Step 3: Commit**

```bash
git add scripts/bus-smoke.mjs
git commit -m "test: live smoke test for the events bus"
```

---

## Task 7: Hearsay state types and config

**Files:**
- Create: `lib/games/hearsay/state.ts`

- [ ] **Step 1: Write the file**

```ts
// lib/games/hearsay/state.ts
import type { Player, PlayerId } from '@/lib/types'

export type Phase =
  | 'charge'
  | 'testimony'
  | 'evidence'
  | 'guess'
  | 'verdict'
  | 'scoreboard'
  | 'ended'

export type QuestionFamily = 'conflict' | 'affection' | 'chaos' | 'trust' | 'secrets'

export type Question = {
  id: string
  /** Contains {X}, replaced with the accused player's name at render time. */
  template: string
  family: QuestionFamily
  tone: 'mild' | 'spicy'
}

export type HearsayInput =
  | { kind: 'vote'; targetId: PlayerId }
  | { kind: 'predict'; willGetIt: boolean }
  | { kind: 'guess'; questionId: string }

export type Round = {
  accusedId: PlayerId
  question: Question
  /** The real question plus two decoys, already shuffled. */
  options: Question[]
  votes: Record<PlayerId, PlayerId>
  predictions: Record<PlayerId, boolean>
  accusedPick: string | null
  /** Points awarded for this round, filled in when entering the verdict phase. */
  awarded: Record<PlayerId, number>
}

export type HearsayConfig = {
  scoring: {
    accusedCorrect: number
    readTheRoom: number
    /**
     * Ships true: the room only scores when the accused gets it right.
     * Under review pending a playtest. Flip to false to make the rewards
     * independent, or set readTheRoom to 0 to make the chair the only
     * thing that scores.
     */
    readTheRoomRequiresAccusedCorrect: boolean
  }
  durations: Record<Exclude<Phase, 'ended'>, number>
  minRounds: number
  tone: 'mild' | 'spicy'
}

export const DEFAULT_CONFIG: HearsayConfig = {
  scoring: {
    accusedCorrect: 1000,
    readTheRoom: 500,
    readTheRoomRequiresAccusedCorrect: true,
  },
  durations: {
    charge: 5000,
    testimony: 20000,
    evidence: 10000,
    guess: 25000,
    verdict: 20000,
    scoreboard: 8000,
  },
  minRounds: 8,
  tone: 'mild',
}

export type HearsayState = {
  phase: Phase
  players: Player[]
  config: HearsayConfig
  /** One entry per round: who is accused. Length is the total round count. */
  order: PlayerId[]
  roundIndex: number
  rounds: Round[]
  scores: Record<PlayerId, number>
  usedQuestionIds: string[]
}

export function accusedOf(state: HearsayState): PlayerId {
  return state.order[state.roundIndex]
}

export function currentRound(state: HearsayState): Round {
  return state.rounds[state.roundIndex]
}

export function voters(state: HearsayState): Player[] {
  const accused = accusedOf(state)
  return state.players.filter((p) => p.id !== accused)
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/games/hearsay/state.ts
git commit -m "feat: hearsay state types and default config"
```

---

## Task 8: Round allocation

Everyone sits in the chair the same number of times, running enough full cycles to reach at least `minRounds`. Nobody is ever accused twice in a row, including across a cycle boundary.

**Files:**
- Create: `lib/games/hearsay/rounds.ts`
- Test: `lib/games/hearsay/rounds.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { buildAccusedOrder } from './rounds'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`)

describe('buildAccusedOrder', () => {
  it('runs whole cycles so everyone is accused an equal number of times', () => {
    const order = buildAccusedOrder(ids(4), 8)
    expect(order).toHaveLength(8)
    for (const id of ids(4)) {
      expect(order.filter((x) => x === id)).toHaveLength(2)
    }
  })

  it('rounds up to a whole cycle rather than cutting someone out', () => {
    // 6 players, minimum 8 rounds: two full cycles of 6, not 8 rounds.
    const order = buildAccusedOrder(ids(6), 8)
    expect(order).toHaveLength(12)
    for (const id of ids(6)) {
      expect(order.filter((x) => x === id)).toHaveLength(2)
    }
  })

  it('uses a single cycle when the group is already big enough', () => {
    const order = buildAccusedOrder(ids(9), 8)
    expect(order).toHaveLength(9)
    for (const id of ids(9)) {
      expect(order.filter((x) => x === id)).toHaveLength(1)
    }
  })

  it('never accuses the same player twice in a row', () => {
    for (let run = 0; run < 200; run++) {
      const order = buildAccusedOrder(ids(4), 8)
      for (let i = 1; i < order.length; i++) {
        expect(order[i]).not.toBe(order[i - 1])
      }
    }
  })

  it('contains every player even with the minimum group size', () => {
    const order = buildAccusedOrder(ids(4), 8)
    expect(new Set(order).size).toBe(4)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/games/hearsay/rounds.test.ts`
Expected: FAIL, cannot resolve `./rounds`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/games/hearsay/rounds.ts
import type { PlayerId } from '@/lib/types'

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Whole cycles only, so every player is accused the same number of times.
 * Re-shuffles a cycle if it would repeat the previous cycle's last player,
 * which is possible in principle and jarring in practice.
 */
export function buildAccusedOrder(playerIds: readonly PlayerId[], minRounds: number): PlayerId[] {
  const cycles = Math.max(1, Math.ceil(minRounds / playerIds.length))
  const order: PlayerId[] = []

  for (let c = 0; c < cycles; c++) {
    let cycle = shuffled(playerIds)
    if (playerIds.length > 1) {
      let guard = 0
      while (order.length > 0 && cycle[0] === order[order.length - 1] && guard < 50) {
        cycle = shuffled(playerIds)
        guard++
      }
    }
    order.push(...cycle)
  }

  return order
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/games/hearsay/rounds.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/games/hearsay/rounds.ts lib/games/hearsay/rounds.test.ts
git commit -m "feat: equal-turn accused order with no back to back repeats"
```

---

## Task 9: The question bank and decoy selection

Ships with 20 hand-written questions. Decoy difficulty scales with the number of voters: with few voters the evidence is thin, so decoys come from different families and the vote pattern is genuinely informative. With many voters, decoys come from the same family and the guess gets harder.

**Files:**
- Create: `lib/games/hearsay/questions.ts`
- Test: `lib/games/hearsay/questions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { QUESTION_BANK, pickQuestion, renderQuestion } from './questions'

describe('QUESTION_BANK', () => {
  it('ships at least 20 questions', () => {
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(20)
  })

  it('has at least three mild questions in every family, so mild rooms always get same-family decoys', () => {
    const families = new Set(QUESTION_BANK.map((q) => q.family))
    for (const family of families) {
      const mild = QUESTION_BANK.filter((q) => q.family === family && q.tone === 'mild')
      expect(mild.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('has unique ids', () => {
    expect(new Set(QUESTION_BANK.map((q) => q.id)).size).toBe(QUESTION_BANK.length)
  })

  it('every question addresses the accused by placeholder', () => {
    for (const q of QUESTION_BANK) expect(q.template).toContain('{X}')
  })
})

describe('renderQuestion', () => {
  it('substitutes the accused name everywhere', () => {
    expect(renderQuestion({ id: 'q', template: 'Who would {X} call?', family: 'trust', tone: 'mild' }, 'Sam'))
      .toBe('Who would Sam call?')
  })
})

describe('pickQuestion', () => {
  it('returns three options containing the real question', () => {
    const picked = pickQuestion({ tone: 'mild', voterCount: 5, usedQuestionIds: [] })
    expect(picked.options).toHaveLength(3)
    expect(picked.options.map((q) => q.id)).toContain(picked.question.id)
  })

  it('never repeats a question that was already used', () => {
    const used = QUESTION_BANK.slice(0, 10).map((q) => q.id)
    for (let i = 0; i < 50; i++) {
      const picked = pickQuestion({ tone: 'mild', voterCount: 5, usedQuestionIds: used })
      expect(used).not.toContain(picked.question.id)
    }
  })

  it('uses decoys from other families when there are few voters', () => {
    for (let i = 0; i < 50; i++) {
      const picked = pickQuestion({ tone: 'mild', voterCount: 3, usedQuestionIds: [] })
      const decoys = picked.options.filter((q) => q.id !== picked.question.id)
      for (const decoy of decoys) expect(decoy.family).not.toBe(picked.question.family)
    }
  })

  it('uses same-family decoys when there are many voters', () => {
    for (let i = 0; i < 50; i++) {
      const picked = pickQuestion({ tone: 'mild', voterCount: 8, usedQuestionIds: [] })
      const decoys = picked.options.filter((q) => q.id !== picked.question.id)
      for (const decoy of decoys) expect(decoy.family).toBe(picked.question.family)
    }
  })

  it('only serves mild questions when the tone dial is mild', () => {
    for (let i = 0; i < 50; i++) {
      const picked = pickQuestion({ tone: 'mild', voterCount: 5, usedQuestionIds: [] })
      for (const q of picked.options) expect(q.tone).toBe('mild')
    }
  })

  it('recycles rather than crashing when every question has been used', () => {
    const allUsed = QUESTION_BANK.map((q) => q.id)
    const picked = pickQuestion({ tone: 'mild', voterCount: 5, usedQuestionIds: allUsed })
    expect(picked.options).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/games/hearsay/questions.test.ts`
Expected: FAIL, cannot resolve `./questions`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/games/hearsay/questions.ts
import type { Question, QuestionFamily } from './state'

/**
 * 20 seed questions across five families. Families exist so decoys can be
 * chosen coherently: that grouping is what makes the accused's guess a
 * deduction rather than a coin flip.
 *
 * Grow this with scripts/generate-questions.mjs.
 */
export const QUESTION_BANK: Question[] = [
  { id: 'c1', family: 'conflict', tone: 'mild', template: 'Who is {X} most likely to get into an argument with?' },
  { id: 'c2', family: 'conflict', tone: 'mild', template: 'Who would {X} refuse to share a hotel room with?' },
  { id: 'c3', family: 'conflict', tone: 'mild', template: 'Who does {X} always disagree with about food?' },
  { id: 'c4', family: 'conflict', tone: 'spicy', template: 'Who does {X} secretly find annoying?' },

  { id: 'a1', family: 'affection', tone: 'mild', template: 'Who would {X} go on a road trip with?' },
  { id: 'a2', family: 'affection', tone: 'mild', template: 'Who does {X} miss the most when the group is apart?' },
  { id: 'a3', family: 'affection', tone: 'mild', template: 'Who would {X} want on their team for anything at all?' },
  { id: 'a4', family: 'affection', tone: 'spicy', template: 'Who is {X} closest to and would never admit it?' },

  { id: 'x1', family: 'chaos', tone: 'mild', template: 'Who would {X} get lost in a new city with?' },
  { id: 'x2', family: 'chaos', tone: 'mild', template: 'Who would {X} accidentally get arrested with?' },
  { id: 'x3', family: 'chaos', tone: 'mild', template: 'Who would {X} start a terrible business with?' },
  { id: 'x4', family: 'chaos', tone: 'spicy', template: 'Who would {X} do something they both regret with?' },

  { id: 't1', family: 'trust', tone: 'mild', template: 'Who would {X} call at 3am in an actual emergency?' },
  { id: 't2', family: 'trust', tone: 'mild', template: 'Who would {X} trust with their unlocked phone?' },
  { id: 't3', family: 'trust', tone: 'mild', template: 'Who would {X} lend a large amount of money to?' },
  { id: 't4', family: 'trust', tone: 'mild', template: 'Who would {X} want handling things if they were in trouble?' },

  { id: 's1', family: 'secrets', tone: 'mild', template: 'Who knows the most embarrassing story about {X}?' },
  { id: 's2', family: 'secrets', tone: 'mild', template: 'Who would {X} tell something they told nobody else?' },
  { id: 's3', family: 'secrets', tone: 'mild', template: 'Who would find out first if {X} was lying?' },
  { id: 's4', family: 'secrets', tone: 'mild', template: 'Who does {X} tell things to before anyone else?' },
  { id: 's5', family: 'secrets', tone: 'spicy', template: 'Who has {X} definitely talked about behind their back?' },
  { id: 's6', family: 'secrets', tone: 'spicy', template: 'Who would be least surprised by {X} at their worst?' },
]

// Mild counts per family: conflict 3, affection 3, chaos 3, trust 4, secrets 4.
// Every family needs at least 3 mild entries, otherwise a mild room cannot be
// served two same-family decoys and pickQuestion silently falls back to
// another family. Keep that invariant when growing the bank.

export function renderQuestion(question: Question, accusedName: string): string {
  return question.template.replaceAll('{X}', accusedName)
}

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function pickOne<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

/** Below this many voters the tally is too thin to separate similar questions. */
const THIN_EVIDENCE_VOTERS = 4

export type PickArgs = {
  tone: 'mild' | 'spicy'
  voterCount: number
  usedQuestionIds: readonly string[]
}

export type Picked = { question: Question; options: Question[] }

export function pickQuestion({ tone, voterCount, usedQuestionIds }: PickArgs): Picked {
  // A mild room never sees spicy questions. A spicy room sees everything.
  const allowed = QUESTION_BANK.filter((q) => (tone === 'mild' ? q.tone === 'mild' : true))

  const unused = allowed.filter((q) => !usedQuestionIds.includes(q.id))
  const pool = unused.length > 0 ? unused : allowed

  const question = pickOne(pool)

  const sameFamily = allowed.filter((q) => q.family === question.family && q.id !== question.id)
  const otherFamilies = allowed.filter((q) => q.family !== question.family)

  // Thin evidence: decoys from other families, so the vote pattern actually
  // separates them. Rich evidence: same-family decoys, which is much harder.
  const preferred = voterCount < THIN_EVIDENCE_VOTERS ? otherFamilies : sameFamily
  const fallback = voterCount < THIN_EVIDENCE_VOTERS ? sameFamily : otherFamilies

  const decoys = [...shuffled(preferred), ...shuffled(fallback)].slice(0, 2)

  return { question, options: shuffled([question, ...decoys]) }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/games/hearsay/questions.test.ts`
Expected: PASS, 10 tests.

Note: the "few voters" test uses `voterCount: 3`, which is a four player game. The "many voters" test uses `voterCount: 8`. `THIN_EVIDENCE_VOTERS` is 4, so 3 takes the other-family branch and 8 takes the same-family branch. Each family has at least 2 other members, so the preferred pool always has 2 candidates and the fallback is never reached in these tests.

- [ ] **Step 5: Commit**

```bash
git add lib/games/hearsay/questions.ts lib/games/hearsay/questions.test.ts
git commit -m "feat: hearsay question bank with family-aware decoys"
```

---

## Task 10: Scoring

**Files:**
- Create: `lib/games/hearsay/scoring.ts`
- Test: `lib/games/hearsay/scoring.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Round } from './state'
import { scoreRound, topVoted } from './scoring'

const question = { id: 'real', template: 'Who is {X} most likely to fight?', family: 'conflict' as const, tone: 'mild' as const }
const decoy = { id: 'decoy', template: 'Who would {X} road trip with?', family: 'affection' as const, tone: 'mild' as const }

function round(overrides: Partial<Round> = {}): Round {
  return {
    accusedId: 'sam',
    question,
    options: [question, decoy],
    votes: { mike: 'ron', ron: 'ron', emily: 'sam' },
    predictions: { mike: true, ron: true, emily: false },
    accusedPick: 'real',
    awarded: {},
    ...overrides,
  }
}

describe('topVoted', () => {
  it('returns the single most voted player', () => {
    expect(topVoted(round().votes)).toEqual(['ron'])
  })

  it('returns everyone tied at the top', () => {
    expect(topVoted({ mike: 'ron', ron: 'emily', emily: 'mike' }).sort()).toEqual(['emily', 'mike', 'ron'])
  })

  it('returns nothing when nobody voted', () => {
    expect(topVoted({})).toEqual([])
  })
})

describe('scoreRound', () => {
  it('pays the accused for identifying the real question', () => {
    expect(scoreRound(round(), DEFAULT_CONFIG).sam).toBe(1000)
  })

  it('pays nothing to the accused for a wrong pick', () => {
    const scores = scoreRound(round({ accusedPick: 'decoy' }), DEFAULT_CONFIG)
    expect(scores.sam ?? 0).toBe(0)
  })

  it('pays nothing to the accused who ran out of time', () => {
    const scores = scoreRound(round({ accusedPick: null }), DEFAULT_CONFIG)
    expect(scores.sam ?? 0).toBe(0)
  })

  it('pays voters who matched the room', () => {
    const scores = scoreRound(round(), DEFAULT_CONFIG)
    expect(scores.mike).toBe(500)
    expect(scores.ron).toBe(500)
  })

  it('pays nothing to a voter who did not match the room', () => {
    expect(scoreRound(round(), DEFAULT_CONFIG).emily ?? 0).toBe(0)
  })

  it('withholds room points when the accused is wrong, by default', () => {
    const scores = scoreRound(round({ accusedPick: 'decoy' }), DEFAULT_CONFIG)
    expect(scores.mike ?? 0).toBe(0)
    expect(scores.ron ?? 0).toBe(0)
  })

  it('pays room points independently when the flag is off', () => {
    const config = {
      ...DEFAULT_CONFIG,
      scoring: { ...DEFAULT_CONFIG.scoring, readTheRoomRequiresAccusedCorrect: false },
    }
    const scores = scoreRound(round({ accusedPick: 'decoy' }), config)
    expect(scores.mike).toBe(500)
    expect(scores.ron).toBe(500)
  })

  it('pays everyone when the vote is a three way tie, because nobody was wrong', () => {
    const scores = scoreRound(round({ votes: { mike: 'ron', ron: 'emily', emily: 'mike' } }), DEFAULT_CONFIG)
    expect(scores.mike).toBe(500)
    expect(scores.ron).toBe(500)
    expect(scores.emily).toBe(500)
  })

  it('pays no room points at all when readTheRoom is zero', () => {
    const config = { ...DEFAULT_CONFIG, scoring: { ...DEFAULT_CONFIG.scoring, readTheRoom: 0 } }
    const scores = scoreRound(round(), config)
    expect(scores.mike ?? 0).toBe(0)
    expect(scores.sam).toBe(1000)
  })

  it('never pays the accused for their own round twice', () => {
    const scores = scoreRound(round({ votes: { mike: 'sam', ron: 'sam', emily: 'sam' } }), DEFAULT_CONFIG)
    expect(scores.sam).toBe(1000)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/games/hearsay/scoring.test.ts`
Expected: FAIL, cannot resolve `./scoring`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/games/hearsay/scoring.ts
import type { PlayerId } from '@/lib/types'
import type { HearsayConfig, Round } from './state'

/**
 * Everyone tied at the top counts. A flat spread means the room had no
 * consensus, so nobody was wrong. Note this is consensus, not truth:
 * the game has no ground truth and the UI must never call it correct.
 */
export function topVoted(votes: Record<PlayerId, PlayerId>): PlayerId[] {
  const counts = new Map<PlayerId, number>()
  for (const target of Object.values(votes)) {
    counts.set(target, (counts.get(target) ?? 0) + 1)
  }
  if (counts.size === 0) return []

  const max = Math.max(...counts.values())
  return [...counts.entries()].filter(([, n]) => n === max).map(([id]) => id)
}

export function voteCounts(votes: Record<PlayerId, PlayerId>): Record<PlayerId, number> {
  const counts: Record<PlayerId, number> = {}
  for (const target of Object.values(votes)) {
    counts[target] = (counts[target] ?? 0) + 1
  }
  return counts
}

export function scoreRound(round: Round, config: HearsayConfig): Record<PlayerId, number> {
  const { accusedCorrect, readTheRoom, readTheRoomRequiresAccusedCorrect } = config.scoring
  const awarded: Record<PlayerId, number> = {}

  const gotItRight = round.accusedPick !== null && round.accusedPick === round.question.id
  if (gotItRight) awarded[round.accusedId] = accusedCorrect

  const roomScores = readTheRoom > 0 && (gotItRight || !readTheRoomRequiresAccusedCorrect)
  if (!roomScores) return awarded

  const top = topVoted(round.votes)
  for (const [voterId, targetId] of Object.entries(round.votes)) {
    if (top.includes(targetId)) {
      awarded[voterId] = (awarded[voterId] ?? 0) + readTheRoom
    }
  }

  return awarded
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/games/hearsay/scoring.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/games/hearsay/scoring.ts lib/games/hearsay/scoring.test.ts
git commit -m "feat: hearsay scoring with configurable read-the-room reward"
```

---

## Task 11: The phase reducer

**Files:**
- Create: `lib/games/hearsay/reduce.ts`
- Test: `lib/games/hearsay/reduce.test.ts`

Phase machine:

| Phase | Advances when | Next |
|---|---|---|
| `charge` | deadline | `testimony` |
| `testimony` | every voter has voted, or deadline | `evidence` |
| `evidence` | deadline | `guess` |
| `guess` | accused picked and every voter predicted, or deadline | `verdict` (scores applied here) |
| `verdict` | deadline | `scoreboard` |
| `scoreboard` | deadline | next round's `charge`, or `ended` |

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import type { Player } from '@/lib/types'
import { initHearsay, reduceHearsay } from './reduce'
import { DEFAULT_CONFIG } from './state'

const players: Player[] = [
  { id: 'sam', name: 'Sam', color: '#ef4444', connected: true },
  { id: 'mike', name: 'Mike', color: '#22c55e', connected: true },
  { id: 'ron', name: 'Ron', color: '#3b82f6', connected: true },
  { id: 'emily', name: 'Emily', color: '#eab308', connected: true },
]

/** Force a known accused so tests do not depend on the shuffle. */
function stateWithAccused(accused: string) {
  const base = initHearsay(players)
  return {
    ...base,
    order: base.order.map(() => accused),
    // The round was built from the shuffled order, so it must be rewritten too.
    rounds: [{ ...base.rounds[0], accusedId: accused }],
  }
}

describe('initHearsay', () => {
  it('starts in the charge phase of round zero', () => {
    const state = initHearsay(players)
    expect(state.phase).toBe('charge')
    expect(state.roundIndex).toBe(0)
  })

  it('gives four players eight rounds', () => {
    expect(initHearsay(players).order).toHaveLength(8)
  })

  it('starts everyone on zero', () => {
    const state = initHearsay(players)
    expect(Object.values(state.scores)).toEqual([0, 0, 0, 0])
  })

  it('prepares the first round with three options', () => {
    const state = initHearsay(players)
    expect(state.rounds[0].options).toHaveLength(3)
    expect(state.rounds[0].accusedPick).toBeNull()
  })
})

describe('charge phase', () => {
  it('moves to testimony on the deadline', () => {
    const state = stateWithAccused('sam')
    expect(reduceHearsay(state, { type: 'deadline' }).state.phase).toBe('testimony')
  })

  it('asks the runtime for a timer sized to the phase', () => {
    const state = stateWithAccused('sam')
    const { commands } = reduceHearsay(state, { type: 'deadline' })
    expect(commands).toContainEqual({ kind: 'timer', ms: DEFAULT_CONFIG.durations.testimony })
  })
})

describe('testimony phase', () => {
  function inTestimony() {
    return reduceHearsay(stateWithAccused('sam'), { type: 'deadline' }).state
  }

  it('records a vote', () => {
    const next = reduceHearsay(inTestimony(), {
      type: 'input',
      playerId: 'mike',
      payload: { kind: 'vote', targetId: 'ron' },
    }).state
    expect(next.rounds[0].votes.mike).toBe('ron')
  })

  it('ignores a vote from the accused', () => {
    const next = reduceHearsay(inTestimony(), {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'vote', targetId: 'ron' },
    }).state
    expect(next.rounds[0].votes.sam).toBeUndefined()
  })

  it('lets a voter change their mind before the phase ends', () => {
    let state = inTestimony()
    state = reduceHearsay(state, { type: 'input', playerId: 'mike', payload: { kind: 'vote', targetId: 'ron' } }).state
    state = reduceHearsay(state, { type: 'input', playerId: 'mike', payload: { kind: 'vote', targetId: 'emily' } }).state
    expect(state.rounds[0].votes.mike).toBe('emily')
  })

  it('advances early once every voter has voted', () => {
    let state = inTestimony()
    for (const id of ['mike', 'ron']) {
      state = reduceHearsay(state, { type: 'input', playerId: id, payload: { kind: 'vote', targetId: 'ron' } }).state
      expect(state.phase).toBe('testimony')
    }
    state = reduceHearsay(state, { type: 'input', playerId: 'emily', payload: { kind: 'vote', targetId: 'sam' } }).state
    expect(state.phase).toBe('evidence')
  })

  it('advances on the deadline even with missing votes', () => {
    expect(reduceHearsay(inTestimony(), { type: 'deadline' }).state.phase).toBe('evidence')
  })
})

describe('guess phase', () => {
  function inGuess() {
    let state = reduceHearsay(stateWithAccused('sam'), { type: 'deadline' }).state // testimony
    state = reduceHearsay(state, { type: 'input', playerId: 'mike', payload: { kind: 'vote', targetId: 'ron' } }).state
    state = reduceHearsay(state, { type: 'input', playerId: 'ron', payload: { kind: 'vote', targetId: 'ron' } }).state
    state = reduceHearsay(state, { type: 'input', playerId: 'emily', payload: { kind: 'vote', targetId: 'sam' } }).state
    return reduceHearsay(state, { type: 'deadline' }).state // evidence -> guess
  }

  it('is reached after evidence', () => {
    expect(inGuess().phase).toBe('guess')
  })

  it('records the accused pick', () => {
    const state = inGuess()
    const next = reduceHearsay(state, {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'guess', questionId: state.rounds[0].options[0].id },
    }).state
    expect(next.rounds[0].accusedPick).toBe(state.rounds[0].options[0].id)
  })

  it('ignores a guess from anyone who is not the accused', () => {
    const state = inGuess()
    const next = reduceHearsay(state, {
      type: 'input',
      playerId: 'mike',
      payload: { kind: 'guess', questionId: state.rounds[0].options[0].id },
    }).state
    expect(next.rounds[0].accusedPick).toBeNull()
  })

  it('records crowd predictions', () => {
    const next = reduceHearsay(inGuess(), {
      type: 'input',
      playerId: 'mike',
      payload: { kind: 'predict', willGetIt: true },
    }).state
    expect(next.rounds[0].predictions.mike).toBe(true)
  })

  it('waits for the crowd even after the accused has answered', () => {
    const state = inGuess()
    const next = reduceHearsay(state, {
      type: 'input',
      playerId: 'sam',
      payload: { kind: 'guess', questionId: state.rounds[0].question.id },
    }).state
    expect(next.phase).toBe('guess')
  })

  it('advances to verdict once the accused and every voter has answered', () => {
    let state = inGuess()
    state = reduceHearsay(state, { type: 'input', playerId: 'sam', payload: { kind: 'guess', questionId: state.rounds[0].question.id } }).state
    for (const id of ['mike', 'ron', 'emily']) {
      state = reduceHearsay(state, { type: 'input', playerId: id, payload: { kind: 'predict', willGetIt: true } }).state
    }
    expect(state.phase).toBe('verdict')
  })

  it('applies scores when entering verdict', () => {
    let state = inGuess()
    state = reduceHearsay(state, { type: 'input', playerId: 'sam', payload: { kind: 'guess', questionId: state.rounds[0].question.id } }).state
    state = reduceHearsay(state, { type: 'deadline' }).state
    expect(state.phase).toBe('verdict')
    expect(state.scores.sam).toBe(1000)
    expect(state.scores.mike).toBe(500)
    expect(state.scores.ron).toBe(500)
    expect(state.scores.emily).toBe(0)
    expect(state.rounds[0].awarded.sam).toBe(1000)
  })

  it('scores a timed out accused as wrong', () => {
    const state = reduceHearsay(inGuess(), { type: 'deadline' }).state
    expect(state.scores.sam).toBe(0)
  })
})

describe('round transitions', () => {
  function throughOneRound() {
    let state = reduceHearsay(stateWithAccused('sam'), { type: 'deadline' }).state // testimony
    state = reduceHearsay(state, { type: 'deadline' }).state // evidence
    state = reduceHearsay(state, { type: 'deadline' }).state // guess
    state = reduceHearsay(state, { type: 'deadline' }).state // verdict
    return reduceHearsay(state, { type: 'deadline' }).state // scoreboard
  }

  it('reaches the scoreboard', () => {
    expect(throughOneRound().phase).toBe('scoreboard')
  })

  it('starts the next round at charge with a fresh question', () => {
    const state = reduceHearsay(throughOneRound(), { type: 'deadline' }).state
    expect(state.phase).toBe('charge')
    expect(state.roundIndex).toBe(1)
    expect(state.rounds[1].options).toHaveLength(3)
    expect(state.usedQuestionIds).toContain(state.rounds[0].question.id)
  })

  it('never repeats a question across rounds', () => {
    let state = initHearsay(players)
    const seen: string[] = []
    while (state.phase !== 'ended') {
      if (state.phase === 'charge') seen.push(state.rounds[state.roundIndex].question.id)
      state = reduceHearsay(state, { type: 'deadline' }).state
    }
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('ends after the last round', () => {
    let state = initHearsay(players)
    let guard = 0
    while (state.phase !== 'ended' && guard++ < 500) {
      state = reduceHearsay(state, { type: 'deadline' }).state
    }
    expect(state.phase).toBe('ended')
    expect(state.roundIndex).toBe(7)
  })

  it('lets the host skip a phase manually', () => {
    const state = reduceHearsay(stateWithAccused('sam'), { type: 'hostAdvance' }).state
    expect(state.phase).toBe('testimony')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/games/hearsay/reduce.test.ts`
Expected: FAIL, cannot resolve `./reduce`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/games/hearsay/reduce.ts
import type { Command, GameEvent, Player, PlayerId, Reduced } from '@/lib/types'
import { pickQuestion } from './questions'
import { scoreRound } from './scoring'
import { buildAccusedOrder } from './rounds'
import {
  DEFAULT_CONFIG,
  type HearsayConfig,
  type HearsayInput,
  type HearsayState,
  type Phase,
  type Round,
} from './state'

function makeRound(
  accusedId: PlayerId,
  playerCount: number,
  config: HearsayConfig,
  usedQuestionIds: readonly string[]
): Round {
  const { question, options } = pickQuestion({
    tone: config.tone,
    voterCount: playerCount - 1,
    usedQuestionIds,
  })
  return { accusedId, question, options, votes: {}, predictions: {}, accusedPick: null, awarded: {} }
}

export function initHearsay(players: Player[], config: HearsayConfig = DEFAULT_CONFIG): HearsayState {
  const order = buildAccusedOrder(players.map((p) => p.id), config.minRounds)
  const scores: Record<PlayerId, number> = {}
  for (const p of players) scores[p.id] = 0

  return {
    phase: 'charge',
    players,
    config,
    order,
    roundIndex: 0,
    rounds: [makeRound(order[0], players.length, config, [])],
    scores,
    usedQuestionIds: [],
  }
}

const timer = (state: HearsayState, phase: Exclude<Phase, 'ended'>): Command => ({
  kind: 'timer',
  ms: state.config.durations[phase],
})

/** Replace the current round in place, leaving everything else alone. */
function withRound(state: HearsayState, round: Round): HearsayState {
  const rounds = [...state.rounds]
  rounds[state.roundIndex] = round
  return { ...state, rounds }
}

function enterVerdict(state: HearsayState): Reduced<HearsayState> {
  const round = state.rounds[state.roundIndex]
  const awarded = scoreRound(round, state.config)

  const scores = { ...state.scores }
  for (const [playerId, points] of Object.entries(awarded)) {
    scores[playerId] = (scores[playerId] ?? 0) + points
  }

  const scored = withRound({ ...state, scores }, { ...round, awarded })
  return {
    state: { ...scored, phase: 'verdict' },
    commands: [timer(state, 'verdict'), { kind: 'sound', name: 'verdict' }],
  }
}

function nextRound(state: HearsayState): Reduced<HearsayState> {
  const round = state.rounds[state.roundIndex]
  const usedQuestionIds = [...state.usedQuestionIds, round.question.id]

  const nextIndex = state.roundIndex + 1
  if (nextIndex >= state.order.length) {
    return { state: { ...state, usedQuestionIds, phase: 'ended' }, commands: [{ kind: 'sound', name: 'ended' }] }
  }

  return {
    state: {
      ...state,
      usedQuestionIds,
      roundIndex: nextIndex,
      phase: 'charge',
      rounds: [
        ...state.rounds,
        makeRound(state.order[nextIndex], state.players.length, state.config, usedQuestionIds),
      ],
    },
    commands: [timer(state, 'charge')],
  }
}

function advance(state: HearsayState): Reduced<HearsayState> {
  switch (state.phase) {
    case 'charge':
      return { state: { ...state, phase: 'testimony' }, commands: [timer(state, 'testimony')] }
    case 'testimony':
      return { state: { ...state, phase: 'evidence' }, commands: [timer(state, 'evidence'), { kind: 'sound', name: 'evidence' }] }
    case 'evidence':
      return { state: { ...state, phase: 'guess' }, commands: [timer(state, 'guess')] }
    case 'guess':
      return enterVerdict(state)
    case 'verdict':
      return { state: { ...state, phase: 'scoreboard' }, commands: [timer(state, 'scoreboard')] }
    case 'scoreboard':
      return nextRound(state)
    case 'ended':
      return { state }
  }
}

function applyInput(state: HearsayState, playerId: PlayerId, input: HearsayInput): Reduced<HearsayState> {
  const round = state.rounds[state.roundIndex]
  const isAccused = playerId === round.accusedId
  const voterIds = state.players.filter((p) => p.id !== round.accusedId).map((p) => p.id)

  if (state.phase === 'testimony' && input.kind === 'vote') {
    if (isAccused) return { state }

    const votes = { ...round.votes, [playerId]: input.targetId }
    const updated = withRound(state, { ...round, votes })
    const everyoneVoted = voterIds.every((id) => votes[id] !== undefined)
    return everyoneVoted ? advance(updated) : { state: updated }
  }

  if (state.phase === 'guess') {
    let updated = state

    if (input.kind === 'guess') {
      if (!isAccused) return { state }
      updated = withRound(state, { ...round, accusedPick: input.questionId })
    } else if (input.kind === 'predict') {
      if (isAccused) return { state }
      updated = withRound(state, { ...round, predictions: { ...round.predictions, [playerId]: input.willGetIt } })
    } else {
      return { state }
    }

    const current = updated.rounds[updated.roundIndex]
    const done = current.accusedPick !== null && voterIds.every((id) => current.predictions[id] !== undefined)
    return done ? enterVerdict(updated) : { state: updated }
  }

  return { state }
}

export function reduceHearsay(
  state: HearsayState,
  event: GameEvent<HearsayInput>
): Reduced<HearsayState> {
  switch (event.type) {
    case 'deadline':
    case 'hostAdvance':
      return advance(state)
    case 'input':
      return applyInput(state, event.playerId, event.payload)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/games/hearsay/reduce.test.ts`
Expected: PASS, 22 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, all files.

- [ ] **Step 6: Commit**

```bash
git add lib/games/hearsay/reduce.ts lib/games/hearsay/reduce.test.ts
git commit -m "feat: hearsay phase machine"
```

---

## Task 12: Host and player views

The two view functions are the security boundary: `hostView` output is broadcast publicly, `playerView` output goes only to one phone. The charge must never appear in a host view during `charge`, `testimony`, `evidence` or `guess`.

**Files:**
- Create: `lib/games/hearsay/views.ts`
- Test: `lib/games/hearsay/views.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import type { Player } from '@/lib/types'
import { initHearsay, reduceHearsay } from './reduce'
import { hearsayHostView, hearsayPlayerView } from './views'

const players: Player[] = [
  { id: 'sam', name: 'Sam', color: '#ef4444', connected: true },
  { id: 'mike', name: 'Mike', color: '#22c55e', connected: true },
  { id: 'ron', name: 'Ron', color: '#3b82f6', connected: true },
  { id: 'emily', name: 'Emily', color: '#eab308', connected: true },
]

function stateWithAccused(accused: string) {
  const base = initHearsay(players)
  return {
    ...base,
    order: base.order.map(() => accused),
    rounds: [{ ...base.rounds[0], accusedId: accused }],
  }
}

describe('hearsayHostView', () => {
  it('never leaks the question before the verdict', () => {
    let state = stateWithAccused('sam')
    for (const phase of ['charge', 'testimony', 'evidence', 'guess'] as const) {
      expect(state.phase).toBe(phase)
      expect(hearsayHostView(state).question).toBeNull()
      state = reduceHearsay(state, { type: 'deadline' }).state
    }
  })

  it('reveals the question at the verdict', () => {
    let state = stateWithAccused('sam')
    for (let i = 0; i < 4; i++) state = reduceHearsay(state, { type: 'deadline' }).state
    expect(state.phase).toBe('verdict')
    expect(hearsayHostView(state).question).toContain('Sam')
  })

  it('hides who cast each vote during evidence', () => {
    let state = stateWithAccused('sam')
    state = reduceHearsay(state, { type: 'deadline' }).state
    state = reduceHearsay(state, { type: 'input', playerId: 'mike', payload: { kind: 'vote', targetId: 'ron' } }).state
    state = reduceHearsay(state, { type: 'deadline' }).state
    expect(state.phase).toBe('evidence')

    const view = hearsayHostView(state)
    expect(view.voteCounts.ron).toBe(1)
    expect(view.voters).toBeNull()
  })

  it('attaches faces to votes at the verdict', () => {
    let state = stateWithAccused('sam')
    state = reduceHearsay(state, { type: 'deadline' }).state
    state = reduceHearsay(state, { type: 'input', playerId: 'mike', payload: { kind: 'vote', targetId: 'ron' } }).state
    for (let i = 0; i < 3; i++) state = reduceHearsay(state, { type: 'deadline' }).state
    expect(state.phase).toBe('verdict')
    expect(hearsayHostView(state).voters).toEqual({ mike: 'ron' })
  })
})

describe('hearsayPlayerView', () => {
  it('shows the charge to voters', () => {
    const state = stateWithAccused('sam')
    expect(hearsayPlayerView(state, 'mike').charge).toContain('Sam')
  })

  it('never shows the charge to the accused', () => {
    const state = stateWithAccused('sam')
    expect(hearsayPlayerView(state, 'sam').charge).toBeNull()
  })

  it('gives the accused their three options only in the guess phase', () => {
    let state = stateWithAccused('sam')
    expect(hearsayPlayerView(state, 'sam').options).toBeNull()
    for (let i = 0; i < 3; i++) state = reduceHearsay(state, { type: 'deadline' }).state
    expect(state.phase).toBe('guess')
    expect(hearsayPlayerView(state, 'sam').options).toHaveLength(3)
  })

  it('never gives the options to a voter', () => {
    let state = stateWithAccused('sam')
    for (let i = 0; i < 3; i++) state = reduceHearsay(state, { type: 'deadline' }).state
    expect(hearsayPlayerView(state, 'mike').options).toBeNull()
  })

  it('tells each player what action they owe right now', () => {
    let state = stateWithAccused('sam')
    expect(hearsayPlayerView(state, 'sam').action).toBe('wait')
    expect(hearsayPlayerView(state, 'mike').action).toBe('wait')

    state = reduceHearsay(state, { type: 'deadline' }).state
    expect(hearsayPlayerView(state, 'mike').action).toBe('vote')
    expect(hearsayPlayerView(state, 'sam').action).toBe('wait')

    state = reduceHearsay(state, { type: 'deadline' }).state
    state = reduceHearsay(state, { type: 'deadline' }).state
    expect(hearsayPlayerView(state, 'sam').action).toBe('guess')
    expect(hearsayPlayerView(state, 'mike').action).toBe('predict')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/games/hearsay/views.test.ts`
Expected: FAIL, cannot resolve `./views`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/games/hearsay/views.ts
import type { Player, PlayerId } from '@/lib/types'
import { renderQuestion } from './questions'
import { topVoted, voteCounts } from './scoring'
import type { HearsayState, Phase } from './state'

export type HearsayHostView = {
  phase: Phase
  players: Player[]
  accusedId: PlayerId
  accusedName: string
  roundNumber: number
  totalRounds: number
  /** Null until the verdict. The accused is looking at this screen. */
  question: string | null
  voteCounts: Record<PlayerId, number>
  /** Null until the verdict: the tally shows counts, never who cast them. */
  voters: Record<PlayerId, PlayerId> | null
  topVoted: PlayerId[]
  crowdPredictions: { yes: number; no: number }
  accusedPickedCorrectly: boolean | null
  awarded: Record<PlayerId, number>
  scores: Record<PlayerId, number>
}

export type HearsayPlayerView = {
  phase: Phase
  action: 'vote' | 'predict' | 'guess' | 'wait'
  isAccused: boolean
  accusedName: string
  /** The question, for voters only, never for the accused. */
  charge: string | null
  /** The three candidate questions, for the accused only, during guess. */
  options: { id: string; text: string }[] | null
  targets: Player[]
  myVote: PlayerId | null
  myPrediction: boolean | null
  myPick: string | null
  myScore: number
}

export function hearsayHostView(state: HearsayState): HearsayHostView {
  const round = state.rounds[state.roundIndex]
  const accused = state.players.find((p) => p.id === round.accusedId)!
  const revealed = state.phase === 'verdict' || state.phase === 'scoreboard' || state.phase === 'ended'

  const predictions = Object.values(round.predictions)

  return {
    phase: state.phase,
    players: state.players,
    accusedId: round.accusedId,
    accusedName: accused.name,
    roundNumber: state.roundIndex + 1,
    totalRounds: state.order.length,
    question: revealed ? renderQuestion(round.question, accused.name) : null,
    voteCounts: voteCounts(round.votes),
    voters: revealed ? round.votes : null,
    topVoted: topVoted(round.votes),
    crowdPredictions: {
      yes: predictions.filter(Boolean).length,
      no: predictions.filter((p) => !p).length,
    },
    accusedPickedCorrectly: revealed ? round.accusedPick === round.question.id : null,
    awarded: round.awarded,
    scores: state.scores,
  }
}

export function hearsayPlayerView(state: HearsayState, playerId: PlayerId): HearsayPlayerView {
  const round = state.rounds[state.roundIndex]
  const accused = state.players.find((p) => p.id === round.accusedId)!
  const isAccused = playerId === round.accusedId

  let action: HearsayPlayerView['action'] = 'wait'
  if (state.phase === 'testimony' && !isAccused) action = 'vote'
  if (state.phase === 'guess') action = isAccused ? 'guess' : 'predict'

  const showCharge =
    !isAccused && (state.phase === 'charge' || state.phase === 'testimony' || state.phase === 'evidence' || state.phase === 'guess')

  return {
    phase: state.phase,
    action,
    isAccused,
    accusedName: accused.name,
    charge: showCharge ? renderQuestion(round.question, accused.name) : null,
    options:
      isAccused && state.phase === 'guess'
        ? round.options.map((q) => ({ id: q.id, text: renderQuestion(q, accused.name) }))
        : null,
    targets: state.players,
    myVote: round.votes[playerId] ?? null,
    myPrediction: round.predictions[playerId] ?? null,
    myPick: isAccused ? round.accusedPick : null,
    myScore: state.scores[playerId] ?? 0,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/games/hearsay/views.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/games/hearsay/views.ts lib/games/hearsay/views.test.ts
git commit -m "feat: hearsay host and player views with charge kept off the shared screen"
```

---

## Task 13: Host runtime

Drives a game module: owns the clock, applies events, broadcasts public state on the public channel and per-player state on each private channel, snapshots to localStorage.

**Files:**
- Create: `lib/runtime/protocol.ts`
- Create: `lib/runtime/hostRuntime.ts`

- [ ] **Step 1: Write the protocol types**

```ts
// lib/runtime/protocol.ts
import type { Player, PlayerId } from '@/lib/types'

/** Phone to host, on the public channel. */
export type ToHost =
  | { t: 'join'; playerId: PlayerId; name: string }
  | { t: 'rejoin'; playerId: PlayerId }
  | { t: 'input'; playerId: PlayerId; payload: unknown }

/** Host to everyone, on the public channel. */
export type ToRoom =
  | { t: 'lobby'; players: Player[]; code: string }
  | { t: 'host'; gameId: string; view: unknown; deadline: number | null }
  | { t: 'ended' }

/** Host to one phone, on that phone's private channel. */
export type ToPlayer =
  | { t: 'accepted'; player: Player }
  | { t: 'you'; gameId: string; view: unknown; deadline: number | null }
```

- [ ] **Step 2: Write the host runtime**

```ts
// lib/runtime/hostRuntime.ts
'use client'

import { createBus, type Bus } from '@/lib/bus/client'
import { privateChannel, publicChannel } from '@/lib/bus/channels'
import { PLAYER_COLORS, type GameModule, type Player, type PlayerId } from '@/lib/types'
import type { ToHost, ToPlayer, ToRoom } from './protocol'

type AnyGame = GameModule<unknown, unknown, unknown, unknown>

export type HostRuntime = {
  start(game: AnyGame): void
  advance(): void
  destroy(): void
}

export type HostCallbacks = {
  onPlayers(players: Player[]): void
  onView(view: unknown, deadline: number | null): void
  onGame(game: AnyGame | null): void
  onSound(name: string): void
}

const SNAPSHOT_KEY = (code: string) => `ruckus:host:${code}`

export function createHostRuntime(code: string, cb: HostCallbacks): HostRuntime {
  const bus: Bus = createBus()

  let players: Player[] = []
  let game: AnyGame | null = null
  let state: unknown = null
  let deadline: number | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function snapshot() {
    try {
      localStorage.setItem(SNAPSHOT_KEY(code), JSON.stringify({ players, gameId: game?.id ?? null, state }))
    } catch {
      // Private browsing or a full quota. A lost snapshot is survivable.
    }
  }

  function broadcast() {
    if (!game) {
      bus.publish(publicChannel(code), { t: 'lobby', players, code } satisfies ToRoom)
      return
    }
    bus.publish(publicChannel(code), {
      t: 'host',
      gameId: game.id,
      view: game.hostView(state),
      deadline,
    } satisfies ToRoom)

    for (const player of players) {
      bus.publish(privateChannel(code, player.id), {
        t: 'you',
        gameId: game.id,
        view: game.playerView(state, player.id),
        deadline,
      } satisfies ToPlayer)
    }
  }

  function push() {
    cb.onPlayers(players)
    if (game) cb.onView(game.hostView(state), deadline)
    broadcast()
    snapshot()
  }

  function runCommands(commands: { kind: string; ms?: number; name?: string }[] = []) {
    for (const command of commands) {
      if (command.kind === 'timer' && typeof command.ms === 'number') {
        if (timer) clearTimeout(timer)
        deadline = Date.now() + command.ms
        timer = setTimeout(() => dispatch({ type: 'deadline' }), command.ms)
      }
      if (command.kind === 'sound' && command.name) cb.onSound(command.name)
    }
  }

  function dispatch(event: { type: 'deadline' } | { type: 'hostAdvance' } | { type: 'input'; playerId: PlayerId; payload: unknown }) {
    if (!game) return
    const result = game.reduce(state, event as never)
    state = result.state
    runCommands(result.commands as never)
    push()
  }

  bus.subscribe(publicChannel(code), (raw) => {
    const message = raw as ToHost

    if (message.t === 'join') {
      if (players.some((p) => p.id === message.playerId)) return
      if (game) return // no late joins mid-game

      const player: Player = {
        id: message.playerId,
        name: message.name.slice(0, 12),
        color: PLAYER_COLORS[players.length % PLAYER_COLORS.length],
        connected: true,
      }
      players = [...players, player]
      bus.publish(privateChannel(code, player.id), { t: 'accepted', player } satisfies ToPlayer)
      push()
      return
    }

    if (message.t === 'rejoin') {
      const player = players.find((p) => p.id === message.playerId)
      if (!player) return
      bus.publish(privateChannel(code, player.id), { t: 'accepted', player } satisfies ToPlayer)
      push()
      return
    }

    if (message.t === 'input') {
      dispatch({ type: 'input', playerId: message.playerId, payload: message.payload })
    }
  })

  push()

  return {
    start(nextGame) {
      game = nextGame
      state = nextGame.init(players)
      cb.onGame(nextGame)
      // The first phase needs its own timer, which init cannot request.
      runCommands([{ kind: 'timer', ms: 5000 }])
      push()
    },
    advance() {
      dispatch({ type: 'hostAdvance' })
    },
    destroy() {
      if (timer) clearTimeout(timer)
      bus.close()
    },
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/runtime/protocol.ts lib/runtime/hostRuntime.ts
git commit -m "feat: host runtime with timers, broadcast and snapshots"
```

---

## Task 14: Player client

**Files:**
- Create: `lib/runtime/playerClient.ts`

- [ ] **Step 1: Write the file**

```ts
// lib/runtime/playerClient.ts
'use client'

import { createBus, type Bus } from '@/lib/bus/client'
import { privateChannel, publicChannel } from '@/lib/bus/channels'
import { newPlayerId } from '@/lib/ids'
import type { Player } from '@/lib/types'
import type { ToHost, ToPlayer, ToRoom } from './protocol'

export type PlayerCallbacks = {
  onAccepted(player: Player): void
  onView(view: unknown, deadline: number | null): void
  onLobby(players: Player[]): void
  onStatus(status: 'connecting' | 'open' | 'closed'): void
}

export type PlayerClient = {
  join(name: string): void
  send(payload: unknown): void
  destroy(): void
  playerId: string
}

const IDENTITY_KEY = (code: string) => `ruckus:player:${code.toUpperCase()}`

function loadIdentity(code: string): { playerId: string; name: string } | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY(code))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function createPlayerClient(code: string, cb: PlayerCallbacks): PlayerClient {
  const bus: Bus = createBus()
  const saved = loadIdentity(code)
  const playerId = saved?.playerId ?? newPlayerId()

  bus.onStatus(cb.onStatus)

  bus.subscribe(privateChannel(code, playerId), (raw) => {
    const message = raw as ToPlayer
    if (message.t === 'accepted') cb.onAccepted(message.player)
    if (message.t === 'you') cb.onView(message.view, message.deadline)
  })

  bus.subscribe(publicChannel(code), (raw) => {
    const message = raw as ToRoom
    if (message.t === 'lobby') cb.onLobby(message.players)
  })

  // A phone that already has an identity re-announces itself, so a locked
  // screen or a Discord notification never ejects a player.
  if (saved) {
    bus.publish(publicChannel(code), { t: 'rejoin', playerId } satisfies ToHost)
  }

  return {
    playerId,

    join(name) {
      try {
        localStorage.setItem(IDENTITY_KEY(code), JSON.stringify({ playerId, name }))
      } catch {
        // Fine. They just cannot survive a refresh.
      }
      bus.publish(publicChannel(code), { t: 'join', playerId, name } satisfies ToHost)
    },

    send(payload) {
      bus.publish(publicChannel(code), { t: 'input', playerId, payload } satisfies ToHost)
    },

    destroy() {
      bus.close()
    },
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/runtime/playerClient.ts
git commit -m "feat: player client with identity persistence and rejoin"
```

---

## Task 15: Shared UI components

Everything here assumes a compressed Discord stream on the host and a thumb on a phone. Large type, hard contrast, no thin strokes.

**Files:**
- Create: `components/Countdown.tsx`
- Create: `components/PlayerChip.tsx`
- Create: `components/BigButton.tsx`
- Create: `components/QrCode.tsx`

- [ ] **Step 1: Write `components/Countdown.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'

/** Phones render from the deadline, so no per-tick messages cross the wire. */
export function Countdown({ deadline, className = '' }: { deadline: number | null; className?: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])

  if (deadline === null) return null

  const remaining = Math.max(0, deadline - now)
  const seconds = Math.ceil(remaining / 1000)
  const urgent = seconds <= 5

  return (
    <div className={`font-mono tabular-nums ${urgent ? 'text-red-500' : 'text-white'} ${className}`}>
      {seconds}
    </div>
  )
}
```

- [ ] **Step 2: Write `components/PlayerChip.tsx`**

```tsx
import type { Player } from '@/lib/types'

export function PlayerChip({ player, size = 'md' }: { player: Player; size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = { sm: 'h-8 w-8 text-sm', md: 'h-14 w-14 text-xl', lg: 'h-24 w-24 text-4xl' }[size]

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`${dimensions} grid place-items-center rounded-full font-black text-black ${player.connected ? '' : 'opacity-30'}`}
        style={{ backgroundColor: player.color }}
      >
        {player.name.slice(0, 2).toUpperCase()}
      </div>
      <span className="text-xs font-bold uppercase tracking-wide text-white/80">{player.name}</span>
    </div>
  )
}
```

- [ ] **Step 3: Write `components/BigButton.tsx`**

```tsx
'use client'

export function BigButton({
  children,
  onClick,
  selected = false,
  disabled = false,
}: {
  children: React.ReactNode
  onClick: () => void
  selected?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl border-4 px-5 py-6 text-left text-xl font-bold transition active:scale-[0.98] disabled:opacity-40 ${
        selected ? 'border-white bg-white text-black' : 'border-white/30 bg-white/5 text-white'
      }`}
    >
      {children}
    </button>
  )
}
```

- [ ] **Step 4: Write `components/QrCode.tsx`**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (ref.current) {
      QRCode.toCanvas(ref.current, value, { width: size, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
    }
  }, [value, size])

  return <canvas ref={ref} className="rounded-xl bg-white p-2" />
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/
git commit -m "feat: shared UI components for host and phone"
```

---

## Task 16: Hearsay host screen

**Files:**
- Create: `lib/games/hearsay/HostScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
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

        {(view.phase === 'verdict' || view.phase === 'scoreboard' || view.phase === 'ended') && (
          <>
            <p className="text-3xl font-bold uppercase tracking-widest text-white/50">The charge was</p>
            <p className="max-w-5xl text-7xl font-black leading-tight text-white">{view.question}</p>
            <VoteBar view={view} />
            <p className={`text-6xl font-black uppercase ${view.accusedPickedCorrectly ? 'text-green-400' : 'text-red-500'}`}>
              {view.accusedPickedCorrectly ? `${view.accusedName} knew it` : `${view.accusedName} had no idea`}
            </p>
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/games/hearsay/HostScreen.tsx
git commit -m "feat: hearsay host screen"
```

---

## Task 17: Hearsay player screen

**Files:**
- Create: `lib/games/hearsay/PlayerScreen.tsx`

- [ ] **Step 1: Write the file**

```tsx
'use client'

import { BigButton } from '@/components/BigButton'
import type { HearsayInput } from './state'
import type { HearsayPlayerView } from './views'

export function HearsayPlayerScreen({
  view,
  send,
}: {
  view: HearsayPlayerView
  send: (input: HearsayInput) => void
}) {
  if (view.isAccused && view.action === 'wait' && view.phase !== 'verdict' && view.phase !== 'scoreboard') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
        <p className="text-5xl font-black uppercase text-white">Look away</p>
        <p className="text-2xl font-bold text-white/60">They are talking about you.</p>
        <p className="text-xl font-bold text-yellow-400">Mute yourself.</p>
      </div>
    )
  }

  if (view.action === 'vote') {
    return (
      <div className="flex h-full flex-col gap-4 p-5">
        <p className="text-2xl font-bold leading-tight text-white">{view.charge}</p>
        <div className="flex flex-col gap-3 overflow-y-auto">
          {view.targets.map((player) => (
            <BigButton
              key={player.id}
              selected={view.myVote === player.id}
              onClick={() => send({ kind: 'vote', targetId: player.id })}
            >
              <span className="flex items-center gap-3">
                <span className="h-6 w-6 rounded-full" style={{ backgroundColor: player.color }} />
                {player.name}
              </span>
            </BigButton>
          ))}
        </div>
      </div>
    )
  }

  if (view.action === 'guess' && view.options) {
    return (
      <div className="flex h-full flex-col gap-4 p-5">
        <p className="text-2xl font-black uppercase text-white">What were they asked?</p>
        <div className="flex flex-col gap-3">
          {view.options.map((option) => (
            <BigButton
              key={option.id}
              selected={view.myPick === option.id}
              onClick={() => send({ kind: 'guess', questionId: option.id })}
            >
              {option.text}
            </BigButton>
          ))}
        </div>
      </div>
    )
  }

  if (view.action === 'predict') {
    return (
      <div className="flex h-full flex-col justify-center gap-4 p-5">
        <p className="text-3xl font-black uppercase text-white">Will {view.accusedName} work it out?</p>
        <div className="flex flex-col gap-3">
          <BigButton selected={view.myPrediction === true} onClick={() => send({ kind: 'predict', willGetIt: true })}>
            Yes
          </BigButton>
          <BigButton selected={view.myPrediction === false} onClick={() => send({ kind: 'predict', willGetIt: false })}>
            No
          </BigButton>
        </div>
        <p className="text-center text-sm font-bold uppercase tracking-widest text-white/40">
          No points. Just judgement.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-4xl font-black uppercase text-white">Watch the screen</p>
      <p className="text-6xl font-black tabular-nums text-white/80">{view.myScore}</p>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/games/hearsay/PlayerScreen.tsx
git commit -m "feat: hearsay phone screens"
```

---

## Task 18: Wire the game module and registry

**Files:**
- Create: `lib/games/hearsay/index.ts`
- Create: `lib/games/registry.ts`

- [ ] **Step 1: Write `lib/games/hearsay/index.ts`**

```ts
import type { GameModule } from '@/lib/types'
import { HearsayHostScreen } from './HostScreen'
import { HearsayPlayerScreen } from './PlayerScreen'
import { initHearsay, reduceHearsay } from './reduce'
import type { HearsayInput, HearsayState } from './state'
import { hearsayHostView, hearsayPlayerView, type HearsayHostView, type HearsayPlayerView } from './views'

export const hearsay: GameModule<HearsayState, HearsayInput, HearsayHostView, HearsayPlayerView> = {
  id: 'hearsay',
  name: 'Hearsay',
  tagline: 'The room testifies about you. You never hear the charge.',
  minPlayers: 4,
  maxPlayers: 12,
  init: (players) => initHearsay(players),
  reduce: reduceHearsay,
  hostView: hearsayHostView,
  playerView: hearsayPlayerView,
  HostScreen: HearsayHostScreen,
  PlayerScreen: HearsayPlayerScreen,
}
```

- [ ] **Step 2: Write `lib/games/registry.ts`**

```ts
import type { GameModule } from '@/lib/types'
import { hearsay } from './hearsay'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAMES: Record<string, GameModule<any, any, any, any>> = {
  hearsay,
}
```

- [ ] **Step 3: Typecheck and test**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/games/hearsay/index.ts lib/games/registry.ts
git commit -m "feat: register hearsay as a game module"
```

---

## Task 19: Landing page

**Files:**
- Modify: `app/page.tsx` (replace the Next.js starter entirely)
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Replace `app/globals.css`**

```css
@import 'tailwindcss';

html, body { height: 100%; background: #0a0a0f; color: white; }
body { overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }
```

- [ ] **Step 2: Replace `app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ruckus',
  description: 'Party games for people who know each other too well.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Replace `app/page.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function Landing() {
  const router = useRouter()
  const [code, setCode] = useState('')

  return (
    <main className="flex h-full flex-col items-center justify-center gap-10 p-8">
      <h1 className="text-7xl font-black uppercase tracking-tighter">Ruckus</h1>

      <form
        className="flex w-full max-w-sm flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim().length === 4) router.push(`/play/${code.trim().toUpperCase()}`)
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
          placeholder="CODE"
          autoCapitalize="characters"
          autoComplete="off"
          className="w-full rounded-2xl border-4 border-white/30 bg-white/5 py-6 text-center font-mono text-5xl font-black tracking-[0.3em]"
        />
        <button
          type="submit"
          disabled={code.trim().length !== 4}
          className="rounded-2xl bg-white py-5 text-2xl font-black uppercase text-black disabled:opacity-30"
        >
          Join
        </button>
      </form>

      <button
        onClick={() => router.push('/host')}
        className="text-lg font-bold uppercase tracking-widest text-white/40 underline"
      >
        Host a game on this screen
      </button>
    </main>
  )
}
```

- [ ] **Step 4: Verify it renders**

Run: `npm run dev`
Open `http://localhost:3000`.
Expected: the Ruckus landing page with a code field and a host link. No console errors.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/layout.tsx app/globals.css
git commit -m "feat: ruckus landing page"
```

---

## Task 20: Host page

**Files:**
- Create: `app/host/page.tsx`

- [ ] **Step 1: Write the file**

```tsx
'use client'

import { QrCode } from '@/components/QrCode'
import { Countdown } from '@/components/Countdown'
import { PlayerChip } from '@/components/PlayerChip'
import { GAMES } from '@/lib/games/registry'
import { newRoomCode } from '@/lib/ids'
import { createHostRuntime, type HostRuntime } from '@/lib/runtime/hostRuntime'
import type { GameModule, Player } from '@/lib/types'
import { useEffect, useRef, useState } from 'react'

export default function HostPage() {
  const [code] = useState(newRoomCode)
  const [players, setPlayers] = useState<Player[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [game, setGame] = useState<GameModule<any, any, any, any> | null>(null)
  const [view, setView] = useState<unknown>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const runtime = useRef<HostRuntime | null>(null)

  useEffect(() => {
    const rt = createHostRuntime(code, {
      onPlayers: setPlayers,
      onView: (nextView, nextDeadline) => {
        setView(nextView)
        setDeadline(nextDeadline)
      },
      onGame: setGame,
      onSound: () => {},
    })
    runtime.current = rt
    return () => rt.destroy()
  }, [code])

  const joinUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/play/${code}`
  const hearsay = GAMES.hearsay
  const canStart = players.length >= hearsay.minPlayers

  if (game && view) {
    const Screen = game.HostScreen
    return (
      <main className="relative h-full">
        <div className="absolute right-10 top-8 z-10 text-7xl font-black">
          <Countdown deadline={deadline} />
        </div>
        <Screen view={view} />
      </main>
    )
  }

  return (
    <main className="flex h-full flex-col items-center justify-center gap-10 p-10">
      <h1 className="text-5xl font-black uppercase tracking-widest text-white/50">Ruckus</h1>

      <div className="flex items-center gap-12">
        <div className="text-center">
          <p className="text-2xl font-bold uppercase tracking-widest text-white/50">Go to ruckus and enter</p>
          <p className="font-mono text-[10rem] font-black leading-none tracking-widest">{code}</p>
        </div>
        {joinUrl && <QrCode value={joinUrl} size={240} />}
      </div>

      <div className="flex min-h-32 flex-wrap items-center justify-center gap-6">
        {players.map((player) => (
          <PlayerChip key={player.id} player={player} size="lg" />
        ))}
        {players.length === 0 && (
          <p className="text-3xl font-bold text-white/30">Waiting for players...</p>
        )}
      </div>

      <button
        disabled={!canStart}
        onClick={() => runtime.current?.start(hearsay)}
        className="rounded-2xl bg-white px-16 py-6 text-4xl font-black uppercase text-black disabled:opacity-20"
      >
        {canStart ? 'Start Hearsay' : `Need ${hearsay.minPlayers} players`}
      </button>
    </main>
  )
}
```

- [ ] **Step 2: Verify the lobby renders**

Run: `npm run dev`, open `http://localhost:3000/host`.
Expected: a four letter code, a QR code, "Waiting for players", and a disabled start button. No console errors.

- [ ] **Step 3: Commit**

```bash
git add app/host/page.tsx
git commit -m "feat: host page with lobby, code and QR"
```

---

## Task 21: Player page

Note: in Next.js 16 `params` is a Promise, so it is unwrapped with React's `use()`.

**Files:**
- Create: `app/play/[code]/page.tsx`

- [ ] **Step 1: Write the file**

```tsx
'use client'

import { Countdown } from '@/components/Countdown'
import { GAMES } from '@/lib/games/registry'
import { createPlayerClient, type PlayerClient } from '@/lib/runtime/playerClient'
import type { Player } from '@/lib/types'
import { use, useEffect, useRef, useState } from 'react'

export default function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)

  const [me, setMe] = useState<Player | null>(null)
  const [name, setName] = useState('')
  const [view, setView] = useState<unknown>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [lobby, setLobby] = useState<Player[]>([])
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting')
  const client = useRef<PlayerClient | null>(null)

  useEffect(() => {
    const pc = createPlayerClient(code, {
      onAccepted: setMe,
      onView: (nextView, nextDeadline) => {
        setView(nextView)
        setDeadline(nextDeadline)
      },
      onLobby: setLobby,
      onStatus: setStatus,
    })
    client.current = pc
    return () => pc.destroy()
  }, [code])

  if (!me) {
    return (
      <main className="flex h-full flex-col justify-center gap-5 p-6">
        <p className="text-center font-mono text-4xl font-black tracking-widest text-white/50">{code}</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 12))}
          placeholder="Your name"
          className="rounded-2xl border-4 border-white/30 bg-white/5 px-5 py-6 text-center text-3xl font-black"
        />
        <button
          disabled={name.trim().length === 0 || status !== 'open'}
          onClick={() => client.current?.join(name.trim())}
          className="rounded-2xl bg-white py-6 text-3xl font-black uppercase text-black disabled:opacity-30"
        >
          {status === 'open' ? 'Join' : 'Connecting...'}
        </button>
      </main>
    )
  }

  if (!view) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-4xl font-black uppercase">You're in</p>
        <p className="text-xl font-bold text-white/50">{lobby.length} in the room. Watch the big screen.</p>
      </main>
    )
  }

  const Screen = GAMES.hearsay.PlayerScreen

  return (
    <main className="relative h-full">
      <div className="absolute right-4 top-3 text-2xl font-black">
        <Countdown deadline={deadline} />
      </div>
      <Screen view={view} send={(input: unknown) => client.current?.send(input)} />
    </main>
  )
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add "app/play/[code]/page.tsx"
git commit -m "feat: player page with join and game screens"
```

---

## Task 22: End to end playtest against a real room

This is the first time the whole thing runs together. Do it locally with four browser windows before deploying.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Open the host and note the code**

Open `http://localhost:3000/host` in one window. Note the four letter code.

- [ ] **Step 3: Join with four players**

Open four separate windows (use private windows so localStorage identities do not collide) at `http://localhost:3000/play/<CODE>` and join as Sam, Mike, Ron and Emily.

Expected: all four appear on the host lobby within a second of joining, and the start button enables at four.

- [ ] **Step 4: Play one full round and check every invariant**

Start the game and verify each of these. Any failure is a bug to fix before continuing:

- The host screen during `charge` says "something about <name>" and never shows the question.
- The accused's phone says "Look away", and does not show the question.
- The other three phones show the question.
- Votes register, and the phase advances early once all three have voted rather than waiting out the timer.
- The evidence screen shows counts only, with no indication of who voted for whom.
- The accused's phone shows exactly three options; the other phones show yes/no.
- The verdict reveals the question, attaches voter colours to the bars, and animates score deltas.
- Scores match the rules: 1000 to the accused if correct, 500 to each voter who matched the top pile, and nothing to the room if the accused was wrong.

- [ ] **Step 5: Verify reconnection**

Mid round, refresh one player's window.
Expected: they rejoin automatically with the same name and score, and receive the current phase without the host doing anything.

- [ ] **Step 6: Verify the game completes**

Play all eight rounds.
Expected: every player is accused exactly twice, no question repeats, and the game reaches the ended state with a final scoreboard.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: issues found in first end to end playtest"
```

---

## Task 23: Deploy

**Files:**
- None. Configuration happens in the Vercel dashboard or CLI.

- [ ] **Step 1: Deploy a preview**

Run: `npx vercel`
Follow the prompts to link the project.

- [ ] **Step 2: Set the three public environment variables**

Run each and paste the value from `.env.local` when prompted:

```bash
npx vercel env add NEXT_PUBLIC_EVENTS_HTTP production
npx vercel env add NEXT_PUBLIC_EVENTS_REALTIME production
npx vercel env add NEXT_PUBLIC_EVENTS_API_KEY production
```

- [ ] **Step 3: Deploy to production**

Run: `npx vercel --prod`
Expected: a production URL.

- [ ] **Step 4: Play one round on real phones over Discord**

Host on a laptop sharing its screen in Discord, join from at least three actual phones.
Expected: the code is readable through the compressed stream, phones join without trouble, and no phase requires reading the shared screen to act.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: deploy configuration"
```

---

## Task 24: Question bank generator

Grows the bank from 20 without hand writing every one. Run offline, output pasted into `questions.ts` after a human reads them.

**Files:**
- Create: `scripts/generate-questions.mjs`

- [ ] **Step 1: Write the script**

```js
// scripts/generate-questions.mjs
// Usage: node scripts/generate-questions.mjs conflict 10
// Requires: AWS_PROFILE=ruckus with Bedrock access in ap-south-1.
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'

const family = process.argv[2] ?? 'conflict'
const count = Number(process.argv[3] ?? 10)

const client = new BedrockRuntimeClient({ region: 'ap-south-1' })

const prompt = `Write ${count} party game questions for a group of close friends.

Every question asks the group to pick ONE person from the group, and must contain the placeholder {X} for the person being discussed.
Family: "${family}".
Rules:
- Simple vocabulary. Short. No em dashes.
- Funny, never cruel. Nothing about appearance, money problems, or family.
- Each must be answerable by pointing at a friend.

Return ONLY a JSON array of strings, no commentary.`

const response = await client.send(
  new ConverseCommand({
    modelId: 'global.anthropic.claude-sonnet-4-6',
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 1500 },
  })
)

const text = response.output.message.content[0].text
const questions = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1))

questions.forEach((template, i) => {
  console.log(`  { id: '${family[0]}${100 + i}', family: '${family}', tone: 'mild', template: ${JSON.stringify(template)} },`)
})
```

- [ ] **Step 2: Install the Bedrock SDK**

```bash
npm install --save-dev @aws-sdk/client-bedrock-runtime
```

- [ ] **Step 3: Run it**

Run: `AWS_PROFILE=ruckus node scripts/generate-questions.mjs conflict 10`
Expected: ten lines of ready-to-paste question objects.

- [ ] **Step 4: Read every generated question before pasting**

The bank is the game. Reject anything cruel, anything that cannot be answered by pointing at a person, and anything that duplicates an existing question's shape.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-questions.mjs package.json package-lock.json
git commit -m "feat: question bank generator"
```

---

## Task 25: Tone dial, sound and the end screen

Three spec requirements that Task 20 and Task 16 left unwired: the tone dial is in the config but not settable, `onSound` is a no-op, and the ended phase reuses the verdict layout.

**Files:**
- Modify: `app/host/page.tsx`
- Modify: `lib/games/hearsay/index.ts`
- Modify: `lib/games/hearsay/HostScreen.tsx`
- Create: `lib/sound.ts`

- [ ] **Step 1: Create `lib/sound.ts`**

Synthesised with the Web Audio API so there are no audio files to ship, load or license. Host only.

```ts
'use client'

let ctx: AudioContext | null = null

const TONES: Record<string, { freq: number; ms: number; type: OscillatorType }> = {
  evidence: { freq: 220, ms: 400, type: 'sawtooth' },
  verdict: { freq: 660, ms: 250, type: 'square' },
  ended: { freq: 880, ms: 700, type: 'sine' },
}

export function playSound(name: string) {
  const tone = TONES[name]
  if (!tone) return

  try {
    ctx ??= new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = tone.type
    osc.frequency.value = tone.freq
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + tone.ms / 1000)

    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + tone.ms / 1000)
  } catch {
    // Autoplay policy blocked it until the host interacts. Silence is survivable.
  }
}
```

- [ ] **Step 2: Accept a tone in the game module**

In `lib/games/hearsay/index.ts`, replace the `init` line so the host can pass a tone:

```ts
  init: (players) => initHearsay(players),
```

becomes:

```ts
  init: (players) => initHearsay(players, { ...DEFAULT_CONFIG, tone: selectedTone }),
```

and add, above the module:

```ts
import { DEFAULT_CONFIG } from './state'

/**
 * Set by the host lobby before the game starts. A module-level value rather
 * than a parameter, because the GameModule contract deliberately keeps init
 * to one argument so every game stays interchangeable.
 */
let selectedTone: 'mild' | 'spicy' = 'mild'

export function setHearsayTone(tone: 'mild' | 'spicy') {
  selectedTone = tone
}
```

- [ ] **Step 3: Add the tone dial and sound to the host page**

In `app/host/page.tsx`, add to the imports:

```tsx
import { setHearsayTone } from '@/lib/games/hearsay'
import { playSound } from '@/lib/sound'
```

Add state, next to the other `useState` calls:

```tsx
const [tone, setTone] = useState<'mild' | 'spicy'>('mild')
```

Change `onSound: () => {},` to:

```tsx
onSound: playSound,
```

And add the dial to the lobby, directly above the start button:

```tsx
<div className="flex gap-3">
  {(['mild', 'spicy'] as const).map((option) => (
    <button
      key={option}
      onClick={() => {
        setTone(option)
        setHearsayTone(option)
      }}
      className={`rounded-xl border-4 px-8 py-3 text-xl font-black uppercase ${
        tone === option ? 'border-white bg-white text-black' : 'border-white/30 text-white/50'
      }`}
    >
      {option}
    </button>
  ))}
</div>
```

- [ ] **Step 4: Give the ended phase its own screen**

In `lib/games/hearsay/HostScreen.tsx`, change the final reveal condition from:

```tsx
        {(view.phase === 'verdict' || view.phase === 'scoreboard' || view.phase === 'ended') && (
```

to:

```tsx
        {(view.phase === 'verdict' || view.phase === 'scoreboard') && (
```

and add this block directly after that section, inside `<main>`:

```tsx
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
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

Then run a game locally, switch the dial to spicy before starting, and confirm spicy questions appear and that a sound plays on the evidence and verdict transitions.

- [ ] **Step 6: Commit**

```bash
git add lib/sound.ts lib/games/hearsay/index.ts app/host/page.tsx lib/games/hearsay/HostScreen.tsx
git commit -m "feat: tone dial, host sound and final scoreboard"
```

---

## Explicitly out of scope

Named here so nobody wonders whether they were forgotten:

- **Custom questions added in the lobby.** In the spec, deferred to after the first playtest. Typing questions on a phone before the game is friction, and the group can feed real questions into `questions.ts` between sessions instead.
- **The game picker and pack-wide scoring.** The registry exists and `GAMES` is keyed by id, but with one game there is nothing to pick between. Wire it when game two exists.
- **Ghostwriter.** Parked. No AI at runtime anywhere in this plan.

---

## Notes for whoever executes this

**The security boundary is `hostView` versus `playerView`.** Anything returned by `hostView` is broadcast to everyone on the public channel. The charge and the accused's options must only ever travel through `playerView`. Task 12's tests exist specifically to catch a regression here, so do not weaken them.

**The reducer is pure and must stay pure.** No `Date.now()`, no `fetch`, no timers inside `reduce`. Timers are requested with a `timer` command and executed by the runtime. This is what makes the phase machine testable without faking a clock.

**Randomness is the one exception.** `pickQuestion` and `buildAccusedOrder` call `Math.random()`. That is deliberate and contained: the tests assert properties across many runs rather than exact sequences.

**Do not add a database.** If something seems to need one, it is a sign that state is leaking out of the host tab, which is the thing this architecture is built to avoid.
