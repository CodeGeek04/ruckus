// lib/games/telephone/reduce.ts
import { truncate } from '@/lib/text'
import type { Command, GameEvent, Player, PlayerId, Reduced } from '@/lib/types'
import { chainForPlayer, playerForChain, stepCount } from './chains'
import {
  DEFAULT_CONFIG,
  PLACEHOLDER_IMAGE,
  beatsInChain,
  playerIndexOf,
  type Chain,
  type Entry,
  type Phase,
  type TelephoneConfig,
  type TelephoneInput,
  type TelephoneState,
} from './state'

const MISSING_TEXT = 'they said nothing'

export function initTelephone(players: Player[], config: TelephoneConfig = DEFAULT_CONFIG): TelephoneState {
  const scores: Record<PlayerId, number> = {}
  for (const p of players) scores[p.id] = 0

  return {
    phase: 'write',
    players,
    config,
    steps: stepCount(players.length, config.maxSteps),
    stepIndex: 0,
    chains: players.map((p, index) => ({ index, starterId: p.id, entries: [] })),
    reveal: { chainIndex: 0, beat: 0 },
    votes: {},
    scores,
    awarded: {},
  }
}

const timer = (state: TelephoneState, phase: Exclude<Phase, 'ended'>): Command => ({
  kind: 'timer',
  ms: state.config.durations[phase],
})

function withChain(state: TelephoneState, chainIndex: number, chain: Chain): TelephoneState {
  const chains = [...state.chains]
  chains[chainIndex] = chain
  return { ...state, chains }
}

/** Everyone has written for this step. */
function allSubmitted(state: TelephoneState): boolean {
  return state.chains.every((c) => c.entries.length > state.stepIndex)
}

/** Every sentence for this step has a picture, so the step is finished. */
function allDrawn(state: TelephoneState): boolean {
  return state.chains.every((c) => c.entries[state.stepIndex]?.imageUrl != null)
}

function nextStep(state: TelephoneState): Reduced<TelephoneState> {
  const stepIndex = state.stepIndex + 1

  if (stepIndex >= state.steps) {
    return {
      state: { ...state, phase: 'reveal', reveal: { chainIndex: 0, beat: 0 } },
      commands: [timer(state, 'reveal'), { kind: 'sound', name: 'reveal' }],
    }
  }

  return {
    state: { ...state, stepIndex, phase: 'describe' },
    commands: [timer(state, 'describe'), { kind: 'sound', name: 'step' }],
  }
}

/** A silent phone must never hold up the room, so a missing sentence is filled. */
function fillMissingEntries(state: TelephoneState): TelephoneState {
  const chains = state.chains.map((chain) => {
    if (chain.entries.length > state.stepIndex) return chain
    const playerIndex = playerForChain(chain.index, state.stepIndex, state.players.length)
    const entry: Entry = {
      playerId: state.players[playerIndex].id,
      text: MISSING_TEXT,
      imageUrl: PLACEHOLDER_IMAGE,
      failed: true,
    }
    return { ...chain, entries: [...chain.entries, entry] }
  })
  return { ...state, chains }
}

/** A failed or slow generation becomes a placeholder rather than a hang. */
function fillMissingImages(state: TelephoneState): TelephoneState {
  const chains = state.chains.map((chain) => {
    const entry = chain.entries[state.stepIndex]
    if (!entry || entry.imageUrl != null) return chain
    const entries = [...chain.entries]
    entries[state.stepIndex] = { ...entry, imageUrl: PLACEHOLDER_IMAGE, failed: true }
    return { ...chain, entries }
  })
  return { ...state, chains }
}

/**
 * Called whenever a step might be over. Only moves on once every chain has
 * both a sentence and a picture, so the reveal is never full of holes.
 */
function settle(state: TelephoneState): Reduced<TelephoneState> {
  if (!allSubmitted(state)) return { state }
  if (!allDrawn(state)) {
    return state.phase === 'drawing'
      ? { state }
      : { state: { ...state, phase: 'drawing' }, commands: [timer(state, 'drawing')] }
  }
  return nextStep(state)
}

function tally(state: TelephoneState): Reduced<TelephoneState> {
  const counts = state.chains.map(() => 0)
  for (const chainIndex of Object.values(state.votes)) counts[chainIndex] += 1

  const best = Math.max(0, ...counts)
  const awarded: Record<PlayerId, number> = {}

  if (best > 0) {
    for (const chain of state.chains) {
      if (counts[chain.index] !== best) continue
      for (const entry of chain.entries) {
        awarded[entry.playerId] = (awarded[entry.playerId] ?? 0) + state.config.scoring.winningChain
      }
    }
  }

  const scores = { ...state.scores }
  for (const [playerId, points] of Object.entries(awarded)) {
    scores[playerId] = (scores[playerId] ?? 0) + points
  }

  return {
    state: { ...state, phase: 'ended', awarded, scores },
    commands: [{ kind: 'sound', name: 'ended' }],
  }
}

function advanceReveal(state: TelephoneState): Reduced<TelephoneState> {
  const chain = state.chains[state.reveal.chainIndex]
  const beat = state.reveal.beat + 1

  if (beat < beatsInChain(chain)) {
    return { state: { ...state, reveal: { ...state.reveal, beat } }, commands: [timer(state, 'reveal')] }
  }

  const chainIndex = state.reveal.chainIndex + 1
  if (chainIndex >= state.chains.length) {
    return { state: { ...state, phase: 'vote' }, commands: [timer(state, 'vote'), { kind: 'sound', name: 'vote' }] }
  }

  return {
    state: { ...state, reveal: { chainIndex, beat: 0 } },
    commands: [timer(state, 'reveal'), { kind: 'sound', name: 'chain' }],
  }
}

/** The host wants the next beat, or the timer ran out. */
function advance(state: TelephoneState): Reduced<TelephoneState> {
  switch (state.phase) {
    case 'write':
    case 'describe':
      return settle(fillMissingEntries(state))
    case 'drawing':
      return nextStep(fillMissingImages(state))
    case 'reveal':
      return advanceReveal(state)
    case 'vote':
      return tally(state)
    case 'ended':
      return { state }
  }
}

function cleanText(text: unknown, config: TelephoneConfig): string {
  if (typeof text !== 'string') return ''
  // truncate, not slice: a sentence cut through the middle of an emoji ends in
  // a lone surrogate, and AppSync rejects an event carrying one outright, so
  // the whole round would have gone out with a hole in it.
  return truncate(text.replace(/\s+/g, ' ').trim(), config.maxTextLength)
}

/**
 * The phone sends back whatever /api/image gave it. Anything that is not a
 * plain https url from our own storage becomes a placeholder, so a phone with
 * devtools open cannot put an arbitrary image on the shared screen.
 */
/** "chainIndex:stepIndex", the key the phone was handed in its view. */
function parseSlot(key: unknown): { chainIndex: number; stepIndex: number } | null {
  if (typeof key !== 'string') return null
  const [chain, step] = key.split(':')
  const chainIndex = Number(chain)
  const stepIndex = Number(step)
  if (!Number.isInteger(chainIndex) || !Number.isInteger(stepIndex)) return null
  if (chainIndex < 0 || stepIndex < 0) return null
  return { chainIndex, stepIndex }
}

function cleanUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  if (url.length > 512) return null
  if (!/^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i.test(url)) return null
  return url
}

function applyInput(state: TelephoneState, playerId: PlayerId, input: TelephoneInput): Reduced<TelephoneState> {
  if (state.phase === 'vote') {
    if (input.kind !== 'vote') return { state }
    const playerIndex = playerIndexOf(state, playerId)
    if (playerIndex < 0) return { state }
    // You cannot crown the chain you opened, so the vote is about the drift.
    if (input.chainIndex === playerIndex) return { state }
    if (!state.chains[input.chainIndex]) return { state }

    const votes = { ...state.votes, [playerId]: input.chainIndex }
    const updated = { ...state, votes }
    return state.players.every((p) => votes[p.id] !== undefined) ? tally(updated) : { state: updated }
  }

  if (state.phase !== 'write' && state.phase !== 'describe' && state.phase !== 'drawing') return { state }

  const playerIndex = playerIndexOf(state, playerId)
  if (playerIndex < 0) return { state }
  const chainIndex = chainForPlayer(playerIndex, state.stepIndex, state.players.length)
  const chain = state.chains[chainIndex]

  if (input.kind === 'submit') {
    // One shot. The picture starts being drawn the moment this lands, so a
    // second thought would already be too late.
    if (chain.entries.length !== state.stepIndex) return { state }
    const text = cleanText(input.text, state.config)
    if (text.length === 0) return { state }

    const entry: Entry = { playerId, text, imageUrl: null, failed: false }
    return settle(withChain(state, chainIndex, { ...chain, entries: [...chain.entries, entry] }))
  }

  if (input.kind === 'image') {
    // The image is addressed to the slot it was requested for, not to whatever
    // step happens to be current when it lands. Generation takes seconds, and
    // the step can move on in the meantime (a slow phone, or the host skipping
    // the wait). Keying on state.stepIndex dropped those images silently and
    // left the chain showing "no picture" forever.
    const slot = parseSlot(input.key)
    if (!slot) return { state }

    const target = state.chains[slot.chainIndex]
    const entry = target?.entries[slot.stepIndex]
    if (!entry || entry.playerId !== playerId || entry.imageUrl != null) return { state }

    const url = cleanUrl(input.url)
    const entries = [...target.entries]
    entries[slot.stepIndex] = { ...entry, imageUrl: url ?? PLACEHOLDER_IMAGE, failed: url === null }
    return settle(withChain(state, slot.chainIndex, { ...target, entries }))
  }

  return { state }
}

export function reduceTelephone(
  state: TelephoneState,
  event: GameEvent<TelephoneInput>
): Reduced<TelephoneState> {
  switch (event.type) {
    case 'deadline':
    case 'hostAdvance':
      return advance(state)
    case 'input':
      return applyInput(state, event.playerId, event.payload)
  }
}
