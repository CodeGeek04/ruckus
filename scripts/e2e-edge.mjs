// Edge case harness. Where scripts/e2e.mjs plays one clean game, this one
// abuses the room: phones that vanish, hosts that refresh, names made of HTML,
// eight people at once, and a laptop plugged into a 1080p TV.
//
//   pnpm dev                              (in another terminal)
//   node scripts/e2e-edge.mjs             every scenario
//   node scripts/e2e-edge.mjs rejoin offline
//
// Same contract as scripts/e2e.mjs: BUG lines on stdout, screenshots in .e2e/,
// non-zero exit if anything is wrong.
import { chromium, devices } from 'playwright'
import { mkdirSync, rmSync } from 'node:fs'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000'
const SHOTS = '.e2e'

const problems = []
let scenario = 'setup'

const note = (m) => console.log(`  ${m}`)
const fail = (m) => {
  problems.push(`[${scenario}] ${m}`)
  console.log(`  BUG  ${m}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Nothing may overflow the viewport: the host screen is a fixed TV, not a scroll. */
async function checkLayout(page, label) {
  if (page.isClosed()) return
  const overflow = await page
    .evaluate(() => {
      const d = document.documentElement
      return { scrollW: d.scrollWidth, clientW: d.clientWidth, scrollH: d.scrollHeight, clientH: d.clientHeight }
    })
    .catch(() => null)
  if (!overflow) return

  if (overflow.scrollW > overflow.clientW + 1) {
    fail(`${label}: horizontal overflow, ${overflow.scrollW}px content in ${overflow.clientW}px viewport`)
  }
  if (overflow.scrollH > overflow.clientH + 1) {
    fail(`${label}: vertical overflow, ${overflow.scrollH}px content in ${overflow.clientH}px viewport`)
  }

  const clipped = await page
    .evaluate(() => {
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
    .catch(() => [])
  for (const c of clipped) fail(`${label}: element outside viewport: ${c}`)
}

/** Every tappable control has to be big enough and actually on screen. */
async function checkTappable(page, label) {
  if (page.isClosed()) return
  const bad = await page
    .evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll('main button, main input, main textarea')) {
        if (el.disabled) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (r.height < 36) out.push(`${el.tagName} "${(el.textContent ?? '').trim().slice(0, 24)}" only ${Math.round(r.height)}px tall`)
        const cx = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1)
        const cy = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1)
        if (r.top > window.innerHeight || r.bottom < 0) {
          out.push(`${el.tagName} "${(el.textContent ?? '').trim().slice(0, 24)}" is off screen`)
          continue
        }
        const hit = document.elementFromPoint(cx, cy)
        if (hit && !el.contains(hit) && !hit.contains(el)) {
          out.push(`${el.tagName} "${(el.textContent ?? '').trim().slice(0, 24)}" is covered by ${hit.tagName}`)
        }
      }
      return out.slice(0, 5)
    })
    .catch(() => [])
  for (const b of bad) fail(`${label}: ${b}`)
}

/** A lone surrogate on screen means a name was chopped through an emoji. */
async function checkText(page, label) {
  if (page.isClosed()) return
  const text = await page.evaluate(() => document.body.innerText).catch(() => '')
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)) {
    fail(`${label}: broken surrogate pair rendered (a name was sliced through an emoji)`)
  }
  if (/�/.test(text)) fail(`${label}: replacement character rendered`)
}

let shotIndex = 0
async function shot(page, name) {
  if (page.isClosed()) return
  shotIndex += 1
  await page
    .screenshot({ path: `${SHOTS}/edge-${String(shotIndex).padStart(3, '0')}-${scenario}-${name}.png` })
    .catch(() => {})
}

const errors = []
function watch(page, who) {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${who} console: ${m.text().slice(0, 160)}`)
  })
}

// Unhandled promise rejections do not surface as pageerror in every build, so
// they are hooked explicitly: a publish that throws while offline shows up here.
const REJECTION_HOOK = `
  window.addEventListener('unhandledrejection', (e) => {
    console.error('unhandledrejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)))
  })
`

async function openHost(browser, { width = 1440, height = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  await ctx.addInitScript(REJECTION_HOOK)
  const page = await ctx.newPage()
  watch(page, 'host')
  await page.goto(`${BASE}/host`, { waitUntil: 'networkidle' })
  await page.waitForFunction(
    () => {
      const el = document.querySelector('p.font-mono')
      return el && el.textContent.trim().length === 4 && el.textContent.trim() !== '----'
    },
    { timeout: 20000 }
  )
  const code = (await page.locator('p.font-mono').first().textContent()).trim()
  return { ctx, page, code }
}

async function joinPhone(browser, code, name, device = 'iPhone 13') {
  const ctx = await browser.newContext({ ...devices[device] })
  await ctx.addInitScript(REJECTION_HOOK)
  const page = await ctx.newPage()
  watch(page, name || '(blank)')
  await page.goto(`${BASE}/play/${code}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('input', { timeout: 20000 })
  await page.fill('input', name)
  await page.waitForSelector('button:not([disabled])', { timeout: 20000 })
  await page.click('button')
  const joined = await page
    .waitForFunction(() => !document.querySelector('main input'), { timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  if (!joined) fail(`${name} tapped Join and never got in: the host's acceptance never arrived`)
  return { ctx, page, name, joined }
}

/** Names shown in the host scoreboard footer, one per player. */
async function hostRoster(host) {
  return host.locator('footer span.text-xs').allTextContents()
}

async function lobbyRoster(host) {
  return host.locator('main span.text-xs').allTextContents()
}

async function pickAndStart(host, gameLabel) {
  const tile = host.locator(`button:has-text("${gameLabel}")`).first()
  if (await tile.count()) await tile.click()
  await sleep(400)
  const start = host.locator('button', { hasText: /^Start/ }).first()
  if (!(await start.count()) || (await start.isDisabled())) {
    fail(`cannot start ${gameLabel}: ${(await start.textContent().catch(() => 'missing'))?.trim()}`)
    return false
  }
  await start.click()
  await sleep(1500)
  return true
}

async function hostAdvance(host) {
  const advance = host
    .locator('button', { hasText: /Start voting|Show evidence|Let them guess|Reveal|Scores|Next|Results/ })
    .first()
  if (await advance.count()) await advance.click().catch(() => {})
}

const hostText = (host) => host.evaluate(() => document.body.innerText).catch(() => '')

/** Play Hearsay forward one phase at a time, letting every phone answer. */
async function hearsayStep(host, phones, { skip = [] } = {}) {
  for (const p of phones) {
    if (skip.includes(p.name) || p.page.isClosed()) continue
    const buttons = p.page.locator('main button:not([disabled])')
    const n = await buttons.count().catch(() => 0)
    if (n > 0) await buttons.nth(Math.floor(Math.random() * n)).click().catch(() => {})
  }
  await sleep(600)
  await hostAdvance(host)
  await sleep(900)
}

// ---------------------------------------------------------------- scenarios

/** 1. A phone tab is closed mid game and reopened. Same player, same score. */
async function rejoinAfterClose(browser) {
  const { ctx: hostCtx, page: host, code } = await openHost(browser)
  const phones = []
  for (const n of ['Mittal', 'Sarthak', 'Vamsi', 'Abhishek']) {
    phones.push(await joinPhone(browser, code, n))
  }
  await sleep(2000)
  if (!(await pickAndStart(host, 'Hearsay'))) return cleanup([hostCtx, ...phones.map((p) => p.ctx)])

  for (let i = 0; i < 6; i++) await hearsayStep(host, phones)

  const before = await hostRoster(host)
  const target = phones[1]
  const scoreBefore = (await hostText(host)).length

  // Close the tab the way a phone does: gone, no goodbye.
  await target.page.close()
  await sleep(1500)

  // Same context, so localStorage still holds the identity.
  const back = await target.ctx.newPage()
  watch(back, `${target.name}-reopened`)
  await back.goto(`${BASE}/play/${code}`, { waitUntil: 'networkidle' })

  const rejoined = await back
    .waitForFunction(() => !document.querySelector('main input'), { timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  if (!rejoined) fail('a reopened phone is stuck on the name screen instead of rejoining')
  await shot(back, 'reopened')
  target.page = back

  await sleep(2000)
  const after = await hostRoster(host)
  if (after.length !== before.length) {
    fail(`reopening a phone changed the roster: ${before.length} players became ${after.length}`)
  }
  if (after.filter((n) => n === before[0]).length > 1 || new Set(after).size !== after.length) {
    fail(`roster has duplicates after a reopen: ${after.join(', ')}`)
  }
  if (scoreBefore === 0) fail('host screen was empty before the reopen')

  // The reopened phone must be playable again, not a spectator.
  await hearsayStep(host, phones)
  await hearsayStep(host, phones)
  await checkLayout(host, 'host after reopen')
  await checkLayout(back, 'reopened phone')
  await shot(host, 'host')

  await cleanup([hostCtx, ...phones.map((p) => p.ctx)])
}

/** 2. The host refreshes mid game. The round restores and phones recover. */
async function hostRefresh(browser) {
  const { ctx: hostCtx, page: host, code } = await openHost(browser)
  const phones = []
  for (const n of ['Mittal', 'Sarthak', 'Vamsi', 'Abhishek']) phones.push(await joinPhone(browser, code, n))
  await sleep(2000)
  if (!(await pickAndStart(host, 'Hearsay'))) return cleanup([hostCtx, ...phones.map((p) => p.ctx)])

  for (let i = 0; i < 8; i++) await hearsayStep(host, phones)

  const roundBefore = (await hostText(host)).match(/Round (\d+) of (\d+)/)?.[0] ?? null
  const rosterBefore = await hostRoster(host)
  if (!roundBefore) fail('host was not showing a round before the refresh')

  await host.reload({ waitUntil: 'networkidle' })
  await sleep(4000)
  await shot(host, 'after-reload')

  const textAfter = await hostText(host)
  const roundAfter = textAfter.match(/Round (\d+) of (\d+)/)?.[0] ?? null
  if (!roundAfter) {
    fail(`host refresh lost the round, screen now reads "${textAfter.split('\n').filter(Boolean).slice(0, 3).join(' | ')}"`)
  } else if (roundAfter !== roundBefore) {
    fail(`host refresh restored the wrong round: was ${roundBefore}, now ${roundAfter}`)
  }

  const rosterAfter = await hostRoster(host)
  if (rosterAfter.length !== rosterBefore.length) {
    fail(`host refresh lost players: ${rosterBefore.length} became ${rosterAfter.length}`)
  }

  // Phones must come back on their own, without anyone touching them.
  await sleep(3000)
  for (const p of phones) {
    const text = await p.page.evaluate(() => document.body.innerText).catch(() => '')
    if (/Lost the host/i.test(text)) fail(`${p.name} still says "Lost the host" after the host came back`)
    if (/Your name|Join/i.test(text) && (await p.page.locator('main input').count())) {
      fail(`${p.name} was thrown back to the name screen by a host refresh`)
    }
  }

  // And the game has to keep working from the restored state.
  await hearsayStep(host, phones)
  await hearsayStep(host, phones)
  const stillPlaying = /Round \d+ of \d+/.test(await hostText(host))
  if (!stillPlaying) fail('the game did not continue after the host refresh')
  await checkLayout(host, 'host after refresh')

  await cleanup([hostCtx, ...phones.map((p) => p.ctx)])
}

/** 3. A phone drops off the network and comes back with nobody helping it. */
async function offlineAndBack(browser) {
  const { ctx: hostCtx, page: host, code } = await openHost(browser)
  const phones = []
  for (const n of ['Mittal', 'Sarthak', 'Vamsi', 'Abhishek']) phones.push(await joinPhone(browser, code, n))
  await sleep(2000)
  if (!(await pickAndStart(host, 'Hearsay'))) return cleanup([hostCtx, ...phones.map((p) => p.ctx)])

  for (let i = 0; i < 4; i++) await hearsayStep(host, phones)

  const dropped = phones[2]
  note(`${dropped.name} goes offline`)
  await dropped.ctx.setOffline(true)

  // The room carries on without them for long enough to time the host out.
  for (let i = 0; i < 5; i++) await hearsayStep(host, phones, { skip: [dropped.name] })
  await shot(dropped.page, 'offline')

  note(`${dropped.name} comes back`)
  await dropped.ctx.setOffline(false)
  await sleep(12000)
  await shot(dropped.page, 'back')

  const text = await dropped.page.evaluate(() => document.body.innerText).catch(() => '')
  if (/Lost the host/i.test(text)) fail(`${dropped.name} never recovered from going offline, still shows "Lost the host"`)
  if (await dropped.page.locator('main input').count()) {
    fail(`${dropped.name} was pushed back to the name screen by a network blip`)
  }

  // It must be showing the CURRENT round, not the screen it froze on.
  const hostRound = (await hostText(host)).match(/Round (\d+)/)?.[1]
  await hearsayStep(host, phones)
  await sleep(2500)
  const phoneText = await dropped.page.evaluate(() => document.body.innerText).catch(() => '')
  if (!phoneText.trim()) fail(`${dropped.name} shows a blank screen after reconnecting`)
  note(`host is on round ${hostRound}, recovered phone reads "${phoneText.split('\n').filter(Boolean)[0]}"`)

  const roster = await hostRoster(host)
  if (new Set(roster).size !== roster.length) fail(`roster gained a duplicate after a reconnect: ${roster.join(', ')}`)

  await cleanup([hostCtx, ...phones.map((p) => p.ctx)])
}

/** 4. Someone scans the QR code after the game has already started. */
async function lateJoin(browser) {
  const { ctx: hostCtx, page: host, code } = await openHost(browser)
  const phones = []
  for (const n of ['Mittal', 'Sarthak', 'Vamsi', 'Abhishek']) phones.push(await joinPhone(browser, code, n))
  await sleep(2000)
  if (!(await pickAndStart(host, 'Hearsay'))) return cleanup([hostCtx, ...phones.map((p) => p.ctx)])
  for (let i = 0; i < 3; i++) await hearsayStep(host, phones)

  const rosterBefore = await hostRoster(host)

  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  await ctx.addInitScript(REJECTION_HOOK)
  const late = await ctx.newPage()
  watch(late, 'Latecomer')
  await late.goto(`${BASE}/play/${code}`, { waitUntil: 'networkidle' })
  await late.waitForSelector('input', { timeout: 20000 })
  await late.fill('input', 'Latecomer')
  await late.waitForSelector('button:not([disabled])', { timeout: 20000 })
  await late.click('button')
  await sleep(6000)
  await shot(late, 'latecomer')

  const rosterAfter = await hostRoster(host)
  if (rosterAfter.length !== rosterBefore.length) {
    fail(`a late joiner got into a running game: roster went from ${rosterBefore.length} to ${rosterAfter.length}`)
  }
  if (rosterAfter.includes('Latecomer')) fail('a late joiner appears on the host scoreboard mid game')

  // Rejecting them silently is the same as being broken: the phone must say so.
  const text = await late.evaluate(() => document.body.innerText)
  const explained = /already started|in progress|too late|next round|next game|wait/i.test(text)
  if (!explained) {
    fail(`a late joiner gets no explanation, phone reads "${text.split('\n').filter(Boolean).join(' | ').slice(0, 120)}"`)
  }

  // Tapping join over and over must not corrupt anything either.
  for (let i = 0; i < 5; i++) {
    const btn = late.locator('main button:not([disabled])').first()
    if (await btn.count()) await btn.click().catch(() => {})
    await sleep(150)
  }
  await sleep(2500)
  const rosterFinal = await hostRoster(host)
  if (rosterFinal.length !== rosterBefore.length) {
    fail(`hammering join from a late phone corrupted the roster: ${rosterFinal.join(', ')}`)
  }
  await checkLayout(late, 'latecomer phone')
  await checkLayout(host, 'host with a latecomer knocking')

  await cleanup([hostCtx, ctx, ...phones.map((p) => p.ctx)])
}

/** 5. Two people type the same name. */
async function duplicateNames(browser) {
  const { ctx: hostCtx, page: host, code } = await openHost(browser)
  const phones = []
  for (const n of ['Sam', 'Sam', 'Vamsi', 'Abhishek']) phones.push(await joinPhone(browser, code, n))
  await sleep(2500)
  await shot(host, 'lobby')

  const roster = await lobbyRoster(host)
  if (roster.length !== 4) fail(`lobby shows ${roster.length} players for 4 phones (${roster.join(', ')})`)

  // Same label is fine as long as something on screen still tells them apart.
  const colors = await host.evaluate(() =>
    [...document.querySelectorAll('main div.grid.place-items-center')].map((el) => getComputedStyle(el).backgroundColor)
  )
  if (new Set(colors).size !== colors.length) {
    fail(`two players are indistinguishable: colours ${colors.join(' / ')}`)
  }

  if (!(await pickAndStart(host, 'Hearsay'))) return cleanup([hostCtx, ...phones.map((p) => p.ctx)])
  for (let i = 0; i < 6; i++) await hearsayStep(host, phones)
  await shot(host, 'mid-game')

  // Both Sams must be independently votable, or one of them cannot be accused.
  const voter = phones.find((p) => p.name !== 'Sam')
  const labels = await voter.page.locator('main button').allTextContents().catch(() => [])
  note(`vote targets: ${labels.map((l) => l.trim()).join(' / ')}`)
  await checkLayout(host, 'host with duplicate names')

  await cleanup([hostCtx, ...phones.map((p) => p.ctx)])
}

/** 6. One phone never answers for a whole round. The timer has to carry it. */
async function silentPlayer(browser) {
  const { ctx: hostCtx, page: host, code } = await openHost(browser)
  const phones = []
  for (const n of ['Mittal', 'Sarthak', 'Vamsi', 'Abhishek']) phones.push(await joinPhone(browser, code, n))
  await sleep(2000)
  if (!(await pickAndStart(host, 'Hearsay'))) return cleanup([hostCtx, ...phones.map((p) => p.ctx)])

  const silent = phones[3].name
  note(`${silent} answers nothing, and nobody touches the host`)

  // No host clicks at all: the phase timers are the only thing moving this on.
  const start = Date.now()
  let sawVerdict = false
  let sawRound2 = false
  while (Date.now() - start < 130000) {
    for (const p of phones) {
      if (p.name === silent) continue
      const buttons = p.page.locator('main button:not([disabled])')
      const n = await buttons.count().catch(() => 0)
      if (n > 0) await buttons.nth(0).click().catch(() => {})
    }
    const text = await hostText(host)
    if (/knew it|had no idea/i.test(text)) sawVerdict = true
    if (/Round 2 of/.test(text)) sawRound2 = true
    if (sawVerdict && sawRound2) break
    await sleep(1500)
  }
  await shot(host, 'timer-driven')

  if (!sawVerdict) fail('a round with a silent player never reached the verdict on its timers alone')
  if (!sawRound2) fail('a round with a silent player never rolled over to the next round')
  await checkLayout(host, 'host with a silent player')

  await cleanup([hostCtx, ...phones.map((p) => p.ctx)])
}

/** 7. Fat fingers: double taps, triple taps, and two options at once. */
async function tapSpam(browser) {
  const { ctx: hostCtx, page: host, code } = await openHost(browser)
  const phones = []
  for (const n of ['Mittal', 'Sarthak', 'Vamsi', 'Abhishek']) phones.push(await joinPhone(browser, code, n))
  await sleep(2000)
  if (!(await pickAndStart(host, 'Hearsay'))) return cleanup([hostCtx, ...phones.map((p) => p.ctx)])

  const scoreOf = async () => {
    const nums = await host.locator('footer span.text-2xl').allTextContents()
    return nums.map((n) => Number(n.trim()) || 0)
  }

  for (let round = 0; round < 3; round++) {
    for (let step = 0; step < 6; step++) {
      for (const p of phones) {
        const buttons = p.page.locator('main button:not([disabled])')
        const n = await buttons.count().catch(() => 0)
        if (n === 0) continue
        // Triple tap the first option, then immediately tap a different one.
        await buttons.nth(0).click({ delay: 0 }).catch(() => {})
        await buttons.nth(0).click({ delay: 0 }).catch(() => {})
        await buttons.nth(0).click({ delay: 0 }).catch(() => {})
        if (n > 1) await buttons.nth(1).click({ delay: 0 }).catch(() => {})
      }
      // Host hammering too: two advances back to back.
      await hostAdvance(host)
      await hostAdvance(host)
      await sleep(700)

      const text = await hostText(host)
      if (!text.trim()) fail('host screen went blank while being hammered')
    }
    const scores = await scoreOf()
    // Hearsay pays 1000 for the chair and 500 for reading the room. A spammed
    // tap that scored twice shows up as a total that is not a multiple of 500.
    for (const s of scores) {
      if (s % 500 !== 0) fail(`score ${s} is not a multiple of the round awards, so something scored twice`)
    }
    note(`after round ${round + 1}: scores ${scores.join(', ')}`)
    await checkLayout(host, `host round ${round + 1} under spam`)
    for (const p of phones) await checkLayout(p.page, `${p.name} under spam`)
  }

  const finalText = await hostText(host)
  if (!/Round \d+ of \d+|Final verdict/.test(finalText)) {
    fail(`spamming taps left the host stuck: "${finalText.split('\n').filter(Boolean).slice(0, 3).join(' | ')}"`)
  }
  await shot(host, 'after-spam')

  await cleanup([hostCtx, ...phones.map((p) => p.ctx)])
}

/** 8. Names that are empty, enormous, pure emoji, or an XSS attempt. */
async function nastyNames(browser) {
  const { ctx: hostCtx, page: host, code } = await openHost(browser)

  // Empty and whitespace names must not be joinable at all.
  const probeCtx = await browser.newContext({ ...devices['iPhone 13'] })
  await probeCtx.addInitScript(REJECTION_HOOK)
  const probe = await probeCtx.newPage()
  watch(probe, 'probe')
  await probe.goto(`${BASE}/play/${code}`, { waitUntil: 'networkidle' })
  await probe.waitForSelector('input', { timeout: 20000 })
  await sleep(2500)
  for (const bad of ['', '     ']) {
    await probe.fill('input', bad)
    await sleep(200)
    const disabled = await probe.locator('main button').first().isDisabled()
    if (!disabled) fail(`the join button is enabled for the name ${JSON.stringify(bad)}`)
  }
  await probeCtx.close()

  let alerted = false
  const nasty = [
    { label: 'long', value: 'A'.repeat(200) },
    { label: 'emoji', value: 'a🎉🎉🎉🎉🎉🎉' },
    { label: 'html', value: '<img src=x onerror=alert(1)>' },
    { label: 'rtl', value: 'ok‮gnol' },
  ]
  const phones = []
  for (const { label, value } of nasty) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] })
    await ctx.addInitScript(REJECTION_HOOK)
    const page = await ctx.newPage()
    watch(page, label)
    page.on('dialog', async (d) => {
      alerted = true
      await d.dismiss().catch(() => {})
    })
    await page.goto(`${BASE}/play/${code}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('input', { timeout: 20000 })
    await page.fill('input', value)
    await page.waitForSelector('button:not([disabled])', { timeout: 20000 })
    await page.click('button')
    await page.waitForFunction(() => !document.querySelector('main input'), { timeout: 20000 }).catch(() => {})
    phones.push({ ctx, page, name: label })
  }
  await sleep(2500)
  await shot(host, 'lobby-nasty')

  if (alerted) fail('an injected name executed script')
  const imgs = await host.locator('main img').count()
  if (imgs > 0) fail(`an injected name produced ${imgs} img element(s) on the host screen`)
  await checkLayout(host, 'host lobby with nasty names')
  await checkText(host, 'host lobby with nasty names')

  if (!(await pickAndStart(host, 'Hearsay'))) return cleanup([hostCtx, ...phones.map((p) => p.ctx)])
  for (let i = 0; i < 7; i++) {
    await hearsayStep(host, phones)
    await checkLayout(host, `host mid game with nasty names step ${i}`)
    await checkText(host, `host mid game with nasty names step ${i}`)
    for (const p of phones) {
      await checkLayout(p.page, `${p.name} phone`)
      await checkText(p.page, `${p.name} phone`)
    }
  }
  await shot(host, 'mid-game-nasty')
  await shot(phones[0].page, 'phone-nasty')

  await cleanup([hostCtx, ...phones.map((p) => p.ctx)])
}

/** 9. Broken Telephone sentences at the limit and made only of spaces. */
async function telephoneText(browser) {
  const { ctx: hostCtx, page: host, code } = await openHost(browser)
  const phones = []
  for (const n of ['Mittal', 'Sarthak', 'Vamsi']) phones.push(await joinPhone(browser, code, n))
  await sleep(2000)
  if (!(await pickAndStart(host, 'Broken Telephone'))) return cleanup([hostCtx, ...phones.map((p) => p.ctx)])
  await sleep(1500)

  const box = phones[0].page.locator('main input').first()
  await box.waitFor({ timeout: 20000 })

  // Only spaces: the phone must refuse it rather than pretending it landed.
  await box.fill('        ')
  await sleep(300)
  const sendBtn = phones[0].page.locator('main button').first()
  if (!(await sendBtn.isDisabled())) {
    await sendBtn.click().catch(() => {})
    await sleep(2500)
    const stuck = await phones[0].page.evaluate(() => document.body.innerText)
    if (/Drawing it/i.test(stuck)) {
      fail('a sentence of only spaces was accepted by the phone and silently dropped by the host')
    } else {
      fail('the send button is enabled for a sentence of only spaces')
    }
  }

  // Exactly the limit. The counter says what the limit is, so read it.
  const limit = Number((await phones[0].page.locator('main p.text-right').textContent()).split('/')[1].trim())
  const exact = 'x'.repeat(limit)
  await box.fill(exact)
  await sleep(200)
  const typed = await box.inputValue()
  if (typed.length !== limit) fail(`typing ${limit} characters left ${typed.length} in the box`)
  await checkLayout(phones[0].page, 'phone with a full length sentence')
  await checkTappable(phones[0].page, 'phone with a full length sentence')
  await shot(phones[0].page, 'exact-limit')
  await phones[0].page.locator('main button').first().click()

  // A sentence that is exactly the limit but full of spaces at the edges.
  await phones[1].page.locator('main input').first().fill(`  ${'y'.repeat(limit - 4)}  `)
  await phones[1].page.locator('main button').first().click()
  await phones[2].page.locator('main input').first().fill('a normal sentence about a horse')
  await phones[2].page.locator('main button').first().click()

  await sleep(4000)
  for (const p of phones) {
    const text = await p.page.evaluate(() => document.body.innerText)
    if (/Write a sentence|What was the sentence/i.test(text)) {
      fail(`${p.name} still sees the composer after sending, so its sentence never landed`)
    }
  }
  await checkLayout(host, 'telephone host after submits')
  await shot(host, 'after-submits')

  // Let the pictures actually generate. This is the real wait, never skipped.
  const drew = await host
    .waitForFunction(() => /Step 2 of|The reveal/i.test(document.body.innerText), { timeout: 120000 })
    .then(() => true)
    .catch(() => false)
  if (!drew) fail('telephone never got past the first drawing step within 120s')
  await checkLayout(host, 'telephone host after drawing')
  await shot(host, 'after-drawing')

  await cleanup([hostCtx, ...phones.map((p) => p.ctx)])
}

/** 10. Exactly the minimum for each game, and a room of eight. */
async function groupSizes(browser) {
  // Hearsay refuses three and accepts four.
  {
    const { ctx: hostCtx, page: host, code } = await openHost(browser)
    const phones = []
    for (const n of ['A', 'B', 'C']) phones.push(await joinPhone(browser, code, n))
    await sleep(2500)
    await host.locator('button:has-text("Hearsay")').first().click()
    await sleep(400)
    const start = host.locator('button', { hasText: /^Start/ }).first()
    if (!(await start.isDisabled())) fail('Hearsay let a room of 3 start, but its minimum is 4')
    phones.push(await joinPhone(browser, code, 'D'))
    await sleep(2500)
    if (await start.isDisabled()) fail('Hearsay would not start with its minimum of 4 players')
    else {
      await start.click()
      await sleep(2000)
      for (let i = 0; i < 6; i++) await hearsayStep(host, phones)
      await checkLayout(host, 'hearsay host at minimum size')
      await shot(host, 'hearsay-min')
    }
    await cleanup([hostCtx, ...phones.map((p) => p.ctx)])
  }

  // Broken Telephone refuses two and accepts three.
  {
    const { ctx: hostCtx, page: host, code } = await openHost(browser)
    const phones = []
    for (const n of ['A', 'B']) phones.push(await joinPhone(browser, code, n))
    await sleep(2500)
    await host.locator('button:has-text("Broken Telephone")').first().click()
    await sleep(400)
    const start = host.locator('button', { hasText: /^Start/ }).first()
    if (!(await start.isDisabled())) fail('Broken Telephone let a room of 2 start, but its minimum is 3')
    phones.push(await joinPhone(browser, code, 'C'))
    await sleep(2500)
    if (await start.isDisabled()) fail('Broken Telephone would not start with its minimum of 3 players')
    await cleanup([hostCtx, ...phones.map((p) => p.ctx)])
  }

  // Eight phones, which is where the host lobby and scoreboard get crowded.
  {
    const { ctx: hostCtx, page: host, code } = await openHost(browser)
    const names = ['Mittal', 'Sarthak', 'Vamsi', 'Abhishek', 'Priyanka', 'Devanshi', 'Harshita', 'Siddharth']
    const phones = []
    for (const n of names) phones.push(await joinPhone(browser, code, n))
    await sleep(3000)
    const roster = await lobbyRoster(host)
    if (roster.length !== 8) fail(`lobby shows ${roster.length} of 8 players`)
    await checkLayout(host, 'host lobby with 8 players')
    await shot(host, 'lobby-8')

    if (await pickAndStart(host, 'Hearsay')) {
      for (let i = 0; i < 8; i++) {
        await hearsayStep(host, phones)
        await checkLayout(host, `host with 8 players step ${i}`)
      }
      await shot(host, 'hearsay-8')
      // Every phone's list of eight targets has to stay reachable and tappable.
      for (const p of phones) {
        await checkLayout(p.page, `${p.name} with 8 targets`)
        await checkTappable(p.page, `${p.name} with 8 targets`)
      }
      await shot(phones[0].page, 'phone-8')
    }
    await cleanup([hostCtx, ...phones.map((p) => p.ctx)])
  }
}

/** 11. The host on a 720p laptop and on a 1080p TV. */
async function hostViewports(browser) {
  for (const [w, h] of [
    [1280, 720],
    [1920, 1080],
  ]) {
    const { ctx: hostCtx, page: host, code } = await openHost(browser, { width: w, height: h })
    const names = ['Mittal', 'Sarthak', 'Vamsi', 'Abhishek', 'Priyanka', 'Devanshi']
    const phones = []
    for (const n of names) phones.push(await joinPhone(browser, code, n))
    await sleep(3000)
    await checkLayout(host, `host lobby ${w}x${h}`)
    await shot(host, `lobby-${w}x${h}`)

    if (await pickAndStart(host, 'Hearsay')) {
      for (let i = 0; i < 8; i++) {
        await hearsayStep(host, phones)
        await checkLayout(host, `host ${w}x${h} step ${i}`)
        await shot(host, `${w}x${h}-step${i}`)
      }
    }
    await cleanup([hostCtx, ...phones.map((p) => p.ctx)])
  }
}

/** 12. The smallest phone anyone still owns, alongside a normal one. */
async function smallPhones(browser) {
  const { ctx: hostCtx, page: host, code } = await openHost(browser)
  const phones = []
  const specs = [
    ['Mittal', 'iPhone SE'],
    ['Sarthak', 'iPhone SE'],
    ['Vamsi', 'iPhone 13'],
    ['Abhishek', 'iPhone 13'],
    ['Priyanka', 'iPhone SE'],
  ]
  for (const [n, d] of specs) phones.push(await joinPhone(browser, code, n, d))
  await sleep(2500)
  for (const p of phones) {
    await checkLayout(p.page, `${p.name} lobby`)
    await checkTappable(p.page, `${p.name} lobby`)
  }
  await shot(phones[0].page, 'se-lobby')

  if (!(await pickAndStart(host, 'Hearsay'))) return cleanup([hostCtx, ...phones.map((p) => p.ctx)])
  for (let i = 0; i < 8; i++) {
    await hearsayStep(host, phones)
    for (const p of phones) {
      await checkLayout(p.page, `${p.name} step ${i}`)
      await checkTappable(p.page, `${p.name} step ${i}`)
    }
  }
  await shot(phones[0].page, 'se-mid')
  await shot(phones[2].page, '13-mid')

  await cleanup([hostCtx, ...phones.map((p) => p.ctx)])
}

async function cleanup(contexts) {
  for (const ctx of contexts) await ctx.close().catch(() => {})
}

// -------------------------------------------------------------------- runner

const SCENARIOS = {
  rejoin: rejoinAfterClose,
  hostrefresh: hostRefresh,
  offline: offlineAndBack,
  latejoin: lateJoin,
  samename: duplicateNames,
  silent: silentPlayer,
  spam: tapSpam,
  names: nastyNames,
  telephonetext: telephoneText,
  groups: groupSizes,
  viewports: hostViewports,
  smallphone: smallPhones,
}

async function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const names = wanted.length ? wanted : Object.keys(SCENARIOS)
  for (const n of names) {
    if (!SCENARIOS[n]) {
      console.log(`unknown scenario "${n}". known: ${Object.keys(SCENARIOS).join(', ')}`)
      process.exit(2)
    }
  }

  if (!wanted.length) rmSync(SHOTS, { recursive: true, force: true })
  mkdirSync(SHOTS, { recursive: true })

  const browser = await chromium.launch()
  console.log(`\n=== edge cases in real browsers, base ${BASE} ===`)

  for (const name of names) {
    scenario = name
    errors.length = 0
    console.log(`\n--- ${name} ---`)
    const started = Date.now()
    try {
      await SCENARIOS[name](browser)
    } catch (e) {
      fail(`threw: ${e.message.split('\n')[0]}`)
    }
    for (const e of [...new Set(errors)].slice(0, 8)) fail(`runtime error ${e}`)
    note(`done in ${Math.round((Date.now() - started) / 1000)}s`)
  }

  await browser.close()

  scenario = 'summary'
  console.log(`\n--- result ---`)
  if (problems.length === 0) {
    console.log('  EDGE PASS, no problems')
  } else {
    console.log(`  EDGE FOUND ${problems.length} PROBLEMS`)
    for (const p of problems) console.log(`   - ${p}`)
  }
  console.log(`  screenshots in ${SHOTS}/`)
  process.exit(problems.length ? 1 : 0)
}

main()
