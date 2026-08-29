// scripts/generate-questions.mjs
// Usage: node scripts/generate-questions.mjs conflict 10
// Requires: AWS_PROFILE=ruckus with Bedrock access in ap-south-1. Bedrock also
// gates every Anthropic model behind a one time use case details form, filled
// in from the Bedrock console. Until that is done for the account, Converse
// answers ResourceNotFoundException for every Anthropic model id.
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'

const family = process.argv[2] ?? 'conflict'
const count = Number(process.argv[3] ?? 10)

const client = new BedrockRuntimeClient({ region: 'ap-south-1' })

const prompt = `Write ${count} party game questions for a group of close friends.

Every question asks the group to pick ONE person from the group, and must contain the placeholder {X} for the person being discussed.
Family: "${family}".
Rules:
- Simple vocabulary. Short. No em dashes.
- Funny, never cruel. Nothing about appearance, money problems, or family.
- Each must be answerable by pointing at a friend.

Return ONLY a JSON array of strings, no commentary.`

const response = await client.send(
  new ConverseCommand({
    modelId: 'global.anthropic.claude-sonnet-4-6',
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 1500 },
  })
)

const text = response.output.message.content[0].text
const questions = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1))

questions.forEach((template, i) => {
  console.log(`  { id: '${family[0]}${100 + i}', family: '${family}', tone: 'mild', template: ${JSON.stringify(template)} },`)
})
