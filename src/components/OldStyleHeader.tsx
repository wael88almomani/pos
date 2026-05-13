import { type ReactNode } from 'react'

type Props = {
  title: string
  actions?: ReactNode
}

export function OldStyleHeader({ title, actions }: Props) {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-white to-gray-50 px-4 py-3 shadow-sm">
      <h1 className="text-xl font-bold text-blue-700">{title}</h1>
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
      ? 'rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg active:scale-95'
      : 'rounded-lg border-2 border-gray-300 bg-white font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClass} px-4 py-2 text-sm ${className}`}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`w-full ${width} overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3">
          <h2 className="text-base font-bold text-white">{title}</h2>
        </div>
        {children}
      </div>
    </div>
  )
}
