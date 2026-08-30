import { chromium, devices } from 'playwright'
const b = await chromium.launch()
const shots = []
const grab = async (p, name) => { await p.screenshot({ path: `.probe/sweep-${name}.png` }); shots.push(name) }

// Every phone-side state, including the ones only reachable by breaking things.
const phone = async () => (await b.newContext({ ...devices['iPhone 13'] })).newPage()

const host = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await host.goto('http://localhost:3000/host', { waitUntil: 'networkidle' })
await new Promise(r => setTimeout(r, 2200))
const code = await host.locator('[data-room-code]').first().getAttribute('data-room-code')

const p1 = await phone()
await p1.goto(`http://localhost:3000/play/${code}`, { waitUntil: 'networkidle' })
await p1.waitForSelector('input')
await grab(p1, '1-join')

await p1.fill('input', 'Mittal')
await p1.waitForSelector('button:not([disabled])')
await p1.click('button')
await new Promise(r => setTimeout(r, 2500))
await grab(p1, '2-waiting')

// Host gone: close the host tab and wait past the heartbeat timeout.
await host.close()
await new Promise(r => setTimeout(r, 13000))
await grab(p1, '3-host-lost')

// Late join into a running game.
const host2 = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await host2.goto('http://localhost:3000/host', { waitUntil: 'networkidle' })
await new Promise(r => setTimeout(r, 2500))
const code2 = await host2.locator('[data-room-code]').first().getAttribute('data-room-code')
const joined = []
for (const n of ['A', 'B', 'C', 'D']) {
  const p = await phone()
  await p.goto(`http://localhost:3000/play/${code2}`, { waitUntil: 'networkidle' })
  await p.waitForSelector('input'); await p.fill('input', n)
  await p.waitForSelector('button:not([disabled])'); await p.click('button')
  joined.push(p)
}
await new Promise(r => setTimeout(r, 2500))
await host2.locator('button:has-text("Start")').first().click()
await new Promise(r => setTimeout(r, 2500))

const late = await phone()
await late.goto(`http://localhost:3000/play/${code2}`, { waitUntil: 'networkidle' })
await late.waitForSelector('input'); await late.fill('input', 'Late')
await late.waitForSelector('button:not([disabled])'); await late.click('button')
await new Promise(r => setTimeout(r, 3000))
await grab(late, '4-late-join')

console.log('captured:', shots.join(', '))
await b.close()
