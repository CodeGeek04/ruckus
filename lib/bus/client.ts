// lib/bus/client.ts
'use client'

const HTTP = process.env.NEXT_PUBLIC_EVENTS_HTTP!
const REALTIME = process.env.NEXT_PUBLIC_EVENTS_REALTIME!
const API_KEY = process.env.NEXT_PUBLIC_EVENTS_API_KEY!

const authHeader = { host: HTTP, 'x-api-key': API_KEY }

function base64url(value: object): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export type Bus = {
  subscribe(channel: string, onEvent: (data: unknown) => void): () => void
  publish(channel: string, data: unknown): Promise<void>
  close(): void
  onStatus(cb: (status: 'connecting' | 'open' | 'closed') => void): void
}

/**
 * One WebSocket per client, many subscriptions multiplexed over it.
 * Reconnects with backoff and re-subscribes everything, because phones
 * lock their screens constantly and Discord notifications steal focus.
 */
export function createBus(): Bus {
  let ws: WebSocket | null = null
  let ready = false
  let closedByUs = false
  let attempt = 0
  let statusCb: ((s: 'connecting' | 'open' | 'closed') => void) | null = null

  const subs = new Map<string, { channel: string; onEvent: (data: unknown) => void }>()
  const pending: string[] = []

  const setStatus = (s: 'connecting' | 'open' | 'closed') => statusCb?.(s)

  function send(message: object) {
    const text = JSON.stringify(message)
    if (ready && ws) ws.send(text)
    else pending.push(text)
  }

  function sendSubscribe(id: string, channel: string) {
    send({ type: 'subscribe', id, channel, authorization: authHeader })
  }

  function connect() {
    setStatus('connecting')
    ws = new WebSocket(`wss://${REALTIME}/event/realtime`, [
      'aws-appsync-event-ws',
      `header-${base64url(authHeader)}`,
    ])

    ws.onopen = () => ws!.send(JSON.stringify({ type: 'connection_init' }))

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string)
      if (msg.type === 'connection_ack') {
        ready = true
        attempt = 0
        setStatus('open')
        for (const [id, sub] of subs) sendSubscribe(id, sub.channel)
        while (pending.length) ws!.send(pending.shift()!)
        return
      }
      if (msg.type === 'data') {
        const sub = subs.get(msg.id)
        if (sub) sub.onEvent(JSON.parse(msg.event))
      }
    }

    ws.onclose = () => {
      ready = false
      setStatus('closed')
      if (closedByUs) return
      attempt += 1
      setTimeout(connect, Math.min(500 * attempt, 5000))
    }

    ws.onerror = () => ws?.close()
  }

  connect()

  return {
    subscribe(channel, onEvent) {
      const id = `s_${Math.random().toString(36).slice(2, 10)}`
      subs.set(id, { channel, onEvent })
      sendSubscribe(id, channel)
      return () => {
        subs.delete(id)
        send({ type: 'unsubscribe', id })
      }
    },

    async publish(channel, data) {
      // AppSync answers 200 even when it rejects the event: the rejection is in
      // a failed[] array in the body. Without this check an oversized payload
      // vanishes with no error on either side, which is close to undebuggable.
      // The 240KB event limit is real and reachable, so surface it loudly.
      const res = await fetch(`https://${HTTP}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ channel, events: [JSON.stringify(data)] }),
      })

      if (!res.ok) {
        console.error(`[bus] publish to ${channel} failed: HTTP ${res.status}`)
        return
      }

      const body = (await res.json().catch(() => null)) as { failed?: unknown[] } | null
      if (body?.failed?.length) {
        console.error(`[bus] publish to ${channel} rejected:`, JSON.stringify(body.failed).slice(0, 300))
      }
    },

    close() {
      closedByUs = true
      ws?.close()
    },

    onStatus(cb) {
      statusCb = cb
    },
  }
}
