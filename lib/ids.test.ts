import { describe, expect, it } from 'vitest'
import { CODE_ALPHABET, newPlayerId, newRoomCode } from './ids'

describe('newRoomCode', () => {
  it('is four characters long', () => {
    expect(newRoomCode()).toHaveLength(4)
  })

  it('only uses the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      for (const ch of newRoomCode()) {
        expect(CODE_ALPHABET).toContain(ch)
      }
    }
  })

  it('excludes characters that are misread over a compressed video stream', () => {
    expect(CODE_ALPHABET).not.toContain('I')
    expect(CODE_ALPHABET).not.toContain('O')
    expect(CODE_ALPHABET).not.toContain('0')
    expect(CODE_ALPHABET).not.toContain('1')
  })
})

describe('newPlayerId', () => {
  it('produces distinct ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newPlayerId()))
    expect(ids.size).toBe(500)
  })
})
