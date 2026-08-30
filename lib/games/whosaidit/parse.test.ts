import { describe, expect, it } from 'vitest'
import {
  authorStats,
  chooseRoundMessages,
  isUsableMessage,
  messageQuality,
  parseWhatsAppExport,
} from './parse'

/** iOS style export: square brackets, 12 hour clock, seconds. */
const BRACKET_EXPORT = [
  '[12/01/24, 9:40:00 PM] Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.',
  '[12/01/24, 9:41:03 PM] Shivam: honestly I have been awake for thirty one hours and I feel incredible',
  '[12/01/24, 9:41:40 PM] Riya: <Media omitted>',
  '[12/01/24, 9:42:10 PM] Riya: ok',
  '[12/01/24, 9:43:00 PM] Aman: I genuinely cannot believe you booked the flight for the wrong month again',
  '[12/01/24, 9:43:30 PM] Aman: https://www.makemytrip.com/flights/deal',
  '[12/01/24, 9:44:00 PM] Riya: 😂😂😂',
  '[12/01/24, 9:45:00 PM] Shivam: This message was deleted',
  '[12/01/24, 9:46:00 PM] Riya added Kabir',
  '[12/01/24, 9:47:12 PM] Kabir: my landlord just called to tell me the geyser is a personality',
  'and I am not equipped for this conversation',
  '[12/01/24, 9:48:00 PM] Aman: Riya said the exact same thing to me last week about the geyser',
].join('\n')

/** Android style export: no brackets, 24 hour clock, dash before the author. */
const DASH_EXPORT = [
  '12/01/2024, 21:40 - Messages and calls are end-to-end encrypted.',
  "12/01/2024, 21:40 - Riya created group \"the group\"",
  '12/01/2024, 21:41 - Shivam: honestly I have been awake for thirty one hours and I feel incredible',
  '12/01/2024, 21:42 - Riya: <Media omitted>',
  '12/01/2024, 21:43 - Aman: I genuinely cannot believe you booked the flight for the wrong month again',
  '12/01/2024, 21:44 - Kabir: my landlord just called to tell me the geyser is a personality',
  '12/01/2024, 21:45 - Shivam: lol',
  '12/01/2024, 21:46 - Kabir left',
  '12/01/2024, 21:47 - Riya changed the subject to "the group but worse"',
].join('\n')

describe('filler and attachment rejection', () => {
  // From the real export: these survived the earlier thresholds.
  it('rejects a file attachment line masquerading as a message', () => {
    expect(isUsableMessage('Payment_Receipt_1778083532690.pdf • 2 pages')).toBe(false)
    expect(isUsableMessage('here is the deck IMG_20260101.jpeg have a look')).toBe(false)
  })

  it('rejects a four word fragment with no voice', () => {
    expect(isUsableMessage('Door lock, exhaust, chimney')).toBe(false)
  })

  it('rejects a paragraph that would not fit a shared screen', () => {
    expect(isUsableMessage('a'.repeat(60) + ' ' + 'word '.repeat(30))).toBe(false)
  })

  it('keeps a real five word line', () => {
    expect(isUsableMessage('Subha kitne baje ka bolu?')).toBe(true)
  })
})

describe('real export shapes', () => {
  // These come from an actual iOS export. Fixtures did not catch either case.
  it('strips the bidi isolates WhatsApp wraps mentions in', () => {
    const [msg] = parseWhatsAppExport('[24/03/26, 8:40:49 PM] Vamsi: \u2068@\u2069\u2068Abhishek\u2069 flat pe nahi h kya')
    expect(msg.text).not.toContain('\u2068')
    expect(msg.text).not.toContain('@')
    expect(msg.text).toBe('flat pe nahi h kya')
  })

  it('strips a media placeholder appended to real text', () => {
    const [msg] = parseWhatsAppExport('[24/03/26, 8:40:49 PM] Mohan: I am obsessed with this chart \u200eimage omitted')
    expect(msg.text).toBe('I am obsessed with this chart')
  })

  it('drops a message that is only a mention and an attachment', () => {
    const msgs = parseWhatsAppExport('[24/03/26, 8:40:49 PM] Dhruv: \u2068@\u2069\u2068Vamsi\u2069 \u200eimage omitted')
    expect(msgs).toHaveLength(0)
  })

  it('handles every iOS attachment wording', () => {
    for (const kind of ['image', 'video', 'audio', 'sticker', 'GIF', 'document', 'Contact card']) {
      const msgs = parseWhatsAppExport(`[24/03/26, 8:40:49 PM] Sam: real words here \u200e${kind} omitted`)
      expect(msgs[0]?.text, kind).toBe('real words here')
    }
  })
})

describe('parseWhatsAppExport', () => {
  it('reads the bracketed iOS format', () => {
    const messages = parseWhatsAppExport(BRACKET_EXPORT)
    expect(messages.map((m) => m.author)).toContain('Shivam')
    expect(messages.find((m) => m.author === 'Shivam')!.text).toBe(
      'honestly I have been awake for thirty one hours and I feel incredible'
    )
  })

  it('reads the dashed Android format', () => {
    const messages = parseWhatsAppExport(DASH_EXPORT)
    expect(messages.find((m) => m.author === 'Aman')!.text).toBe(
      'I genuinely cannot believe you booked the flight for the wrong month again'
    )
  })

  it('skips the encryption notice and other system lines', () => {
    for (const raw of [BRACKET_EXPORT, DASH_EXPORT]) {
      const texts = parseWhatsAppExport(raw).map((m) => m.text)
      expect(texts.some((t) => t.includes('end-to-end encrypted'))).toBe(false)
      expect(texts.some((t) => t.includes('changed the subject'))).toBe(false)
      expect(texts.some((t) => t.includes('created group'))).toBe(false)
      expect(texts.some((t) => t.includes('left'))).toBe(false)
      expect(texts.some((t) => t.includes('added'))).toBe(false)
    }
  })

  it('drops media placeholders and deleted messages', () => {
    const texts = parseWhatsAppExport(BRACKET_EXPORT).map((m) => m.text)
    expect(texts).not.toContain('<Media omitted>')
    expect(texts).not.toContain('This message was deleted')
  })

  it('drops messages that are only a link or only emoji', () => {
    const texts = parseWhatsAppExport(BRACKET_EXPORT).map((m) => m.text)
    expect(texts.some((t) => t.startsWith('https://'))).toBe(false)
    expect(texts).not.toContain('😂😂😂')
  })

  it('joins a continuation line onto the message it belongs to', () => {
    const kabir = parseWhatsAppExport(BRACKET_EXPORT).find((m) => m.author === 'Kabir')!
    expect(kabir.text).toBe(
      'my landlord just called to tell me the geyser is a personality and I am not equipped for this conversation'
    )
  })

  it('keeps short reactions at parse time, because filtering them is the quality pass', () => {
    expect(parseWhatsAppExport(BRACKET_EXPORT).some((m) => m.text === 'ok')).toBe(true)
    expect(parseWhatsAppExport(DASH_EXPORT).some((m) => m.text === 'lol')).toBe(true)
  })

  it('gives every message a distinct id', () => {
    const messages = parseWhatsAppExport(BRACKET_EXPORT)
    expect(new Set(messages.map((m) => m.id)).size).toBe(messages.length)
  })

  it('strips the edited marker', () => {
    const [message] = parseWhatsAppExport('[12/01/24, 9:41:03 PM] Sam: I think we should cancel it ‎<This message was edited>')
    expect(message.text).toBe('I think we should cancel it')
  })

  it('handles CRLF line endings, which is what a Windows download actually has', () => {
    const messages = parseWhatsAppExport(BRACKET_EXPORT.split('\n').join('\r\n'))
    expect(messages.find((m) => m.author === 'Shivam')!.text).not.toMatch(/\r/)
  })

  it('returns nothing at all for a file that is not a WhatsApp export', () => {
    expect(parseWhatsAppExport('just some notes\nabout nothing in particular')).toEqual([])
  })

  it('does not mistake a colon inside a message for the author separator', () => {
    const [message] = parseWhatsAppExport('[12/01/24, 9:41:03 PM] Sam: the meeting is at 6: bring nothing at all')
    expect(message.author).toBe('Sam')
    expect(message.text).toBe('the meeting is at 6: bring nothing at all')
  })
})

describe('messageQuality', () => {
  const good = 'I genuinely cannot believe you booked the flight for the wrong month again'

  it('accepts a message with real voice in it', () => {
    expect(messageQuality(good)).toBeGreaterThan(0)
  })

  it('rejects anything shorter than the floor', () => {
    expect(messageQuality('yeah sounds good to me')).toBe(0)
  })

  it('rejects anything longer than the ceiling', () => {
    expect(messageQuality('so ' + 'the thing about that is that '.repeat(20))).toBe(0)
  })

  it('rejects a message with fewer than four words', () => {
    expect(messageQuality('absolutely unbelievable behaviour')).toBe(0)
  })

  it('rejects a pure reaction however long it is padded out', () => {
    expect(messageQuality('hahahaha lol lmao haha omg hahaha lol')).toBe(0)
    expect(messageQuality('ok ok ok okay yes yes fine ok')).toBe(0)
  })

  it('rejects a message containing a link, because the link is not the voice', () => {
    expect(messageQuality('look at this thing I found https://example.com/a/b/c it is unreal')).toBe(0)
  })

  it('rejects a message that names another participant, because that is the answer', () => {
    expect(messageQuality('I genuinely think Riya has lost the plot about the geyser', { otherNames: ['Riya'] })).toBe(0)
  })

  it('matches a participant name case insensitively and only on whole words', () => {
    expect(messageQuality('I genuinely think riya has lost the plot about the geyser', { otherNames: ['Riya Sharma'] })).toBe(0)
    // "amanda" contains "aman" but is not Aman.
    expect(messageQuality('amanda from the office asked me about the deposit again today', { otherNames: ['Aman'] })).toBeGreaterThan(0)
  })

  it('ignores short and numeric name tokens so a phone number author blocks nothing', () => {
    expect(messageQuality(good, { otherNames: ['+91 98765 43210', 'Jo'] })).toBeGreaterThan(0)
  })

  it('scores a distinctive message above a flat one of the same length', () => {
    const flat = 'we can probably do that later in the week if that works for everyone'
    expect(messageQuality(good)).toBeGreaterThan(messageQuality(flat))
  })

  it('agrees with isUsableMessage', () => {
    expect(isUsableMessage(good)).toBe(true)
    expect(isUsableMessage('ok')).toBe(false)
  })
})

describe('authorStats', () => {
  it('counts every author and how many of their messages are actually playable', () => {
    const stats = authorStats(parseWhatsAppExport(BRACKET_EXPORT))
    const riya = stats.find((s) => s.author === 'Riya')!
    expect(riya.total).toBe(1) // only "ok" survives parsing
    expect(riya.usable).toBe(0)

    const shivam = stats.find((s) => s.author === 'Shivam')!
    expect(shivam.usable).toBe(1)
  })

  it('sorts the loudest author first, so the lobby list leads with the people who matter', () => {
    const stats = authorStats(parseWhatsAppExport(BRACKET_EXPORT))
    for (let i = 1; i < stats.length; i++) {
      expect(stats[i - 1].total).toBeGreaterThanOrEqual(stats[i].total)
    }
  })

  it('excludes a message naming another author from that author usable count', () => {
    const stats = authorStats(parseWhatsAppExport(BRACKET_EXPORT))
    // Aman's second surviving line names Riya, so only one of his two counts.
    expect(stats.find((s) => s.author === 'Aman')!.usable).toBe(1)
  })
})

describe('chooseRoundMessages', () => {
  const many = (author: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${author}-${i}`,
      author,
      text: `I genuinely cannot believe you booked the ${'very '.repeat(i % 3)}wrong month again number ${i}`,
    }))

  const pool = [...many('Shivam', 8), ...many('Aman', 8), ...many('Kabir', 8)]

  it('returns only messages from the requested authors', () => {
    const picked = chooseRoundMessages(pool, { authors: ['Shivam', 'Aman'], count: 6 })
    expect(picked.every((m) => m.author === 'Shivam' || m.author === 'Aman')).toBe(true)
  })

  it('returns at most the requested count', () => {
    expect(chooseRoundMessages(pool, { authors: ['Shivam', 'Aman', 'Kabir'], count: 10 })).toHaveLength(10)
  })

  it('spreads rounds across authors rather than emptying the loudest one first', () => {
    const picked = chooseRoundMessages(pool, { authors: ['Shivam', 'Aman', 'Kabir'], count: 9 })
    for (const author of ['Shivam', 'Aman', 'Kabir']) {
      expect(picked.filter((m) => m.author === author)).toHaveLength(3)
    }
  })

  it('never repeats a message', () => {
    const picked = chooseRoundMessages(pool, { authors: ['Shivam', 'Aman', 'Kabir'], count: 20 })
    expect(new Set(picked.map((m) => m.id)).size).toBe(picked.length)
  })

  it('drops messages that name one of the other chosen authors', () => {
    const withName = [
      ...many('Shivam', 4),
      ...many('Aman', 4),
      ...many('Kabir', 4),
      { id: 'leak', author: 'Shivam', text: 'I genuinely think Kabir has lost the plot about the geyser today' },
    ]
    const picked = chooseRoundMessages(withName, { authors: ['Shivam', 'Aman', 'Kabir'], count: 13 })
    expect(picked.map((m) => m.id)).not.toContain('leak')
  })

  it('returns fewer than asked rather than padding with rubbish', () => {
    expect(chooseRoundMessages(many('Shivam', 2), { authors: ['Shivam'], count: 10 })).toHaveLength(2)
  })
})
