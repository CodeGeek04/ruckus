/**
 * The commentary layer.
 *
 * Presentation only. This module never reads or writes game state, never
 * changes a score, and never gates a phase. Delete every line in it and the
 * three games are mechanically identical. That is the contract.
 *
 * Lines are chosen DETERMINISTICALLY from the facts of the event. Host views
 * re-render on every broadcast, so a random pick would make the line flicker
 * and change mid sentence while people are reading it.
 */

export type FlavorEvent =
  /** Hearsay: the accused guessed, and the room had a shape. */
  | {
      game: 'hearsay'
      kind: 'verdict'
      correct: boolean
      /** Every voter picked the same person. */
      unanimous: boolean
      /** The accused was the most voted answer to a question about themselves. */
      selfIncriminated: boolean
      /** Nobody in the room received a single vote except one person. */
      landslide: boolean
      round: number
    }
  /** Hearsay: a player has now been correct several rounds running. */
  | { game: 'hearsay'; kind: 'streak'; length: number; round: number }
  /** Who Said It: how the room did on one message. */
  | { game: 'whosaidit'; kind: 'reveal'; correctCount: number; total: number; round: number }
  /** Broken Telephone: how far a chain drifted. */
  | { game: 'telephone'; kind: 'chain'; drifted: boolean; failedImages: number; index: number }

const LINES: Record<string, readonly string[]> = {
  'hearsay:right': [
    'Knew exactly what they were being accused of. Suspicious.',
    'Read the room like a rent agreement.',
    'That was not a guess. That was self awareness.',
    'Correct, and now everyone knows they think about this.',
  ],
  'hearsay:right-unanimous': [
    'The room agreed and they still saw it coming.',
    'Unanimous, and read perfectly. Genuinely frightening.',
  ],
  'hearsay:wrong': [
    'No idea. None. Not a clue.',
    'Wrong, and somehow confidently wrong.',
    'The room knows them better than they know themselves.',
    'Completely wrong. Everyone else saw it immediately.',
  ],
  'hearsay:wrong-unanimous': [
    'Every single person agreed and they still missed it.',
    'The room spoke with one voice. They heard nothing.',
  ],
  'hearsay:self': [
    'The room was asked about them and answered with them.',
    'Voted for themselves, by everyone else.',
    'They are the answer to their own question.',
  ],
  'hearsay:landslide': [
    'Not close. Not close at all.',
    'One name, over and over.',
  ],
  'hearsay:streak': [
    'Three in a row. Someone has been paying attention.',
    'On a run. Nobody likes this.',
  ],
  'whosaidit:none': [
    'Nobody got it. Not one person.',
    'Zero. The group chat is a stranger to all of you.',
    'Completely unrecognised. Say it louder next time.',
  ],
  'whosaidit:all': [
    'Everybody knew. Instantly.',
    'Unmistakable. That is a personality, not a message.',
    'All of you. Not even a pause.',
  ],
  'whosaidit:most': ['Most of the room saw it coming.'],
  'whosaidit:one': ['One person knew. The rest were guessing.'],
  'telephone:drift': [
    'Nothing survived.',
    'Started somewhere. Ended somewhere else entirely.',
    'Unrecognisable by the second picture.',
  ],
  'telephone:intact': [
    'Somehow it survived.',
    'Barely changed. Disappointing, frankly.',
  ],
  'telephone:failed': ['The machine gave up on this one.'],
}

/** Stable index from the event's own facts, so the same beat always reads the same. */
function hash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function bucketFor(event: FlavorEvent): { key: string; seed: string } | null {
  if (event.game === 'hearsay' && event.kind === 'verdict') {
    const seed = `h${event.round}`
    if (event.selfIncriminated) return { key: 'hearsay:self', seed }
    if (event.correct) {
      return { key: event.unanimous ? 'hearsay:right-unanimous' : 'hearsay:right', seed }
    }
    if (event.unanimous) return { key: 'hearsay:wrong-unanimous', seed }
    if (event.landslide) return { key: 'hearsay:landslide', seed }
    return { key: 'hearsay:wrong', seed }
  }

  if (event.game === 'hearsay' && event.kind === 'streak') {
    // A streak is only worth mentioning once it is genuinely a streak.
    return event.length >= 3 ? { key: 'hearsay:streak', seed: `s${event.round}` } : null
  }

  if (event.game === 'whosaidit') {
    const seed = `w${event.round}`
    if (event.total === 0) return null
    if (event.correctCount === 0) return { key: 'whosaidit:none', seed }
    if (event.correctCount === event.total) return { key: 'whosaidit:all', seed }
    if (event.correctCount === 1) return { key: 'whosaidit:one', seed }
    if (event.correctCount > event.total / 2) return { key: 'whosaidit:most', seed }
    return null
  }

  if (event.game === 'telephone') {
    const seed = `t${event.index}`
    if (event.failedImages > 0) return { key: 'telephone:failed', seed }
    return { key: event.drifted ? 'telephone:drift' : 'telephone:intact', seed }
  }

  return null
}

/**
 * The line for a beat, or null when this beat does not deserve one.
 *
 * Null is the common case by design: commentary that fires every round stops
 * being funny and becomes wallpaper.
 */
export function flavorFor(event: FlavorEvent): string | null {
  const bucket = bucketFor(event)
  if (!bucket) return null

  const lines = LINES[bucket.key]
  if (!lines || lines.length === 0) return null

  return lines[hash(bucket.seed + bucket.key) % lines.length]
}
