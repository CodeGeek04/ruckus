// Grow the Hearsay question bank.
//
//   node scripts/generate-questions.mjs conflict 10
//   node scripts/generate-questions.mjs all 8
//
// Uses the Anthropic API directly (ANTHROPIC_KEY in .env.local). Bedrock is not
// used here: the AWS account gates Anthropic models behind a use case form.
//
// Output is ready to paste into lib/games/hearsay/questions.ts. READ EVERY LINE
// BEFORE PASTING. The bank is the game, and a cruel question ruins a night.
import { readFileSync } from 'node:fs'

const FAMILIES = ['conflict', 'affection', 'chaos', 'trust', 'secrets']

// Two-letter prefixes: conflict and chaos both start with c, so a single
// letter collides and produces duplicate ids across batches.
const ID_PREFIX = { conflict: 'cf', affection: 'af', chaos: 'ch', trust: 'tr', secrets: 'se' }

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => {
      const at = line.indexOf('=')
      // Values may be quoted in .env.local; strip a matching pair.
      const value = line.slice(at + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
      return [line.slice(0, at).trim(), value]
    })
)

const API_KEY = env.ANTHROPIC_KEY
if (!API_KEY) {
  console.error('ANTHROPIC_KEY missing from .env.local')
  process.exit(1)
}

const requested = process.argv[2] ?? 'conflict'
const count = Number(process.argv[3] ?? 10)
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

Write ${count} questions.

Rules:
- Every question MUST contain {X} exactly once, and must be answerable by naming another person.
- Simple, everyday vocabulary. Short. Under 12 words where possible.
- No em dashes anywhere.
- Funny and warm, never cruel. Nothing about appearance, weight, money problems, family trouble, mental health, or anything that would genuinely hurt to hear read aloud.
- The joke should be about a situation, not an insult.
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

  const bad = questions.filter((q) => !q.includes('{X}') || q.includes('—'))
  if (bad.length) {
    console.error(`Rejected ${bad.length} malformed questions from the ${family} batch:`)
    for (const q of bad) console.error(`  ${q}`)
  }

  return { family, questions: questions.filter((q) => q.includes('{X}') && !q.includes('—')), usage: body.usage }
}

let inputTokens = 0
let outputTokens = 0

for (const family of families) {
  const { questions, usage } = await generate(family)
  inputTokens += usage.input_tokens
  outputTokens += usage.output_tokens

  console.log(`\n  // ${family}`)
  questions.forEach((template, i) => {
    const id = `${ID_PREFIX[family]}${200 + i}`
    console.log(`  { id: '${id}', family: '${family}', tone: 'mild', template: ${JSON.stringify(template)} },`)
  })
}

// Sonnet pricing: $3 per million input tokens, $15 per million output.
const cost = (inputTokens * 3) / 1e6 + (outputTokens * 15) / 1e6
console.error(`\n[${inputTokens} in, ${outputTokens} out, about $${cost.toFixed(4)}]`)
