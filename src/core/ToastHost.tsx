import { useToastStore } from './toast-store'

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="fixed bottom-4 left-4 z-[200] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            'pointer-events-auto rounded-xl px-4 py-3 text-sm shadow-lg border',
            t.type === 'ok'
              ? 'bg-emerald-950/90 text-emerald-50 border-emerald-700'
              : 'bg-red-950/90 text-red-50 border-red-700'
          ].join(' ')}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
