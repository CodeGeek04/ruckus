import { describe, expect, it } from 'vitest'
import { cleanName, initials, truncate, truncateName } from './text'

/** A lone surrogate is the thing AppSync rejects, so nothing may produce one. */
const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

const POPPER = '\u{1F389}'

describe('truncate', () => {
  it('leaves short strings alone', () => {
    expect(truncate('Mittal', 12)).toBe('Mittal')
  })

  it('counts code points, not UTF-16 units', () => {
    expect(truncate(POPPER.repeat(7), 3)).toBe(POPPER.repeat(3))
  })

  it('never cuts an emoji in half', () => {
    // 'a' plus twelve emoji: a naive slice(0, 12) lands inside the sixth one
    // and leaves a lone surrogate. A name like that could not be published at
    // all, so that player could never join and the room could never start.
    const name = `a${POPPER.repeat(12)}`
    expect(name.slice(0, 12)).toMatch(lone)
    expect(truncate(name, 12)).not.toMatch(lone)
    expect(truncate(name, 12)).toBe(`a${POPPER.repeat(11)}`)
  })
})

describe('cleanName', () => {
  it('keeps an ordinary name', () => {
    expect(cleanName('Sarthak')).toBe('Sarthak')
  })

  it('rejects anything that is not a string', () => {
    expect(cleanName(undefined)).toBe('')
    expect(cleanName(42)).toBe('')
  })

  it('cuts a 200 character name down to the limit', () => {
    expect(cleanName('A'.repeat(200))).toBe('A'.repeat(12))
  })

  it('collapses whitespace and trims', () => {
    expect(cleanName('  Vamsi   K  ')).toBe('Vamsi K')
  })

  it('is empty for a name made only of whitespace', () => {
    expect(cleanName('     ')).toBe('')
  })

  it('drops bidi overrides that would reorder the screen around them', () => {
    expect(cleanName('ok‮gnol')).toBe('okgnol')
  })

  it('drops control characters', () => {
    expect(cleanName('a\u0000b\u001fc')).toBe('abc')
  })

  it('is empty when nothing usable is left, so the join is refused', () => {
    expect(cleanName('‮​‎')).toBe('')
  })

  it('leaves HTML as inert text rather than trying to be clever', () => {
    // React escapes it on render. Mangling it here would only hide the input.
    expect(cleanName('<img src=x onerror=alert(1)>')).toBe('<img src=x o')
  })

  it('never emits a lone surrogate', () => {
    const names = [
      `a${POPPER.repeat(6)}`,
      '\u{1F468}‍\u{1F469}‍\u{1F467}'.repeat(2),
      '\u{1F1EE}\u{1F1F3}'.repeat(9),
      '\uD83C',
    ]
    for (const name of names) expect(cleanName(name)).not.toMatch(lone)
  })
})

describe('truncateName', () => {
  it('keeps trailing spaces so a name can still be typed', () => {
    expect(truncateName('Mit ')).toBe('Mit ')
  })

  it('stops at twelve code points', () => {
    expect([...truncateName(POPPER.repeat(30))]).toHaveLength(12)
  })
})

describe('initials', () => {
  it('takes two code points, not two UTF-16 units', () => {
    expect(initials(POPPER.repeat(3))).toBe(POPPER.repeat(2))
    expect(initials(POPPER.repeat(3))).not.toMatch(lone)
  })

  it('uppercases a normal name', () => {
    expect(initials('mittal')).toBe('MI')
  })
})
