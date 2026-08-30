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

  const setStatus = (s: 'connecting' | 'open' | 'closed') => statusCb?.(s)

  /**
   * Only ever called with the socket up. Nothing is queued while it is down:
   * `subs` is the single source of truth and the whole map is replayed on every
   * connection_ack. Queuing as well used to send each subscribe twice, once
   * from the replay and once from the queue, and AppSync answers a repeated
   * subscription id with subscribe_error rather than ignoring it, which cost
   * that phone every message the host sent it.
   */
  function sendSubscribe(id: string, channel: string) {
    if (!ready || !ws) return
    ws.send(JSON.stringify({ type: 'subscribe', id, channel, authorization: authHeader }))
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
        // Subscriptions first, then the status. Anything a listener publishes
        // on 'open' expects an answer, and an answer sent before the
        // subscribe frame has gone out has nowhere to land.
        for (const [id, sub] of subs) sendSubscribe(id, sub.channel)
        setStatus('open')
        return
      }
      if (msg.type === 'data') {
        const sub = subs.get(msg.id)
        if (sub) sub.onEvent(JSON.parse(msg.event))
        return
      }
      // A rejected subscription is silent otherwise: the socket stays open and
      // that one channel simply never delivers anything again.
      if (msg.type === 'subscribe_error' || msg.type === 'connection_error') {
        console.error(`[bus] ${msg.type}:`, JSON.stringify(msg.errors ?? msg).slice(0, 200))
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
        if (ready && ws) ws.send(JSON.stringify({ type: 'unsubscribe', id }))
      }
    },

    async publish(channel, data) {
      // Never rejects. Phones lose the network constantly and every caller
      // fires and forgets, so a throwing fetch became an unhandled rejection.
      // AppSync answers 200 even when it rejects the event: the rejection is in
      // a failed[] array in the body. Without this check an oversized payload
      // vanishes with no error on either side, which is close to undebuggable.
      // The 240KB event limit is real and reachable, so surface it loudly.
      try {
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
      } catch {
        // Offline, or the tab is being torn down. The caller re-announces.
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
