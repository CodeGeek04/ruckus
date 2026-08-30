// lib/games/whosaidit/source.ts
//
// The imported chat, held in the host tab. Separate from index.ts so the lobby
// setup component can reach it without importing the module that renders it.
import type { Player } from '@/lib/types'
import { buildRounds } from './reduce'
import { DEFAULT_CONFIG, type ChatSource } from './state'

export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 12

const EMPTY: ChatSource = { messages: [], mapping: {} }

/**
 * A module level value rather than an init argument, because the GameModule
 * contract keeps init to one parameter so every game stays interchangeable.
 * It is never put on a channel: only the messages the reducer picks for rounds
 * ever reach a phone, and the rest of the export stays in this tab.
 */
let source: ChatSource = EMPTY
let hydrated = false
const listeners = new Set<() => void>()

/** Same tab, same browser. Survives a host refresh, exactly like the snapshot. */
const SOURCE_KEY = 'ruckus:whosaidit:chat'

function readStored(): ChatSource | null {
  try {
    const raw = localStorage.getItem(SOURCE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ChatSource
    if (!parsed || !Array.isArray(parsed.messages) || !parsed.mapping) return null
    return { messages: parsed.messages, mapping: parsed.mapping }
  } catch {
    return null
  }
}

/**
 * A tiny external store, the same shape the host page uses for its room code.
 * The stored chat cannot be read during a server render, so the first client
 * read hydrates it and React swaps the value in with no mismatch and no
 * setState in an effect.
 */
export function getWhoSaidItSource(): ChatSource {
  if (!hydrated) {
    hydrated = true
    source = readStored() ?? source
  }
  return source
}

/** No localStorage on the server, so the server always renders an empty lobby. */
export function getServerSource(): ChatSource {
  return EMPTY
}

export function subscribeWhoSaidItSource(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function announce() {
  for (const listener of listeners) listener()
}

export function setWhoSaidItSource(next: ChatSource) {
  hydrated = true
  source = next
  try {
    localStorage.setItem(SOURCE_KEY, JSON.stringify(next))
  } catch {
    // Private browsing or a full quota. The game still plays this session.
  }
  announce()
}

export function clearWhoSaidItSource() {
  hydrated = true
  source = EMPTY
  try {
    localStorage.removeItem(SOURCE_KEY)
  } catch {
    // Nothing to forget if storage is unavailable.
  }
  announce()
}

/** Whether the lobby can start, and why not when it cannot. */
export function whoSaidItStatus(players: Player[]): { ready: boolean; reason: string; rounds: number } {
  if (players.length < MIN_PLAYERS) {
    return { ready: false, reason: `Need ${MIN_PLAYERS} players`, rounds: 0 }
  }
  const { rounds, problem } = buildRounds(players, getWhoSaidItSource(), DEFAULT_CONFIG)
  return { ready: problem === null, reason: problem ?? '', rounds: rounds.length }
}
