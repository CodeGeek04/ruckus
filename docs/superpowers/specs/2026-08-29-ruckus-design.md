# Ruckus: design spec

Date: 2026-08-29
Status: approved, ready for implementation planning

## What this is

**Ruckus** is a party game pack in the Jackbox mould. One shared screen (the host), everyone else joins from their phone. Built for a 24 hour challenge where the only judging criteria are that the game is enjoyable and that everyone can play.

The pack ships with one flagship game and adds more behind it:

1. **Hearsay** (the submission, and the only game in scope right now)
2. Parked: **Ghostwriter**, specified below but explicitly not being built yet
3. Backlog: Hot Potato, Alibi, Telephone, Who Said It

Game two is undecided. Once Hearsay is playable the next brainstorm is aimed at more open-ended, skill-expressing games (2D, Minecraft and Terraria as tone references) rather than another social-deduction round loop.

The judges are the players: the authors' own friend group, all of whom know each other. This is the single most important design fact in this document. It means personal content, jokes that depend on shared history, and games about the people in the room are assets rather than liabilities. A game that a stranger could not play is acceptable here.

## Constraints

**Discord.** The host shares their screen over Discord voice. Two consequences that are binding on every screen we design:

1. The shared screen arrives compressed, soft and about a second late. Nothing a player must read in order to act may live only on the shared screen. Anything actionable is mirrored to their phone. The shared screen carries drama: timers, reveals, scoreboards, large type, motion.
2. Host system audio is shared, so music and stings are free. Player phones stay silent, which is correct both for a room and for a call.

**24 hours.** Every architectural decision favours speed of adding game number two, three and four over robustness.

## Architecture

### The host tab is the game server

The host browser tab holds all state, runs all game logic, owns the clock, and is the only client that talks to our API routes. Phones are controllers: they render what they are told and send taps.

Accepted trade-off: closing the host tab ends the game. Mitigated by a localStorage snapshot on every state transition, so a host refresh restores the round. For a group in a single Discord call this is the right trade.

### Transport: AWS AppSync Events

Serverless WebSocket pub/sub, used purely as a message bus. No database, no tables, no migrations, no Lambda, no connection registry.

Two channels per room:

- `/room/{code}`: host broadcasts public state; players publish their inputs.
- `/room/{code}/p/{playerId}`: host sends per-player secrets. This channel exists because the players are the kind of people who would open devtools. Hearsay's charge and Ghostwriter's role assignment travel here and must never appear in public state.

Auth: API key for browser clients, IAM for server routes. Connection presence drives the lobby's connected/dropped indicators.

Fallback if AppSync Events disappoints: API Gateway WebSocket plus a small Lambda and a DynamoDB connection table. More moving parts, very well trodden.

### Reconnection

Phones persist `{roomCode, playerId, name}` to localStorage and silently rejoin with the same id, so a locked screen or a Discord notification never ejects a player. On rejoin the host re-sends current state to that player's private channel.

### AI

All model calls happen in Next.js API routes, server side. No credentials reach a browser.

- Provider: **AWS Bedrock**, region `ap-south-1`, AWS CLI profile `ruckus` (account `016467578412`, IAM user `voriq-claude`).
- Text model: `global.anthropic.claude-sonnet-4-6` (verified working, ~970ms). `claude-sonnet-5` is denied on this account; requesting access in the Bedrock console would unlock it.
- Fast path where latency matters: `global.anthropic.claude-haiku-4-5-20251001-v1:0` (~806ms).
- Images: **not implemented**. Exposed as an abstract `generateImage(prompt): Promise<string>` that throws `NotImplemented`. Bedrock in this account offers only Nova Canvas, which returns a legacy-model access error, and Stability's edit-only models. Provider to be chosen later; only the backlog Telephone game needs it.

Guardrails on every call: hard `maxTokens` cap, and few-shot context trimmed to the last N rounds so it cannot grow unbounded.

### Hosting

Vercel. Next.js 16 App Router, React 19, Tailwind 4, TypeScript. Phones need a public URL, so local-only is not sufficient.

### Cost

Assumed published rates: Sonnet 4.6 at $3/M input and $15/M output; AppSync Events at $1.00/M operations plus $0.08/M connection-minutes.

- Hearsay: no AI at runtime. Transport only, roughly $0.005 per session.
- Ghostwriter: about $0.007 per round, about $0.06 per full session.
- Realistic total across the whole build including heavy testing: under $20.
- Pessimistic ceiling (500 sessions, 12 rounds, 3 candidate generations per round, 8k context): under $100.

## The shell

Built once, shared by every game.

- Room creation with 4-letter codes from an ambiguity-free alphabet (no I, O, 0, 1).
- Host screen shows the code at size plus a QR. The typed code is the reliable path over Discord; the QR is a bonus for people physically in the room.
- Phone join: name entry, colour and avatar pick.
- Lobby with connection status per player.
- Game picker, so several games run back to back on the same lobby with a running pack-wide score.
- Round loop runtime: timers, phase transitions, input collection, reveal orchestration, scoreboard.
- Sound and music on the host only.

### The game module contract

Every game is one folder implementing:

```ts
init(players, config) -> State
reduce(state, event) -> { state, commands? }   // pure
hostView(state) -> HostView                    // shared screen
playerView(state, playerId) -> PlayerView      // one phone; private data lives only here
```

Events: `input`, `tick`, `deadline`, `hostAdvance`, `apiResult`.

`commands` is how a pure reducer requests impure work from the runtime: `startTimer(ms)`, `callApi(...)`, `playSound(...)`. Keeping `reduce` pure means every game is testable as a plain function, and it means game three needs no new infrastructure.

Private data must only ever be reachable through `playerView`. Anything returned by `hostView` is public.

## Game 1: Hearsay

The room testifies about you. You never hear the charge. You have to work out what you were accused of from the evidence.

Shared screen styling: courtroom.

**Players:** 4 to 12.

### Round structure

Rounds are allocated so every player sits in the chair an equal number of times, running enough full cycles to reach at least 8 rounds. Four players sit twice each; six players sit twice each; eight or more sit once each. Group size changes who repeats, never who is skipped. Order comes from a shuffle bag.

**0. The Accused** is spotlighted.

**1. THE CHARGE** (5s)
The question goes to every phone except the Accused's, via the private channel. The shared screen shows only `THE ROOM IS BEING ASKED SOMETHING ABOUT SAM` because the Accused is looking at it. The Accused's phone tells them to mute and look away. The mute instruction is part of the ritual.

**2. TESTIMONY** (20s)
Everyone except the Accused taps a face. Voting for the Accused is allowed. Voting for yourself is allowed.

**3. THE EVIDENCE** (10s)
The shared screen shows the tally: how many votes each person received, with no indication of who cast them. Who voted for whom stays hidden until the verdict. The Accused now sees the shape of the room's opinion with no idea what the question was.

**4. THE GUESS** (25s)
The Accused's phone shows three questions: the real one and two decoys. They pick one. That is their only task.

Simultaneously every other phone shows `Will Sam work it out? YES / NO`. This does not score. It is a crowd meter rendered on the shared screen, it keeps the room busy, and being publicly written off before answering is funnier than points.

**5. VERDICT** (20s)
In sequence: the real question at full size, then faces attached to every vote, then the Accused's answer, then score deltas.

**6. SCOREBOARD** (8s)

About 90 seconds per round. Eight rounds is roughly 12 minutes.

### Scoring

| Action | Points |
|---|---|
| Accused picks the correct question | 1000 |
| You voted for the person who received the most votes | 500 |

Nothing else scores. No points for notoriety, for the yes/no crowd meter, or for participation.

Config, so the rules can be tuned after a playtest without touching game logic:

```ts
scoring: {
  accusedCorrect: 1000,
  readTheRoom: 500,
  readTheRoomRequiresAccusedCorrect: true,
}
```

`readTheRoomRequiresAccusedCorrect: true` is the shipped default: the room only scores when the Accused gets it right. Setting it false makes the two rewards independent. Setting `readTheRoom: 0` makes the chair the only thing that scores. This flag is under review pending a playtest.

**Ties.** If several people tie for most votes, everyone who voted for any of the tied people scores. A 1/1/1 split means the room had no consensus and nobody was wrong.

**Language.** The shared screen must never call the most-voted person the correct answer. There is no ground truth here; the reward is for reading the room, and the copy says so.

**No doubled final round.** Everyone sits in the chair an equal number of times, so doubling the last round would simply reward whoever is accused last.

### Balance

With four players over eight rounds, a player is accused twice and testifies six times, so at most 2000 points come from the chair and 3000 from reading the room. The chair is where the drama is, not where the game is decided. That also blunts the luck in a one-in-three guess.

### The question bank

The bank is where this game lives or dies.

- **Ship with 20 hand-written questions.** That is enough for a full game and enough to playtest. The bank grows with a Claude-backed generator that takes a theme and produces more in the same families, run offline as a script. Aiming at 120 eventually, but 20 is the bar for playable.
- All of the form "who is X most likely to...", "who would X call at 3am", "who does X secretly find annoying".
- Grouped into **families by shape**, so decoys are drawn coherently. This grouping is what makes the guess a deduction rather than a coin flip.
- **Decoy difficulty scales with player count.** With few voters the evidence is thin, so decoys come from deliberately different families (one affection-shaped, one conflict-shaped) and the vote pattern is genuinely informative. With many voters the spread carries more signal, so decoys can be near neighbours of the real question.
- **Tone dial** set in the lobby: mild or spicy.
- Custom questions can be added in the lobby.
- Drafted by hand and extended with Claude offline. Ships as a static file with no runtime dependency.

### Inclusivity

No typing, no writing, no trivia, no reflexes, no wit. You tap faces. Every player acts in every phase, including the Accused, who is deducing while everyone else is betting. Nobody is eliminated, nobody sits out a round, and the chair rotates by construction rather than by luck. Playable by anyone who can recognise their friends' names.

## Parked: Ghostwriter

Not in scope. Specified here so the design is not lost, but no work starts on it until Hearsay is finished and playtested, and until the next brainstorm decides whether it or a skill-based game is game two.

### Ghostwriter

A human verification test that the humans keep failing. Shared screen styled as a broken CAPTCHA.

**Players:** 3 to 10. **Length:** 7 rounds, about 15 minutes.

### Round structure

**0. Assignment.** One player is secretly made the **Ghostwriter** and told, on their phone only, to write like the machine. With 7 or more players there are two, which keeps the vote properly split in a long lineup. Assignment uses a shuffle bag so everyone holds the role before anyone repeats: the Ghostwriter earns the most points, so this cannot be luck. At the same moment the machine privately picks one player to imitate.

**1. WRITE** (60s). Prompt on both screens. One answer each, capped at 140 characters. The cap keeps answers funny and makes typing speed close to irrelevant. The Bedrock call fires the instant the prompt appears, using previous rounds' answers as its style reference, so the machine's answer is ready well before the timer ends and nobody ever waits on the AI.

**2. LINEUP** (8s). Answers shuffled, revealed one at a time on the shared screen, mirrored as a tappable list on every phone.

**3. HUNT** (30s). Everyone taps the answer they believe the machine wrote. You cannot pick your own. Ghostwriters vote honestly, because they do not know which answer is the machine's either.

**4. ATTRIBUTION** (15s). The human answer that drew the most votes is highlighted: "who wrote this?" One question only.

**5. RECKONING** (25s). The machine's answer identifies itself; voter avatars fly onto the answers they picked; the imitation target is named; the Ghostwriter stands up; the attribution author is named; scores animate.

**6. SCOREBOARD** (10s) with the running Humans vs Machine tally.

### Scoring

| Action | Points |
|---|---|
| You identified the machine | 1000 |
| Someone voted for your answer (regular player) | 250 each |
| Someone voted for your answer (Ghostwriter) | 1000 each |
| Ghostwriter drew more votes than the machine | 1000 bonus |
| You named the attribution author correctly | 500 |
| Machine received zero votes | Machine takes the round on the tally; no player penalty |

Final round doubles.

Detection pays more than passing as a machine for everyone except the Ghostwriter. If passing paid well for everybody, every player would write slop, the lineup would be uniform, and the hunt would become a coin flip. Exactly one designated slop merchant per round, hiding among people writing honestly, is what keeps the hunt a skill.

### The machine's voice

Hard, never impossible. Push the AI to perfectly human and detection becomes random, which makes the game pointless.

System prompt bans em dashes, elevated vocabulary, hedging, both-sidesing and the tricolon; forces a lowercase casual register; caps length. From round 2 it is few-shot fed the group's own answers and drifts toward how these specific people type.

What it never gets: an inside reference, a typo, or a genuinely specific detail. Those are the permanent tells, earnable by a sharp player without being obvious. The tells fade by design across the game, so round 1 is a little too tidy and round 7 is nearly clean. The game gets harder as the players get better at it.

### End of game titles

Awarded from stats tracked all game so more than one person leaves with something: **Bloodhound** (most machines caught), **The Bot** (most votes received), **Most Human** (fewest votes received), **Best Impression** (Ghostwriter who fooled the most people in one round). Separately, the Humans versus Machine record for the night.

## Backlog

Not in scope for the 24 hours unless the first two land early.

- **Hot Potato.** Ambiguous prompts rather than trivia, so it becomes a judgement game: the room votes each answer valid or not. Removes the knowledge barrier that disqualified it as the submission.
- **Alibi.** Everyone is paired simultaneously rather than two suspects against the room. Every pair answers the same five questions separately, then pairs are revealed one at a time. Nobody spectates and everybody gets the telepathy test.
- **Telephone.** Text to image to text chains. Blocked on an image provider.
- **Who Said It.** Real messages from the group's chat export. Devastating with friends, unplayable with strangers, needs an export.

## Settled decisions

Confirmed by the owner after the edge-case round. Do not re-open these without asking.

- **Late joiners are refused.** Someone arriving after the game starts is told why, and is admitted automatically when the host returns to the lobby. They are not queued as spectators and not let in on zero points.
- **Room codes persist across sessions.** The saved code is the room's identity, so a host who comes back later keeps the same code until they press "New room". This is deliberate: it stops a lobby refresh invalidating a code everybody has already typed.
- **`maxPlayers` is not enforced.** There are 12 player colours, so a 13th player would duplicate one and become hard to tell apart on the shared screen. Accepted: the real group is 8, which is well clear. Enforce it only if a room ever gets close.

## Deferred decisions

- Ghostwriter confidence tokens (spread three votes instead of one) and the paranoia round (one round with no machine answer at all). Both parked, both additive.
- Voice input on phones. Explicitly out of scope.
- `readTheRoomRequiresAccusedCorrect` default, pending playtest with the group.
- Image provider.

## Environment

```
AWS_PROFILE=ruckus                # local dev, credentials already on the machine
AWS_REGION=ap-south-1
BEDROCK_TEXT_MODEL=global.anthropic.claude-sonnet-4-6
BEDROCK_FAST_MODEL=global.anthropic.claude-haiku-4-5-20251001-v1:0
NEXT_PUBLIC_APPSYNC_EVENTS_HTTP=  # set after provisioning
NEXT_PUBLIC_APPSYNC_EVENTS_REALTIME=
NEXT_PUBLIC_APPSYNC_API_KEY=
```

On Vercel the AWS profile is replaced by an access key and secret in project environment variables.

## Build order

1. Shell: rooms, join, lobby, round runtime, scoring, scoreboard, host and phone layouts.
2. Hearsay, including 20 seed questions.
3. Polish: sound, motion, the reveal choreography.
4. Playtest with the group. Tune the scoring flag, grow the question bank.
5. Brainstorm game two. Ghostwriter is a candidate, not a commitment.

Hearsay is built first for two reasons: it is the submission, and it exercises every piece of shell infrastructure while exercising none of the AI risk. Debugging model tone and websockets at the same time, at 3am, is how a 24 hour build fails.
