// Grow the Hearsay question bank.
//
//   node scripts/generate-questions.mjs conflict 10
//   node scripts/generate-questions.mjs all 8 gurgaon spicy
//
// Third argument is a theme key from THEMES, fourth is mild or spicy.
//
// Uses the Anthropic API directly (ANTHROPIC_KEY in .env.local). Bedrock is not
// used here: the AWS account gates Anthropic models behind a use case form.
//
// Output is ready to paste into lib/games/hearsay/questions.ts. READ EVERY LINE
// BEFORE PASTING. The bank is the game, and a cruel question ruins a night.
import { readEnvLocal } from './env-local.mjs'

const FAMILIES = ['conflict', 'affection', 'chaos', 'trust', 'secrets']

// Two-letter prefixes: conflict and chaos both start with c, so a single
// letter collides and produces duplicate ids across batches.
const ID_PREFIX = { conflict: 'cf', affection: 'af', chaos: 'ch', trust: 'tr', secrets: 'se' }

const env = readEnvLocal()

const API_KEY = env.ANTHROPIC_KEY
if (!API_KEY) {
  console.error('ANTHROPIC_KEY missing from .env.local')
  process.exit(1)
}

const requested = process.argv[2] ?? 'conflict'
const count = Number(process.argv[3] ?? 10)
const theme = process.argv[4] ?? 'none'
const tone = process.argv[5] === 'spicy' ? 'spicy' : 'mild'

// The group is a set of close friends in Delhi and Gurgaon. Generic party game
// questions are forgettable; the specific ones are what make people shout.
const THEMES = {
  none: '',
  gurgaon: `Set these in Gurgaon corporate life. Draw on: Cyber Hub and Sector 29 nights out, DLF sector addresses nobody can find, the Rapid Metro, office parks, cab reimbursement claims, standup calls with cameras off, the annual Gurgaon flooding, laptop bags at brunch, LinkedIn posts, appraisal season.`,
  delhi: `Set these in Delhi city life. Draw on: Connaught Place, Hauz Khas, Sarojini bargaining, Karol Bagh, Majnu ka Tila, the Blue Line metro, DTC buses, Old Delhi food runs, winter smog and air purifiers, the summer heat, farmhouse parties, aunties, wedding season.`,
  bangalore: `The whole group despises Bangalore and this is a running joke. Draw on: Silk Board junction, Koramangala, HSR Layout, three hour commutes, the smugness about the weather, startup founders, PG accommodation, potholes, everyone who moved there and will not shut up about it.`,
  chaos: `Set these in everyday Indian app and food chaos. Draw on: Blinkit orders at 2am, Zomato and Swiggy, Ola and Uber drivers cancelling, splitting bills and who never pays, chai and cigarette breaks, momos, the group trip that never happens, someone always being late, the WhatsApp group nobody replies in.`,
}

if (!(theme in THEMES)) {
  console.error(`Unknown theme "${theme}". Pick one of: ${Object.keys(THEMES).join(', ')}.`)
  process.exit(1)
}
const families = requested === 'all' ? FAMILIES : [requested]

if (requested !== 'all' && !FAMILIES.includes(requested)) {
  console.error(`Unknown family "${requested}". Pick one of: ${FAMILIES.join(', ')}, or "all".`)
  process.exit(1)
}

const FAMILY_BRIEFS = {
  conflict: 'friction, arguments, rivalry, mild irritation between two people',
  affection: 'closeness, loyalty, who someone actually likes being around',
  chaos: 'bad decisions, disasters, schemes that go wrong, being led astray',
  trust: 'reliability, who you would depend on when it genuinely matters',
  secrets: 'gossip, who knows what, who would find out, who tells whom',
}

async function generate(family) {
  const prompt = `You are writing questions for a party game played by a group of close friends.

Each question asks the group to point at ONE person in the room. The question is about a specific player, written as the placeholder {X}.

Family for this batch: "${family}" (${FAMILY_BRIEFS[family]}).

${THEMES[theme]}

Write ${count} questions.

Rules:
- Every question MUST contain {X} exactly once.
- Every question must END WITH A QUESTION MARK. Never write a statement.
- CRITICAL: the ONLY valid answer is the name of another person in the room. Never ask "how long", "how much", "how many", "what" or anything answerable with a duration, an amount, a yes or no, or a thing. If the question cannot be answered by pointing at a friend, it is wrong.
- Simple, everyday vocabulary. Short. Under 12 words where possible.
- No em dashes anywhere.
${
    tone === 'spicy'
      ? `- These are close friends who enjoy being roasted. Be pointed and personal: who is the problem, who is secretly judging, who talks about whom, crushes, petty grudges, being called out.
- Still never cruel about appearance, weight, money problems, family trouble or mental health. Aim at behaviour and reputation, which people enjoy defending.`
      : `- Funny and warm, never cruel. Nothing about appearance, weight, money problems, family trouble, mental health, or anything that would genuinely hurt to hear read aloud.
- The joke should be about a situation, not an insult.`
  }
- The joke should be about a situation or a reputation, not an insult about who someone is.
- Vary the shape. Do not start every question with "Who is".
- These must feel different from each other, not ten rewordings of one idea.

Return ONLY a JSON array of strings. No commentary, no markdown fence.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    console.error(`Anthropic API ${res.status}: ${await res.text()}`)
    process.exit(1)
  }

  const body = await res.json()
  // Not every content block is text (thinking blocks, tool blocks), so find the
  // first one that is rather than assuming index 0.
  const block = body.content.find((b) => b.type === 'text')
  if (!block) {
    console.error(`No text block in the ${family} response:`, JSON.stringify(body).slice(0, 500))
    process.exit(1)
  }
  const text = block.text
  const questions = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1))

  // Every question must end in a question mark and ask for a person. Batches
  // regularly return statements like "{X} is the one who stays", which cannot
  // be answered by pointing at anyone.
  const asksForAPerson = /\b(who|whom|whose|which (person|friend|coworker|colleague|one))\b/i
  const valid = (q) =>
    q.includes('{X}') && !q.includes('\u2014') && q.trim().endsWith('?') && asksForAPerson.test(q)

  const bad = questions.filter((q) => !valid(q))
  if (bad.length) {
    console.error(`Rejected ${bad.length} malformed questions from the ${family} batch:`)
    for (const q of bad) console.error(`  ${q}`)
  }

  return { family, questions: questions.filter(valid), usage: body.usage }
}

let inputTokens = 0
let outputTokens = 0

for (const family of families) {
  const { questions, usage } = await generate(family)
  inputTokens += usage.input_tokens
  outputTokens += usage.output_tokens

  console.log(`\n  // ${family}`)
  questions.forEach((template, i) => {
    const id = `${ID_PREFIX[family]}-${theme}-${tone[0]}${i}`
    console.log(`  { id: '${id}', family: '${family}', tone: '${tone}', template: ${JSON.stringify(template)} },`)
  })
}

// Sonnet pricing: $3 per million input tokens, $15 per million output.
const cost = (inputTokens * 3) / 1e6 + (outputTokens * 15) / 1e6
console.error(`\n[${inputTokens} in, ${outputTokens} out, about $${cost.toFixed(4)}]`)
