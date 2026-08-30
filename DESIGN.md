# Ruckus design system

Gumroad's structural language: flat saturated blocks, hard black borders, hard offset shadows, chunky type, zero gradients. Applied to two surfaces with different canvases, because they are looked at in completely different conditions.

## Color

OKLCH. No pure `#000` or `#fff` anywhere: every neutral is tinted toward the ink hue.

**Strategy: full palette.** Four named roles, each used deliberately, plus per-player identity colors. This is a party game where four people need to be told apart at a glance from across a room. Restraint would be a failure of nerve.

```
--ink:      oklch(0.16 0.02 285)   near-black, faintly violet. Borders, host canvas, phone text.
--paper:    oklch(0.96 0.015 90)   warm cream. Phone canvas.
--chalk:    oklch(0.99 0.005 90)   raised surfaces on paper.

--shout:    oklch(0.78 0.19 350)   hot pink. The primary action, the live thing.
--verdict:  oklch(0.80 0.17 95)    acid yellow. Reveals, the moment of truth.
--gain:     oklch(0.72 0.19 150)   green. Points, correct, alive.
--loss:     oklch(0.63 0.22 25)     red. Wrong, out of time, the machine winning.
```

Player identity colors are a fixed eight-step wheel, all at the same lightness and chroma so no player looks more important than another.

**Host canvas** is `--ink`. Saturated blocks sit on it and carry the drama. A dark ground survives video compression, hides banding, and does not blind a room at 1am.

**Phone canvas** is `--paper`. Held close in a lit room, cream reads as friendly and makes the pink and yellow sing. This is the full Gumroad treatment.

## Borders and shadows

The signature. Every interactive or contained element:

- Border: `3px solid var(--ink)` on paper, `3px solid` a light ink on the host.
- Shadow: hard offset, no blur. `box-shadow: 5px 5px 0 var(--ink)`. Never a soft shadow, never a blur radius.
- Pressed state: translate by the shadow offset and remove the shadow, so the element physically depresses.
- Radius: 14px on containers, 10px on buttons, 999px on chips. Never 4px, never sharp.

Nothing floats. Nothing glows. Nothing is translucent.

## Typography

Two families, both variable, both loaded locally through `next/font`:

- **Display**: a heavy grotesque for anything shouted. Weight 800 to 900, tracking tightened to -0.03em at large sizes.
- **Body**: the same family at 500 to 700 for anything read.

Scale is viewport-relative on the host (`clamp()`) because the same screen is shared at 720p and at 1440p. Steps have a ratio of at least 1.3, so hierarchy is never ambiguous through a soft encoder.

Line length capped at 65ch. Numbers always `tabular-nums`, so a score changing does not shift layout.

## Motion

Ease-out only, exponential curves. No bounce, no elastic, no spring.

- Reveals: 400ms, `cubic-bezier(0.16, 1, 0.3, 1)`.
- State changes on a phone: 150ms. Must feel instant.
- Staggered entrances: 60ms between siblings, never more than six in a sequence.
- Never animate layout properties. Transform and opacity only.
- Everything respects `prefers-reduced-motion`.

## Layout

Both surfaces are fixed frames, never scrolls. Three rows: header, a middle row that flexes and clips, a footer. Content that overflows is a bug, caught by the Playwright layout assertions in `scripts/e2e.mjs`.

Spacing rhythm is deliberately uneven: tight inside a group, generous between groups. Uniform padding everywhere is monotony.

Cards are avoided. The host screen is a stage, not a dashboard. Where a container is genuinely the right affordance it gets the full border and hard shadow, and it is never nested inside another one.

## Personality

Commentary is data, not layout. It lives in a lookup keyed by observable facts about the round (unanimous vote, zero votes, a comeback, a wrong guess against the room) and renders in a single reserved slot. It can be absent without anything moving.

It is presentation only. It never reads or writes game state, never changes a score, never gates a phase. Removing every line of it would leave the games mechanically identical.
