// lib/ids.ts

/** No I, O, 0 or 1: those are the characters people misread off a Discord stream. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function newRoomCode(): string {
  let out = ''
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

/**
 * Hyphen, not underscore: player ids become AppSync Events channel segments
 * (/room/CODE/p/<id>) and AppSync rejects underscores with
 * BadRequestException "Invalid Channel Format".
 */
export function newPlayerId(): string {
  return `p-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}
