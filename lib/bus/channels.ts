// lib/bus/channels.ts
export function publicChannel(code: string): string {
  return `/room/${code.toUpperCase()}`
}

export function privateChannel(code: string, playerId: string): string {
  return `/room/${code.toUpperCase()}/p/${playerId}`
}
