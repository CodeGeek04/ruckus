import { describe, expect, it } from 'vitest'
import { privateChannel, publicChannel } from './channels'

describe('channels', () => {
  it('namespaces the public channel under room', () => {
    expect(publicChannel('BLOB')).toBe('/room/BLOB')
  })

  it('puts each player on their own nested channel', () => {
    expect(privateChannel('BLOB', 'p-abc')).toBe('/room/BLOB/p/p-abc')
  })

  it('uppercases the code so a typed lowercase code still joins', () => {
    expect(publicChannel('blob')).toBe('/room/BLOB')
    expect(privateChannel('blob', 'p-abc')).toBe('/room/BLOB/p/p-abc')
  })
})
