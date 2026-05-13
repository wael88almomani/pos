import { type ReactNode } from 'react'

type Props = {
  title: string
  actions?: ReactNode
}

export function OldStyleHeader({ title, actions }: Props) {
  return (
    <div className="flex items-center justify-between border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 shadow">
      <h1 className="text-lg font-black text-[#1a1a1a]">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function OldStyleButton({
  children,
  onClick,
  variant = 'primary',
  className = '',
  ...props
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  className?: string
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  const baseClass =
    variant === 'primary'
      ? 'border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] text-white font-black'
      : 'border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] font-bold'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClass} px-4 py-1.5 text-sm shadow hover:from-[#b8ddf8] ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function OldStyleModal({
  title,
  children,
  onClose,
  width = 'max-w-md'
}: {
  title: string
  children: ReactNode
  onClose: () => void
  width?: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className={`w-full ${width} border-2 border-[#808080] bg-[#d0d0d0] shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2">
          <h2 className="text-base font-black text-[#1a1a1a]">{title}</h2>
        </div>
        {children}
      </div>
    </div>
  )
}
