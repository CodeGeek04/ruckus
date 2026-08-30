import { describe, expect, it } from 'vitest'
import { readStoredSource } from './source'

const messages = [{ id: 'm0', author: 'shivam', text: 'I genuinely cannot believe that' }]

describe('readStoredSource', () => {
  it('reads back what the lobby stored', () => {
    const stored = JSON.stringify({
      messages,
      authors: { shivam: { included: true, playerId: 'sam' }, kushagra: { included: true, playerId: null } },
    })
    expect(readStoredSource(stored)).toEqual({
      messages,
      authors: { shivam: { included: true, playerId: 'sam' }, kushagra: { included: true, playerId: null } },
    })
  })

  it('migrates last session cache, which mapped authors to players', () => {
    const legacy = JSON.stringify({ messages, mapping: { shivam: 'sam', bot: null } })
    expect(readStoredSource(legacy)).toEqual({
      messages,
      authors: { shivam: { included: true, playerId: 'sam' }, bot: { included: false, playerId: null } },
    })
  })

  it('throws nothing away quietly but never crashes on rubbish', () => {
    expect(readStoredSource(null)).toBeNull()
    expect(readStoredSource('not json at all')).toBeNull()
    expect(readStoredSource('null')).toBeNull()
    expect(readStoredSource('{}')).toBeNull()
    expect(readStoredSource(JSON.stringify({ messages }))).toBeNull()
    expect(readStoredSource(JSON.stringify({ messages, authors: { shivam: 'sam' } }))).toBeNull()
    expect(readStoredSource(JSON.stringify({ messages, authors: { shivam: { playerId: 'sam' } } }))).toBeNull()
    expect(readStoredSource(JSON.stringify({ messages: 'nope', mapping: {} }))).toBeNull()
  })
})
