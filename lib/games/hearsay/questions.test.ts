import { describe, expect, it } from 'vitest'
import { QUESTION_BANK, pickQuestion, renderQuestion } from './questions'

describe('QUESTION_BANK', () => {
  it('ships at least 20 questions', () => {
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(20)
  })

  it('has at least three mild questions in every family, so mild rooms always get same-family decoys', () => {
    const families = new Set(QUESTION_BANK.map((q) => q.family))
    for (const family of families) {
      const mild = QUESTION_BANK.filter((q) => q.family === family && q.tone === 'mild')
      expect(mild.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('has unique ids', () => {
    expect(new Set(QUESTION_BANK.map((q) => q.id)).size).toBe(QUESTION_BANK.length)
  })

  it('every question addresses the accused by placeholder', () => {
    for (const q of QUESTION_BANK) expect(q.template).toContain('{X}')
  })
})

describe('renderQuestion', () => {
  it('substitutes the accused name everywhere', () => {
    expect(renderQuestion({ id: 'q', template: 'Who would {X} call?', family: 'trust', tone: 'mild' }, 'Sam'))
      .toBe('Who would Sam call?')
  })
})

describe('pickQuestion', () => {
  it('returns three options containing the real question', () => {
    const picked = pickQuestion({ tone: 'mild', voterCount: 5, usedQuestionIds: [] })
    expect(picked.options).toHaveLength(3)
    expect(picked.options.map((q) => q.id)).toContain(picked.question.id)
  })

  it('never repeats a question that was already used', () => {
    const used = QUESTION_BANK.slice(0, 10).map((q) => q.id)
    for (let i = 0; i < 50; i++) {
      const picked = pickQuestion({ tone: 'mild', voterCount: 5, usedQuestionIds: used })
      expect(used).not.toContain(picked.question.id)
    }
  })

  it('uses decoys from other families when there are few voters', () => {
    for (let i = 0; i < 50; i++) {
      const picked = pickQuestion({ tone: 'mild', voterCount: 3, usedQuestionIds: [] })
      const decoys = picked.options.filter((q) => q.id !== picked.question.id)
      for (const decoy of decoys) expect(decoy.family).not.toBe(picked.question.family)
    }
  })

  it('uses same-family decoys when there are many voters', () => {
    for (let i = 0; i < 50; i++) {
      const picked = pickQuestion({ tone: 'mild', voterCount: 8, usedQuestionIds: [] })
      const decoys = picked.options.filter((q) => q.id !== picked.question.id)
      for (const decoy of decoys) expect(decoy.family).toBe(picked.question.family)
    }
  })

  it('only serves mild questions when the tone dial is mild', () => {
    for (let i = 0; i < 50; i++) {
      const picked = pickQuestion({ tone: 'mild', voterCount: 5, usedQuestionIds: [] })
      for (const q of picked.options) expect(q.tone).toBe('mild')
    }
  })

  it('recycles rather than crashing when every question has been used', () => {
    const allUsed = QUESTION_BANK.map((q) => q.id)
    const picked = pickQuestion({ tone: 'mild', voterCount: 5, usedQuestionIds: allUsed })
    expect(picked.options).toHaveLength(3)
  })
})
