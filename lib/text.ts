// lib/text.ts
//
// Player names come off a phone keyboard, so they arrive as emoji, as pasted
// novels, and occasionally as an attempt to break the screen. Everything a
// name touches goes through here.

/** Twelve characters is what the host lobby chip can hold. */
export const MAX_NAME_LENGTH = 12

/**
 * Characters that have no business in a name and real consequences if they
 * stay: C0 and C1 controls, and the bidi overrides that let a name reorder the
 * text around it on the shared screen.
 */
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g

/** A high or low surrogate with no partner. See `truncate` for how they appear. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * Truncates by code point rather than by UTF-16 unit.
 *
 * `"a<six party poppers>".slice(0, 12)` cuts the last emoji in half and leaves
 * a lone surrogate on the end. That is not merely ugly: AppSync rejects the
 * whole event with InvalidEventException, so a player whose name happened to
 * land on that boundary could never join and the room could never start.
 * Spreading a string iterates code points, so nothing is ever cut in half.
 */
export function truncate(value: string, max: number): string {
  const points = [...value]
  return points.length <= max ? value : points.slice(0, max).join('')
}

/** What the name input keeps as it is typed. Length only, no other opinions. */
export function truncateName(value: string, max: number = MAX_NAME_LENGTH): string {
  return truncate(value, max)
}

/**
 * The name as it is published and rendered. Empty means unusable, and both the
 * join button and the host treat it as such.
 */
export function cleanName(raw: unknown, max: number = MAX_NAME_LENGTH): string {
  if (typeof raw !== 'string') return ''
  const stripped = raw.replace(LONE_SURROGATE, '').replace(FORBIDDEN, '').replace(/\s+/g, ' ').trim()
  return truncate(stripped, max).trim()
}

/** The two character monogram on a player chip, by code point for the same reason. */
export function initials(name: string): string {
  return truncate(name, 2).toUpperCase()
}
