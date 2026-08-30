// lib/games/whosaidit/parse.ts
//
// Everything in this file runs in the host's browser tab and nowhere else.
// The chat is the group's actual WhatsApp history, so it must never be sent
// to a server, logged, or put on the public channel. Only the handful of
// messages the reducer picks for rounds ever leave this module.

export type ChatMessage = {
  id: string
  author: string
  text: string
}

export type AuthorStat = {
  author: string
  /** Messages that survived parsing. */
  total: number
  /** Of those, how many the quality filter would actually put on screen. */
  usable: number
}

/** Below this a message is a reaction, above it nobody reads it off a stream. */
export const MIN_LENGTH = 25
export const MAX_LENGTH = 200
export const MIN_WORDS = 4

// `[12/01/24, 9:41:03 PM] Name: message`
const BRACKET_LINE =
  /^‎?\[(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*([APap]\.?[Mm]\.?)?\s*\]\s*‎?(.*)$/

// `12/01/2024, 21:41 - Name: message`
const DASH_LINE =
  /^‎?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*([APap]\.?[Mm]\.?)?\s+-\s+(.*)$/

/** `Name: text`. The author half may not contain a colon, so a colon inside
 *  the message body is never mistaken for the separator. */
const AUTHOR_SPLIT = /^([^:\n]{1,40}):[ \t]?([\s\S]*)$/

const EDITED_MARKER = /\s*‎?<This message was edited>\s*$/

/** Lines WhatsApp writes itself. Most have no `Name:` and are dropped by the
 *  author split, but a few slip through, so they are matched explicitly. */
const SYSTEM_LINE =
  /(end-to-end encrypted|created group|added you|joined using this group|changed the subject|changed this group|changed their phone number|changed the group description|left$|was added|was removed|removed |pinned a message|turned on disappearing|security code changed|You deleted this message|This message was deleted|missed voice call|missed video call)/i

/** Attachment placeholders across the locale variants people actually export. */
const PLACEHOLDER =
  /^(<media omitted>|<attached:.*>|(image|video|audio|sticker|gif|document|contact card|photo)( file)? omitted|null|this message was deleted|you deleted this message)$/i

const URL_ANYWHERE = /(https?:\/\/|www\.)\S+/i
const LINK_ONLY = /^\s*(?:(?:https?:\/\/|www\.)\S+\s*)+$/i

/** No \p{...}: the tsconfig target predates Unicode property escapes. The
 *  surrogate range covers every emoji; the rest covers arrows, dingbats and
 *  the stray punctuation people send on its own. */
const SYMBOLS_ONLY =
  /^[\s‍️ -⁯←-⯿⸀-⹿　-〿\ud800-\udfff!?.,~^]+$/

const REACTIONS = new Set([
  'ok', 'okay', 'oki', 'k', 'kk', 'yes', 'yeah', 'yep', 'yup', 'ya', 'yaa', 'no', 'nope', 'nah',
  'lol', 'lmao', 'lmfao', 'rofl', 'omg', 'omfg', 'wow', 'oh', 'ohh', 'ah', 'ahh', 'ha', 'haha',
  'hehe', 'hihi', 'hmm', 'hm', 'hmmm', 'fine', 'cool', 'nice', 'sure', 'true', 'same', 'thanks',
  'thanku', 'thankyou', 'ty', 'thx', 'bro', 'bruh', 'please', 'pls', 'plz', 'done', 'great',
  'good', 'bad', 'hi', 'hey', 'hello', 'bye', 'gm', 'gn', 'xd', 'yay', 'ugh', 'meh', 'wait',
  'right', 'exactly', 'obviously', 'ofc', 'sorry', 'congrats', 'noted', 'cute', 'lmaoo',
])

/** Laughter of any length: haha, hahaha, hehehe, hahahaha. */
const LAUGHTER = /^(?:a?h[aeiou]){2,}h?$/i

/** Words that tend to mark a message as somebody's own voice rather than admin. */
const VOICE_WORDS = [
  'genuinely', 'literally', 'honestly', 'actually', 'swear', 'obsessed', 'insane', 'unhinged',
  'never', 'always', 'refuse', 'apparently', 'somehow', 'absolutely', 'furious', 'crying',
  'screaming', 'begging', 'obviously', 'deserve', 'personally', 'frankly', 'hate', 'love',
]

const FIRST_PERSON = /\b(i|i'm|im|i've|i'll|my|me|mine|myself)\b/i

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

/** Lowercased, stripped of everything that is not a letter or a digit. */
function bare(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9']/g, '')
}

function isReactionOnly(text: string): boolean {
  const parts = words(text).map(bare).filter(Boolean)
  if (parts.length === 0) return true
  return parts.every((w) => REACTIONS.has(w) || LAUGHTER.test(w))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Name tokens worth blocking. Short and numeric tokens are dropped: a two
 * letter nickname matches half the dictionary, and an author saved as a phone
 * number would otherwise blocklist every digit in the chat.
 */
function nameTokens(names: readonly string[]): string[] {
  const tokens = new Set<string>()
  for (const name of names) {
    const trimmed = name.trim()
    if (trimmed.length >= 3 && /[a-z]/i.test(trimmed)) tokens.add(trimmed.toLowerCase())
    for (const part of trimmed.split(/[\s,._-]+/)) {
      if (part.length >= 3 && /^[a-z]+$/i.test(part)) tokens.add(part.toLowerCase())
    }
  }
  return [...tokens]
}

function mentionsAnyName(text: string, names: readonly string[]): boolean {
  const tokens = nameTokens(names)
  if (tokens.length === 0) return false
  const pattern = new RegExp(`(^|[^a-z0-9])(${tokens.map(escapeRegExp).join('|')})([^a-z0-9]|$)`, 'i')
  return pattern.test(text)
}

export type QualityOptions = {
  /** Other people in the chat. A message naming one of them gives the answer away. */
  otherNames?: readonly string[]
}

/**
 * Zero means unplayable. Anything above zero is a rank: higher is more likely
 * to be funny or revealing out of context, which is the entire game. A random
 * message from a group chat is "ok" or "haha", so this filter is the
 * difference between a good round and an unplayable one.
 */
export function messageQuality(text: string, options: QualityOptions = {}): number {
  const trimmed = text.trim()

  if (trimmed.length < MIN_LENGTH || trimmed.length > MAX_LENGTH) return 0
  if (words(trimmed).length < MIN_WORDS) return 0
  if (URL_ANYWHERE.test(trimmed)) return 0
  if (SYMBOLS_ONLY.test(trimmed)) return 0
  if (isReactionOnly(trimmed)) return 0
  if (mentionsAnyName(trimmed, options.otherNames ?? [])) return 0

  const parts = words(trimmed)
  const bareParts = parts.map(bare).filter(Boolean)
  let score = 1

  // Long enough to have a shape, short enough to read off a compressed stream.
  if (trimmed.length >= 40 && trimmed.length <= 160) score += 2
  if (parts.length >= 7) score += 1
  if (/[?!]/.test(trimmed)) score += 1
  if (FIRST_PERSON.test(trimmed)) score += 1
  if (VOICE_WORDS.some((w) => bareParts.includes(w))) score += 1

  // Repetition is padding, and padding reads as nothing.
  const variety = new Set(bareParts).size / Math.max(1, bareParts.length)
  if (variety > 0.85) score += 1

  return score
}

export function isUsableMessage(text: string, options: QualityOptions = {}): boolean {
  return messageQuality(text, options) > 0
}

function cleanBody(raw: string): string | null {
  const text = raw.replace(EDITED_MARKER, '').replace(/‎/g, '').trim()
  if (!text) return null
  if (PLACEHOLDER.test(text)) return null
  if (LINK_ONLY.test(text)) return null
  if (SYMBOLS_ONLY.test(text)) return null
  return text
}

/**
 * Parses both common WhatsApp export shapes. Anything that is not a message a
 * human typed is dropped here; judging whether a real message is worth showing
 * is a separate pass, because the mapping UI needs the raw counts too.
 */
export function parseWhatsAppExport(raw: string): ChatMessage[] {
  const messages: ChatMessage[] = []
  let pending: { author: string; parts: string[] } | null = null
  let counter = 0

  const flush = () => {
    if (!pending) return
    const text = cleanBody(pending.parts.join(' '))
    if (text) messages.push({ id: `m${counter++}`, author: pending.author, text })
    pending = null
  }

  for (const line of raw.split(/\r?\n/)) {
    const match = BRACKET_LINE.exec(line) ?? DASH_LINE.exec(line)

    if (!match) {
      // A line with no timestamp is the rest of the message above it. With no
      // message above it, it is not part of an export at all.
      if (pending) pending.parts.push(line.trim())
      continue
    }

    flush()

    const remainder = match[4].trim()
    const split = AUTHOR_SPLIT.exec(remainder)
    if (!split) continue // a system line: no author, nothing to attribute
    if (SYSTEM_LINE.test(remainder)) continue

    const author = split[1].trim()
    if (!author) continue
    pending = { author, parts: [split[2]] }
  }

  flush()
  return messages
}

/** Per author counts for the lobby mapping screen, loudest first. */
export function authorStats(messages: readonly ChatMessage[]): AuthorStat[] {
  const authors = [...new Set(messages.map((m) => m.author))]
  const stats = authors.map((author) => {
    const mine = messages.filter((m) => m.author === author)
    const others = authors.filter((a) => a !== author)
    return {
      author,
      total: mine.length,
      usable: mine.filter((m) => isUsableMessage(m.text, { otherNames: others })).length,
    }
  })
  return stats.sort((a, b) => b.total - a.total || a.author.localeCompare(b.author))
}

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export type ChooseOptions = {
  /** Chat authors that are mapped to a player in the lobby. */
  authors: readonly string[]
  count: number
}

/**
 * Picks the rounds. Only mapped authors are eligible, only quality messages
 * survive, and the picks are dealt round robin so the loudest person in the
 * chat does not become the answer to every round.
 */
export function chooseRoundMessages(
  messages: readonly ChatMessage[],
  { authors, count }: ChooseOptions
): ChatMessage[] {
  const eligible = new Set(authors)

  const byAuthor = new Map<string, ChatMessage[]>()
  for (const author of authors) {
    const others = authors.filter((a) => a !== author)
    const mine = messages
      .filter((m) => m.author === author && eligible.has(m.author))
      .map((m) => ({ message: m, quality: messageQuality(m.text, { otherNames: others }) }))
      .filter((m) => m.quality > 0)

    // Shuffle before the sort so equal scores do not always resolve to the
    // same messages, then take the best. Two sessions on one export should
    // not be the same ten rounds.
    const ranked = shuffled(mine)
      .sort((a, b) => b.quality - a.quality)
      .map((m) => m.message)
    if (ranked.length > 0) byAuthor.set(author, ranked)
  }

  const picked: ChatMessage[] = []
  const queue = shuffled([...byAuthor.keys()])
  let round = 0

  while (picked.length < count) {
    let tookOne = false
    for (const author of queue) {
      const available = byAuthor.get(author)!
      if (round >= available.length) continue
      picked.push(available[round])
      tookOne = true
      if (picked.length >= count) break
    }
    if (!tookOne) break
    round++
  }

  return shuffled(picked)
}
