import { describe, expect, it } from 'vitest'
import { mostFooledBy, scoreRound } from './reduce'
import { DEFAULT_CONFIG, type Round } from './state'

function round(overrides: Partial<Round> = {}): Round {
  return {
    text: 'I genuinely cannot believe you booked the flight for the wrong month again',
    authorId: 'sam',
    candidateIds: ['sam', 'mike', 'ron', 'emily'],
    guesses: { mike: 'sam', ron: 'emily', emily: 'emily' },
    awarded: {},
    ...overrides,
  }
}

describe('scoreRound', () => {
  it('pays 500 for a correct guess', () => {
    expect(scoreRound(round(), DEFAULT_CONFIG).mike).toBe(500)
  })

  it('pays nothing for a wrong guess', () => {
    const scores = scoreRound(round(), DEFAULT_CONFIG)
    expect(scores.ron ?? 0).toBe(0)
    expect(scores.emily ?? 0).toBe(0)
  })

  it('pays nothing to someone who never guessed', () => {
    expect(scoreRound(round({ guesses: {} }), DEFAULT_CONFIG)).toEqual({})
  })

  it('never pays the author for their own round', () => {
    const scores = scoreRound(round({ guesses: { sam: 'sam', mike: 'sam' } }), DEFAULT_CONFIG)
    expect(scores.sam ?? 0).toBe(0)
    expect(scores.mike).toBe(500)
  })

  it('pays everyone when the whole room gets it', () => {
    const scores = scoreRound(round({ guesses: { mike: 'sam', ron: 'sam', emily: 'sam' } }), DEFAULT_CONFIG)
    expect(scores).toEqual({ mike: 500, ron: 500, emily: 500 })
  })
})

describe('mostFooledBy', () => {
  it('names the wrong person the room agreed on', () => {
    const fooled = mostFooledBy(round({ guesses: { mike: 'ron', emily: 'ron', ron: 'sam' } }), DEFAULT_CONFIG)
    expect(fooled).toEqual({ playerIds: ['ron'], count: 2 })
  })

  it('stays quiet when only one person went wrong, because that is not a flourish', () => {
    expect(mostFooledBy(round({ guesses: { mike: 'sam', ron: 'sam', emily: 'ron' } }), DEFAULT_CONFIG)).toBeNull()
  })

  it('stays quiet when the whole room was right', () => {
    expect(mostFooledBy(round({ guesses: { mike: 'sam', ron: 'sam', emily: 'sam' } }), DEFAULT_CONFIG)).toBeNull()
  })

  it('ignores a guess cast by the author, who is never asked in a real round', () => {
    const fooled = mostFooledBy(round({ guesses: { sam: 'ron', mike: 'ron', emily: 'sam' } }), DEFAULT_CONFIG)
    expect(fooled).toBeNull()
  })

  it('reports every name tied at the top', () => {
    const fooled = mostFooledBy(
      round({ guesses: { mike: 'ron', emily: 'ron', ron: 'mike', kabir: 'mike' } }),
      DEFAULT_CONFIG
    )
    expect(fooled!.count).toBe(2)
    expect([...fooled!.playerIds].sort()).toEqual(['mike', 'ron'])
  })

  it('respects a raised threshold', () => {
    const config = { ...DEFAULT_CONFIG, mostFooledMinVotes: 3 }
    expect(mostFooledBy(round({ guesses: { mike: 'ron', emily: 'ron' } }), config)).toBeNull()
    expect(mostFooledBy(round({ guesses: { mike: 'ron', emily: 'ron', ron: 'ron' } }), config)!.count).toBe(3)
  })
})
