# Ruckus: stack and architecture

A pack of three party games. One shared screen, everyone else on a phone. Built in a day.

53 source files, 280 unit tests, 184 questions, 86 commits.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16.3.3, App Router | Turbopack by default, `params` as a Promise, Middleware renamed Proxy |
| UI | React 19.2.8, Tailwind 4 | Tokens live in `@theme` in CSS, not a JS config |
| Language | TypeScript 5 | Strict throughout |
| Package manager | pnpm 11.3.0 | Pinned via `packageManager` so CI cannot drift |
| Realtime | AWS AppSync Events (`ap-south-1`) | Serverless WebSocket pub/sub. Used as a dumb pipe, no database |
| Image generation | Gemini `gemini-3.1-flash-image` | Server side only, in a route handler |
| Image storage | Vercel Blob | Images are 40x the event size limit, so only URLs cross the bus |
| Hosting | Vercel | Auto-deploy from `main` |
| Type | Bricolage Grotesque, Azeret Mono | Display and the machine's voice |
| Unit tests | Vitest, 280 tests | Pure logic only, no DOM |
| Browser tests | Playwright | Real host tab plus real phone contexts |
| CI | GitHub Actions | Typecheck, lint, test, build on every push |
| Content generation | Anthropic API (offline script) | Grows the question bank; never called at runtime |

Deliberately absent: **no database, no auth, no state management library, no component library, no ORM.**

---

## The core idea

**The host browser tab is the game server.**

It holds all state, runs a pure reducer, owns the clock, and is the only client that talks to API routes. Phones are dumb controllers: they render what they are told and send taps.

```
┌──────────────────────────────┐
│  HOST TAB (the server)       │
│                              │
│  state ── reduce() ── views  │
│    │                    │    │
│    └── localStorage     │    │
│        snapshot         │    │
└─────────────┬────────────────┘
              │ AppSync Events
      ┌───────┴────────┬─────────────┐
      ▼                ▼             ▼
  ┌───────┐        ┌───────┐     ┌───────┐
  │ phone │        │ phone │     │ phone │
  └───────┘        └───────┘     └───────┘
```

**What this buys:** no database, no server state, no sync problems, no deploy needed to change game logic. A game is a pure function.

**What it costs:** close the host tab and the game is over. A refresh recovers via a localStorage snapshot; a close does not. For a group in one Discord call, that was the right trade.

---

## Transport

AppSync Events is used purely as a message bus. Two channel shapes per room:

| Channel | Carries |
|---|---|
| `/room/{code}` | Public state, and player inputs |
| `/room/{code}/p/{playerId}` | One player's secrets |

Constraints learned by measuring against the live API, not from docs:

- **Channel segments cannot contain underscores.** `p_abc` returns `Invalid Channel Format`, so player ids are hyphenated.
- **Maximum depth is 4 segments**, so `/room/CODE/p/{id}` is exactly at the limit.
- **Maximum payload is 240KB**, binary-searched to 245,625 characters.
- **A rejected event still returns HTTP 200.** The failure hides in a `failed[]` array in the body. Not reading it meant an oversized broadcast vanished silently, which is close to undebuggable.

### Connection handling

Phones are on mobile networks and lock their screens constantly, so this got more attention than anything else in the codebase:

- **One WebSocket per client**, many subscriptions multiplexed, reconnecting with backoff.
- **Join is idempotent.** The join is an HTTP publish and the acceptance arrives over the WebSocket, so they race. Phones re-announce every 2s until acknowledged, and for 9s after every socket open.
- **The host heartbeats every 3s.** Phones show a "lost the host" screen after 11s of silence, and recover on their own. Phones publish on the same channel and hear their own echoes, so only messages the host sends count as a sign of life.
- **A clean host teardown sends an explicit goodbye**, so phones switch over immediately rather than waiting out the timeout.

---

## The game module contract

Every game implements four functions. Adding a game costs no new infrastructure.

```ts
init(players)            -> { state, commands }
reduce(state, event)     -> { state, commands? }   // pure
hostView(state)          -> HostView               // public, broadcast to all
playerView(state, id)    -> PlayerView             // one phone only
```

Events are `input`, `deadline`, `hostAdvance`.

### Purity, and how impure work happens

Reducers never call `Date.now()`, `fetch`, or a timer. They **request** impure work by returning commands the runtime executes:

```ts
{ kind: 'timer', ms: 20000 }
{ kind: 'sound', name: 'verdict' }
```

This is why every game is testable as a plain function with no clock to fake.

### The security boundary

`hostView` output is broadcast to every device **including the phone of the player it is about**. `playerView` output goes to exactly one phone.

In Hearsay the accused must not learn their own question, while staring at the shared screen. So the question is structurally absent from the host view until the verdict phase, and the accused's three options exist only in their own player view. The host view type has no field for them, so they cannot leak by accident.

Tests pin this, including one asserting private state never appears in a serialised host view.

---

## The three games

### Hearsay

Each round one player is the Accused. Everyone else secretly sees a question about them and votes for a player. The Accused never sees the question, only the vote tally, and must deduce which of three questions was asked.

- Phases: `charge → testimony → evidence → guess → verdict → scoreboard`
- Everyone sits in the chair an equal number of times, by construction, from a shuffle bag
- Scoring: 1000 for identifying the question, 500 for voting with the room
- 184 questions in families, so decoys are coherent. Decoy difficulty scales with player count: with few voters the tally is thin, so decoys come from different families
- The verdict fires the instant the Accused decides. The crowd's yes/no scores nothing, so waiting on it was friction

### Who Said It

Real messages from the group's WhatsApp export. Guess who typed it.

- The export is parsed **in the host browser** and never uploaded
- Handles both iOS and Android export formats, strips the bidi isolates around `@mentions`, and removes attachment lines that survive parsing as sentences
- Quality filter: 25 to 140 characters, 5+ words, no links, no reactions, no file artifacts. From a 9,807-message export, 3,423 are usable
- Answers are chat **authors**, not players, so someone who never joined can still be the answer
- Messages are sampled from the top 35% of each author's ranked material rather than the top of the sort. Taking the best served the same ten messages every game

### Broken Telephone

A sentence becomes an AI image becomes a sentence, several people deep.

- N chains run simultaneously, rotating, so nobody ever waits their turn
- **No timers at all.** The host paces it. A countdown cutting somebody off mid sentence was the worst thing that could happen to a round
- Images are generated by the phone that wrote the sentence, via a server route, so N images generate in parallel
- Every image is addressed to the slot it was requested for. Generation takes ~12s and the step can move on, and keying on the current step silently dropped late images

#### The image pipeline

```
phone ──POST /api/image──► route handler ──► Gemini
                                │
                                ▼
                          Vercel Blob
                                │
                     120-char URL ──► back to the phone
                                │
                     sent as an ordinary input
```

A generated image is **778KB**; the event limit is **240KB**. Inline was not marginal, it was impossible, so only the URL crosses the bus. That decision was made by measuring both numbers before any game code was written.

---

## Testing

Three layers, each catching things the others cannot.

**Unit, 280 tests, Vitest.** Pure logic only: reducers, scoring, parsing, chain rotation, question selection. Node environment, no DOM.

**Browser, Playwright.** `scripts/e2e.mjs` drives a real host tab plus four real phone contexts through a full game, asserting no layout overflow, nothing rendered outside the viewport, and no page errors. Screenshots to `.e2e/` for a human to look at. Game screens are fixed frames and must never overflow; the lobby and the end screen may scroll, and that distinction is explicit in the harness rather than a weakened assertion.

**Edge cases, Playwright.** `scripts/e2e-edge.mjs` covers 14 scenarios: reconnects, host refresh, genuine socket drops, late joins, duplicate names, silent players, tap spam, hostile names including `<img onerror>` and RTL overrides, group sizes, both host viewports, small phones.

**Live integration.** `scripts/play-through.mjs` plays a whole game over the real bus headlessly and asserts the secrecy boundaries hold on the wire.

CI runs the first layer plus typecheck, lint and build. The browser layers stay local: they need a live AppSync connection and take minutes.

---

## Bugs this architecture made findable

Worth recording, because most were invisible to types and unit tests:

- **The bus subscribed twice per connect** and AppSync rejected the duplicate id, so that phone received nothing. Symptom: tap Join, wait forever.
- **Unaccepted players could inject inputs.** Anyone with a room code could vote, and be paid for it.
- **An emoji name locked a player out permanently.** Slicing to 12 characters cut mid-emoji and left a lone surrogate, which AppSync refuses.
- **A host refresh in the lobby minted a new room code**, invalidating every code already typed.
- **Late images were silently dropped**, leaving a chain reading "no picture" for the rest of the game.
- **A player's colour could vanish into a matching phase colour.** Blue on blue. Only visible by looking.

---

## Design system

`PRODUCT.md` and `DESIGN.md` are the source of truth. Briefly: flat saturated blocks, 4px ink borders, hard offset shadows with zero blur, no gradients anywhere. Each phase drenches the screen in its own colour so the room can read the state from across a lounge without reading a word. One fluid type scale defined once, seven steps.

Two surfaces, different problems. The host is watched through a lossy Discord encoder from four metres. The phone is held six inches from a face and does one thing per screen.

---

## Cost

| | |
|---|---|
| Hearsay | No AI at runtime. Transport only, about $0.005 a session |
| Who Said It | No AI at all. Parsing is local |
| Broken Telephone | One image per player per step, plus blob storage |
| Question generation | About $0.004 per batch of questions, run offline |

The whole build, including heavy automated testing, came in under $20.
