'use client'

let ctx: AudioContext | null = null

const TONES: Record<string, { freq: number; ms: number; type: OscillatorType }> = {
  evidence: { freq: 220, ms: 400, type: 'sawtooth' },
  verdict: { freq: 660, ms: 250, type: 'square' },
  ended: { freq: 880, ms: 700, type: 'sine' },
}

export function playSound(name: string) {
  const tone = TONES[name]
  if (!tone) return

  try {
    ctx ??= new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = tone.type
    osc.frequency.value = tone.freq
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + tone.ms / 1000)

    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + tone.ms / 1000)
  } catch {
    // Autoplay policy blocked it until the host interacts. Silence is survivable.
  }
}
