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
