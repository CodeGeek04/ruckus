import { describe, expect, it } from 'vitest'
import { mostFooledBy, scoreRound } from './reduce'
import { DEFAULT_CONFIG, type Round } from './state'

function round(overrides: Partial<Round> = {}): Round {
  return {
    text: 'I genuinely cannot believe you booked the flight for the wrong month again',
    author: 'shivam',
    authorPlayerId: 'sam',
    candidates: ['shivam', 'riya', 'aman', 'kushagra'],
    guesses: { mike: 'shivam', ron: 'kushagra', emily: 'kushagra' },
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
    const scores = scoreRound(round({ guesses: { sam: 'shivam', mike: 'shivam' } }), DEFAULT_CONFIG)
    expect(scores.sam ?? 0).toBe(0)
    expect(scores.mike).toBe(500)
  })

  it('pays everyone when the whole room gets it', () => {
    const scores = scoreRound(round({ guesses: { mike: 'shivam', ron: 'shivam', emily: 'shivam' } }), DEFAULT_CONFIG)
    expect(scores).toEqual({ mike: 500, ron: 500, emily: 500 })
  })
})

describe('mostFooledBy', () => {
  it('names the wrong author the room agreed on', () => {
    const fooled = mostFooledBy(round({ guesses: { mike: 'aman', emily: 'aman', ron: 'shivam' } }), DEFAULT_CONFIG)
    expect(fooled).toEqual({ authors: ['aman'], count: 2 })
  })

  it('stays quiet when only one person went wrong, because that is not a flourish', () => {
    expect(mostFooledBy(round({ guesses: { mike: 'shivam', ron: 'shivam', emily: 'aman' } }), DEFAULT_CONFIG)).toBeNull()
  })

  it('stays quiet when the whole room was right', () => {
    expect(mostFooledBy(round({ guesses: { mike: 'shivam', ron: 'shivam', emily: 'shivam' } }), DEFAULT_CONFIG)).toBeNull()
  })

  it('ignores a guess cast by the author, who is never asked in a real round', () => {
    const fooled = mostFooledBy(round({ guesses: { sam: 'aman', mike: 'aman', emily: 'shivam' } }), DEFAULT_CONFIG)
    expect(fooled).toBeNull()
  })

  it('reports every author tied at the top', () => {
    const fooled = mostFooledBy(
      round({ guesses: { mike: 'aman', emily: 'aman', ron: 'riya', kabir: 'riya' } }),
      DEFAULT_CONFIG
    )
    expect(fooled!.count).toBe(2)
    expect([...fooled!.authors].sort()).toEqual(['aman', 'riya'])
  })

  it('respects a raised threshold', () => {
    const config = { ...DEFAULT_CONFIG, mostFooledMinVotes: 3 }
    expect(mostFooledBy(round({ guesses: { mike: 'aman', emily: 'aman' } }), config)).toBeNull()
    expect(mostFooledBy(round({ guesses: { mike: 'aman', emily: 'aman', ron: 'aman' } }), config)!.count).toBe(3)
  })
})
