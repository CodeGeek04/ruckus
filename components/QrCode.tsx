'use client'

import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (ref.current) {
      QRCode.toCanvas(ref.current, value, { width: size, margin: 1, color: { dark: '#17161d', light: '#fdfcf7' } })
    }
  }, [value, size])

  return <canvas ref={ref} className="rounded-xl bg-[var(--color-chalk)] p-2" />
}
