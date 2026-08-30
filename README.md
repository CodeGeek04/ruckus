# Ruckus

A pack of party games played the Jackbox way: one shared screen, everyone else on their phone.

- **Hearsay** — the room secretly answers a question about you. You never hear the question, only the votes, and you have to work out what you were accused of.
- **Who Said It** — real messages from the group's own WhatsApp export. Guess who typed it.
- **Broken Telephone** — a sentence becomes an AI image becomes a sentence, several people deep, then the whole chain is revealed.

## Running it

```bash
pnpm install
pnpm dev
```

Host the game at `/host` on the screen you are sharing. Everyone else opens the site on their phone and types the four letter code, or taps a `/join?code=ABCD` link.

## Architecture

The host browser tab **is** the game server. It holds all state, runs a pure reducer, owns the clock, and is the only client that talks to the API routes. Phones are controllers: they render what they are told and send taps. There is no database.

AWS AppSync Events is used purely as a message bus, with two channel shapes per room:

- `/room/{code}` — public state, and player inputs.
- `/room/{code}/p/{playerId}` — per player secrets. Anything a player must not see lives only here.

`hostView` output is broadcast to every device; `playerView` output goes to one phone. That split is the security boundary, and it is what stops the accused reading their own question off the shared screen. Tests pin it.

Every game implements the same four function contract, so a new game costs no new infrastructure:

```ts
init(players) -> { state, commands }
reduce(state, event) -> { state, commands? }   // pure
hostView(state) -> HostView                    // public
playerView(state, playerId) -> PlayerView      // one phone
```

Reducers are pure. They request impure work (timers, sounds) by returning commands that the runtime executes.

## Environment

```
NEXT_PUBLIC_EVENTS_HTTP=       # AppSync Events HTTP endpoint
NEXT_PUBLIC_EVENTS_REALTIME=   # AppSync Events realtime endpoint
NEXT_PUBLIC_EVENTS_API_KEY=    # AppSync API key (public by design, ships in the bundle)
GEMINI_API_KEY=                # server side only, Broken Telephone images
BLOB_READ_WRITE_TOKEN=         # Vercel Blob, set automatically by the Blob integration
ANTHROPIC_KEY=                 # local only, for the question generator script
```

A generated image is about 780KB and the AppSync event limit is 240KB, so images go to Vercel Blob and only the URL crosses the bus.

## Testing

```bash
pnpm test                                  # 277 unit tests, pure logic
node scripts/e2e.mjs hearsay               # real browsers: a host tab plus four phones
node scripts/e2e-edge.mjs                  # reconnects, host refresh, hostile input, viewports
node scripts/play-through.mjs              # a whole game over the live bus, headless
```

The e2e harnesses drive real Chromium contexts, assert no layout overflow and no page errors, and write screenshots to `.e2e/`. Game screens are fixed frames and must never overflow; the lobby is allowed to scroll.

## Content

`lib/games/hearsay/questions.ts` holds the question bank. Grow it with:

```bash
node scripts/generate-questions.mjs conflict 10 gurgaon spicy
```

Read every generated line before pasting it in. Questions that mean the same thing make an unsolvable decoy pair, so near duplicates are worse than useless.

## Design

`PRODUCT.md` and `DESIGN.md` are the source of truth for who this is for and how it should look. Read them before changing any UI.
