// lib/games/hearsay/questions.ts
import type { Question } from './state'

/**
 * 20 seed questions across five families. Families exist so decoys can be
 * chosen coherently: that grouping is what makes the accused's guess a
 * deduction rather than a coin flip.
 *
 * Grow this with scripts/generate-questions.mjs.
 */
export const QUESTION_BANK: Question[] = [
  { id: 'c1', family: 'conflict', tone: 'mild', template: 'Who is {X} most likely to get into an argument with?' },
  { id: 'c2', family: 'conflict', tone: 'mild', template: 'Who would {X} refuse to share a hotel room with?' },
  { id: 'c3', family: 'conflict', tone: 'mild', template: 'Who does {X} always disagree with about food?' },
  { id: 'c4', family: 'conflict', tone: 'spicy', template: 'Who does {X} secretly find annoying?' },

  { id: 'a1', family: 'affection', tone: 'mild', template: 'Who would {X} go on a road trip with?' },
  { id: 'a2', family: 'affection', tone: 'mild', template: 'Who does {X} miss the most when the group is apart?' },
  { id: 'a3', family: 'affection', tone: 'mild', template: 'Who would {X} want on their team for anything at all?' },
  { id: 'a4', family: 'affection', tone: 'spicy', template: 'Who is {X} closest to and would never admit it?' },

  { id: 'x1', family: 'chaos', tone: 'mild', template: 'Who would {X} get lost in a new city with?' },
  { id: 'x2', family: 'chaos', tone: 'mild', template: 'Who would {X} accidentally get arrested with?' },
  { id: 'x3', family: 'chaos', tone: 'mild', template: 'Who would {X} start a terrible business with?' },
  { id: 'x4', family: 'chaos', tone: 'spicy', template: 'Who would {X} do something they both regret with?' },

  { id: 't1', family: 'trust', tone: 'mild', template: 'Who would {X} call at 3am in an actual emergency?' },
  { id: 't2', family: 'trust', tone: 'mild', template: 'Who would {X} trust with their unlocked phone?' },
  { id: 't3', family: 'trust', tone: 'mild', template: 'Who would {X} lend a large amount of money to?' },
  { id: 't4', family: 'trust', tone: 'mild', template: 'Who would {X} want handling things if they were in trouble?' },

  { id: 's1', family: 'secrets', tone: 'mild', template: 'Who knows the most embarrassing story about {X}?' },
  { id: 's2', family: 'secrets', tone: 'mild', template: 'Who would {X} tell something they told nobody else?' },
  { id: 's3', family: 'secrets', tone: 'mild', template: 'Who would find out first if {X} was lying?' },
  { id: 's4', family: 'secrets', tone: 'mild', template: 'Who does {X} tell things to before anyone else?' },
  { id: 's5', family: 'secrets', tone: 'spicy', template: 'Who has {X} definitely talked about behind their back?' },
  { id: 's6', family: 'secrets', tone: 'spicy', template: 'Who would be least surprised by {X} at their worst?' },
]

// Mild counts per family: conflict 3, affection 3, chaos 3, trust 4, secrets 4.
// Every family needs at least 3 mild entries, otherwise a mild room cannot be
// served two same-family decoys and pickQuestion silently falls back to
// another family. Keep that invariant when growing the bank.

export function renderQuestion(question: Question, accusedName: string): string {
  return question.template.replaceAll('{X}', accusedName)
}

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function pickOne<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

/** Below this many voters the tally is too thin to separate similar questions. */
const THIN_EVIDENCE_VOTERS = 4

export type PickArgs = {
  tone: 'mild' | 'spicy'
  voterCount: number
  usedQuestionIds: readonly string[]
}

export type Picked = { question: Question; options: Question[] }

export function pickQuestion({ tone, voterCount, usedQuestionIds }: PickArgs): Picked {
  // A mild room never sees spicy questions. A spicy room sees everything.
  const allowed = QUESTION_BANK.filter((q) => (tone === 'mild' ? q.tone === 'mild' : true))

  const unused = allowed.filter((q) => !usedQuestionIds.includes(q.id))
  const pool = unused.length > 0 ? unused : allowed

  const question = pickOne(pool)

  const sameFamily = allowed.filter((q) => q.family === question.family && q.id !== question.id)
  const otherFamilies = allowed.filter((q) => q.family !== question.family)

  // Thin evidence: decoys from other families, so the vote pattern actually
  // separates them. Rich evidence: same-family decoys, which is much harder.
  const preferred = voterCount < THIN_EVIDENCE_VOTERS ? otherFamilies : sameFamily
  const fallback = voterCount < THIN_EVIDENCE_VOTERS ? sameFamily : otherFamilies

  const decoys = [...shuffled(preferred), ...shuffled(fallback)].slice(0, 2)

  return { question, options: shuffled([question, ...decoys]) }
}
