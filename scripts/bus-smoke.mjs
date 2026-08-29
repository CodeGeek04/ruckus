// scripts/bus-smoke.mjs
// Run against the real AppSync Events API. Node 22+ has WebSocket and fetch built in.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => line.split('=').map((part) => part.trim()))
)

const HTTP = env.NEXT_PUBLIC_EVENTS_HTTP
const RT = env.NEXT_PUBLIC_EVENTS_REALTIME
const KEY = env.NEXT_PUBLIC_EVENTS_API_KEY
const auth = { host: HTTP, 'x-api-key': KEY }
const b64url = (o) =>
  Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const channel = '/room/SMOK/p/p-test'
const ws = new WebSocket(`wss://${RT}/event/realtime`, ['aws-appsync-event-ws', `header-${b64url(auth)}`])

let failed = true

ws.onopen = () => ws.send(JSON.stringify({ type: 'connection_init' }))
ws.onmessage = async (ev) => {
  const m = JSON.parse(ev.data)
  if (m.type === 'connection_ack') {
    ws.send(JSON.stringify({ type: 'subscribe', id: 'sub1', channel, authorization: auth }))
  }
  if (m.type === 'subscribe_success') {
    const res = await fetch(`https://${HTTP}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
      body: JSON.stringify({ channel, events: [JSON.stringify({ hello: 'ruckus' })] }),
    })
    console.log('publish status', res.status)
  }
  if (m.type === 'data') {
    const payload = JSON.parse(m.event)
    console.log('received', payload)
    failed = payload.hello !== 'ruckus'
    ws.close()
    console.log(failed ? 'SMOKE FAIL' : 'SMOKE PASS')
    process.exit(failed ? 1 : 0)
  }
  if (m.type === 'subscribe_error' || m.type === 'connection_error') {
    console.error('SMOKE FAIL', JSON.stringify(m))
    process.exit(1)
  }
}

setTimeout(() => {
  console.error('SMOKE FAIL: timed out')
  process.exit(1)
}, 10000)
