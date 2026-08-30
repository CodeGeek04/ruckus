// app/api/image/route.ts
import { put } from '@vercel/blob'

// Generation was measured at roughly 12s, and the blob upload at 1.5s. The
// ceiling is generous because the phone is already showing a live progress
// state and a slow picture is much better than a missing one.
export const maxDuration = 60

const MODEL = 'gemini-3.1-flash-image'
const GENERATE_TIMEOUT_MS = 40_000

/**
 * Prepended to every player sentence. Two jobs: keep the whole game looking
 * like one set of pictures, and keep words out of the images, because a chain
 * where the model helpfully writes the sentence on the picture is a dead chain.
 */
const STYLE =
  'Flat cartoon vector illustration. Bold flat colours, thick clean outlines, ' +
  'simple shapes, plain uncluttered background. Absolutely no text, no letters, ' +
  'no words, no numbers, no captions, no speech bubbles anywhere in the image. ' +
  'Keep it light hearted and suitable for a party of friends. Draw exactly this: '

const MAX_PROMPT = 200

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return Response.json({ url: null, reason: 'unconfigured' })

  let prompt: string
  try {
    const body = (await request.json()) as { prompt?: unknown }
    if (typeof body.prompt !== 'string') return Response.json({ url: null, reason: 'bad-request' })
    prompt = body.prompt.replace(/\s+/g, ' ').trim().slice(0, MAX_PROMPT)
  } catch {
    return Response.json({ url: null, reason: 'bad-request' })
  }
  if (prompt.length === 0) return Response.json({ url: null, reason: 'empty' })

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: STYLE + prompt }] }] }),
        signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
      }
    )

    if (!res.ok) return Response.json({ url: null, reason: `http-${res.status}` })

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[]
    }

    // A refusal comes back as a normal response with no image part in it, so
    // this is the safety path as well as the failure path.
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
    const data = part?.inlineData?.data
    if (!data) return Response.json({ url: null, reason: 'no-image' })

    const contentType = part?.inlineData?.mimeType ?? 'image/jpeg'
    const extension = contentType.includes('png') ? 'png' : 'jpg'

    // Measured: the base64 image is about 1.0 MB, and an AppSync event caps out
    // at 240 KB, so the bytes cannot travel on the bus. They go to blob storage
    // and only the url, about 120 characters, is ever broadcast.
    const blob = await put(`telephone/${Date.now()}.${extension}`, Buffer.from(data, 'base64'), {
      access: 'public',
      contentType,
      addRandomSuffix: true,
    })

    return Response.json({ url: blob.url })
  } catch (error) {
    console.error('image generation failed', error)
    return Response.json({ url: null, reason: 'error' })
  }
}
