import { initials } from '@/lib/text'
import type { Player } from '@/lib/types'

export function PlayerChip({ player, size = 'md' }: { player: Player; size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = { sm: 'h-8 w-8 text-sm', md: 'h-14 w-14 text-xl', lg: 'h-24 w-24 text-4xl' }[size]

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`${dimensions} grid place-items-center rounded-full font-black text-black ${player.connected ? '' : 'opacity-30'}`}
        style={{ backgroundColor: player.color }}
      >
        {initials(player.name)}
      </div>
      <span className="text-xs font-bold uppercase tracking-wide text-white/80">{player.name}</span>
    </div>
  )
}
