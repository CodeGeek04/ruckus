import { describe, expect, it } from 'vitest'
import { flavorFor, type FlavorEvent } from './flavor'

const verdict = (over: Partial<Extract<FlavorEvent, { kind: 'verdict' }>> = {}): FlavorEvent => ({
  game: 'hearsay',
  kind: 'verdict',
  correct: false,
  unanimous: false,
  selfIncriminated: false,
  landslide: false,
  round: 1,
  ...over,
})

describe('flavorFor', () => {
  it('is deterministic, because host views re-render constantly', () => {
    // A random pick would make the line change under the reader mid sentence.
    const event = verdict({ correct: true, round: 4 })
    const first = flavorFor(event)
    for (let i = 0; i < 50; i++) expect(flavorFor(event)).toBe(first)
  })

  it('gives different rounds different lines rather than repeating one', () => {
    const lines = new Set(
      Array.from({ length: 8 }, (_, round) => flavorFor(verdict({ correct: false, round })))
    )
    expect(lines.size).toBeGreaterThan(1)
  })

  it('picks the most specific bucket available', () => {
    expect(flavorFor(verdict({ selfIncriminated: true, correct: true }))).toContain('them')
    expect(flavorFor(verdict({ correct: true, unanimous: true }))).toMatch(/unanimous|room agreed/i)
  })

  it('stays quiet on an unremarkable streak', () => {
    expect(flavorFor({ game: 'hearsay', kind: 'streak', length: 2, round: 3 })).toBeNull()
    expect(flavorFor({ game: 'hearsay', kind: 'streak', length: 3, round: 3 })).not.toBeNull()
  })

  it('speaks up when the room is unanimous in either direction', () => {
    expect(flavorFor({ game: 'whosaidit', kind: 'reveal', correctCount: 0, total: 4, round: 1 })).not.toBeNull()
    expect(flavorFor({ game: 'whosaidit', kind: 'reveal', correctCount: 4, total: 4, round: 1 })).not.toBeNull()
  })

  it('stays quiet on a middling result', () => {
    expect(flavorFor({ game: 'whosaidit', kind: 'reveal', correctCount: 2, total: 6, round: 1 })).toBeNull()
  })

  it('never throws and never returns an empty string, whatever it is handed', () => {
    const events: FlavorEvent[] = [
      verdict({ correct: true, unanimous: true, selfIncriminated: true, landslide: true }),
      { game: 'hearsay', kind: 'streak', length: 99, round: 0 },
      { game: 'whosaidit', kind: 'reveal', correctCount: 0, total: 0, round: 0 },
      { game: 'telephone', kind: 'chain', drifted: true, failedImages: 0, index: 0 },
      { game: 'telephone', kind: 'chain', drifted: false, failedImages: 3, index: 2 },
    ]
    for (const event of events) {
      const line = flavorFor(event)
      expect(line === null || line.length > 0).toBe(true)
    }
  })

  it('never uses an em dash', () => {
    const rounds = Array.from({ length: 30 }, (_, round) => [
      flavorFor(verdict({ round, correct: round % 2 === 0 })),
      flavorFor({ game: 'whosaidit', kind: 'reveal', correctCount: 0, total: 4, round }),
      flavorFor({ game: 'telephone', kind: 'chain', drifted: true, failedImages: 0, index: round }),
    ])
    for (const line of rounds.flat()) {
      if (line) expect(line).not.toContain('—')
    }
  })
})
