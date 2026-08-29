'use client'

export function BigButton({
  children,
  onClick,
  selected = false,
  disabled = false,
}: {
  children: React.ReactNode
  onClick: () => void
  selected?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl border-4 px-5 py-6 text-left text-xl font-bold transition active:scale-[0.98] disabled:opacity-40 ${
        selected ? 'border-white bg-white text-black' : 'border-white/30 bg-white/5 text-white'
      }`}
    >
      {children}
    </button>
  )
}
