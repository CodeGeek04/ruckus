// Drives a real game in real browsers: one host tab plus N phone tabs.
//
//   pnpm dev                      (in another terminal)
//   node scripts/e2e.mjs          play Hearsay
//   node scripts/e2e.mjs telephone
//
// Screenshots land in .e2e/ so the layout can actually be looked at rather
// than assumed. Every phase is captured on the host and on one phone.
import { chromium, devices } from 'playwright'
import { mkdirSync, rmSync } from 'node:fs'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'
const GAME = process.argv[2] ?? 'hearsay'
const NAMES = ['Mittal', 'Sarthak', 'Vamsi', 'Abhishek']
const SHOTS = '.e2e'

const problems = []
const note = (m) => console.log(`  ${m}`)
const fail = (m) => {
  problems.push(m)
  console.log(`  BUG  ${m}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Nothing may overflow the viewport: the host screen is a fixed TV, not a scroll. */
async function checkLayout(page, label) {
  const overflow = await page.evaluate(() => {
    const d = document.documentElement
    return {
      scrollW: d.scrollWidth,
      clientW: d.clientWidth,
      scrollH: d.scrollHeight,
      clientH: d.clientHeight,
    }
  })
  if (overflow.scrollW > overflow.clientW + 1) {
    fail(`${label}: horizontal overflow, ${overflow.scrollW}px content in ${overflow.clientW}px viewport`)
  }
  if (overflow.scrollH > overflow.clientH + 1) {
    fail(`${label}: vertical overflow, ${overflow.scrollH}px content in ${overflow.clientH}px viewport`)
  }

  // Anything rendered outside the viewport box is invisible on a TV.
  const clipped = await page.evaluate(() => {
    const out = []
    const inScroller = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY
        if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return true
      }
      return false
    }
    for (const el of document.querySelectorAll('button, h1, p, span')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (inScroller(el)) continue
      if (r.bottom > window.innerHeight + 1 || r.right > window.innerWidth + 1 || r.top < -1 || r.left < -1) {
        out.push(`${el.tagName}.${el.className.toString().slice(0, 30)} "${(el.textContent ?? '').trim().slice(0, 40)}"`)
      }
    }
    return out.slice(0, 5)
  })
  for (const c of clipped) fail(`${label}: element outside viewport: ${c}`)
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

async function main() {
  rmSync(SHOTS, { recursive: true, force: true })
  mkdirSync(SHOTS, { recursive: true })

  const browser = await chromium.launch()

  // The host is a laptop screen shared over Discord.
  const hostCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const host = await hostCtx.newPage()
  const hostErrors = []
  host.on('pageerror', (e) => hostErrors.push(`host: ${e.message}`))
  host.on('console', (m) => m.type() === 'error' && hostErrors.push(`host console: ${m.text().slice(0, 160)}`))

  console.log(`\n=== ${GAME} in real browsers, base ${BASE} ===\n--- lobby ---`)
  await host.goto(`${BASE}/host`, { waitUntil: 'networkidle' })
  await sleep(2500)

  const code = (await host.locator('p.font-mono').first().textContent())?.trim()
  if (!code || code.length !== 4 || code === '----') {
    fail(`host never produced a room code (saw "${code}")`)
    await shot(host, 'host-nocode')
    await browser.close()
    return report()
  }
  note(`room code ${code}`)
  await checkLayout(host, 'host lobby')
  await shot(host, '01-host-lobby-empty')

  // Each phone is its own context so localStorage identities do not collide.
  const phones = []
  for (const name of NAMES) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => hostErrors.push(`${name}: ${e.message}`))
    await page.goto(`${BASE}/play/${code}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('input', { timeout: 15000 })
    await page.fill('input', name)
    await page.waitForSelector('button:not([disabled])', { timeout: 20000 })
    await page.click('button')
    phones.push({ name, page, ctx })
    note(`${name} joined`)
  }

  await sleep(2500)
  const chips = await host.locator('div.grid.place-items-center').count()
  if (chips < NAMES.length) fail(`lobby shows ${chips} players, expected ${NAMES.length}`)
  await checkLayout(host, 'host lobby full')
  await shot(host, '02-host-lobby-full')
  await shot(phones[0].page, '03-phone-waiting')

  // Who Said It needs a chat export and its authors included before it can start.
  if (GAME === 'whosaidit') {
    const tile = host.locator('button:has-text("Who Said It")').first()
    if (await tile.count()) await tile.click()
    await sleep(400)

    const file = host.locator('input[type=file]').first()
    if (!(await file.count())) {
      fail('Who Said It lobby has no file input')
    } else {
      const EXPORT = process.env.E2E_CHAT ?? ''
      if (!EXPORT) {
        fail('set E2E_CHAT to a WhatsApp export path to test Who Said It')
      } else {
        await file.setInputFiles(EXPORT)
        await sleep(2500)
        note('chat export loaded')
        await checkLayout(host, 'whosaidit lobby')
        await shot(host, '04-whosaidit-lobby')
      }
    }
  }

  // Pick the game, then start.
  const label = { hearsay: 'Hearsay', whosaidit: 'Who Said It', telephone: 'Broken Telephone' }[GAME] ?? GAME
  const tile = host.locator(`button:has-text("${label}")`).first()
  if (await tile.count()) await tile.click()
  await sleep(400)

  const start = host.locator('button', { hasText: /^Start/ }).first()
  if (!(await start.count()) || (await start.isDisabled())) {
    fail(`start button unavailable: "${await start.textContent().catch(() => 'missing')}"`)
    await shot(host, 'host-cannot-start')
    await browser.close()
    return report()
  }
  await start.click()
  console.log('--- playing ---')

  let lastPhase = null
  const budget = GAME === 'telephone' ? 120 : 40
  for (let step = 0; step < budget; step++) {
    await sleep(1200)

    const phase = await host.evaluate(() => document.body.innerText.slice(0, 400))
    const heading = phase.split('\n').filter(Boolean).slice(0, 3).join(' | ')
    if (heading !== lastPhase) {
      note(`host: ${heading.slice(0, 110)}`)
      lastPhase = heading
      await checkLayout(host, `host step ${step}`)
      await shot(host, `host-${String(step).padStart(2, '0')}`)
      await shot(phones[0].page, `phone-${String(step).padStart(2, '0')}`)
    }

    // Every phone taps its first available action.
    for (const { name, page } of phones) {
      // Scope to the app: Next's dev overlay renders buttons in a portal and a
      // blind random click lands on it instead of the game.
      // input[type=text] does not match an <input> with no type attribute,
      // which is what the phone screens actually render.
      const box = page.locator('main textarea, main input:not([type=file])').first()
      if (await box.count()) {
        await box.fill(`${name} says something ridiculous ${step}`).catch(() => {})
      }

      // Prefer an obvious submit, otherwise tap any answer.
      const submit = page
        .locator('main button:not([disabled])', { hasText: /send|submit|lock|done|go/i })
        .first()
      if (await submit.count()) {
        await submit.click().catch(() => {})
      } else {
        const buttons = page.locator('main button:not([disabled])')
        const n = await buttons.count()
        if (n > 0) await buttons.nth(Math.floor(Math.random() * n)).click().catch(() => {})
      }
      await checkLayout(page, `phone ${name} step ${step}`)
    }

    // Host drives the pace, exactly as a human would, but never skips the wait
    // for image generation: that is a real phase, not dead time.
    if (!/generating|drawing|making/i.test(phase)) {
      const advance = host
        .locator('button', { hasText: /Start voting|Show evidence|Let them guess|Reveal|Scores|Next/ })
        .first()
      if (await advance.count()) await advance.click().catch(() => {})
    }

    if (/final|winner|standings/i.test(phase)) {
      note('reached the end')
      await shot(host, 'host-final')
      break
    }
  }

  await checkLayout(host, 'host end')
  for (const e of [...new Set(hostErrors)].slice(0, 10)) fail(`runtime error ${e}`)

  await browser.close()
  report()
}

function report() {
  console.log(`\n--- result ---`)
  if (problems.length === 0) {
    console.log('  E2E PASS, no layout or runtime problems')
  } else {
    console.log(`  E2E FOUND ${problems.length} PROBLEMS`)
    for (const p of problems) console.log(`   - ${p}`)
  }
  console.log(`  screenshots in ${SHOTS}/`)
  process.exit(problems.length ? 1 : 0)
}

main()
