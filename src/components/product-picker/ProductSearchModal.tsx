import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Search, X } from 'lucide-react'

export type PickedProduct = {
  id: string
  name: string
  salePrice: number
  purchasePrice: number
  quantity: number
  barcode: string | null
  barcodes: { barcode: string; variantName: string | null }[]
}

type Props = {
  open: boolean
  title?: string
  onClose: () => void
  onPick: (p: PickedProduct) => void
  /** When true, focus search on open */
  autoFocus?: boolean
}

export function ProductSearchModal({ open, title = 'اختر منتجًا', onClose, onPick, autoFocus = true }: Props) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [items, setItems] = useState<PickedProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 120)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(async () => {
    if (!open) return
    setLoading(true)
    try {
      const res = await window.posApi.products.searchAdvanced({ query: debounced, limit: 100 })
      if (res.ok && 'items' in res) {
        setItems(res.items as PickedProduct[])
        setHighlight(0)
      }
    } finally {
      setLoading(false)
    }
  }, [open, debounced])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (open && autoFocus) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
    if (!open) setQ('')
  }, [open, autoFocus])

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 52,
    overscan: 12
  })

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => Math.min(h + 1, Math.max(0, items.length - 1)))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => Math.max(h - 1, 0))
      }
      if (e.key === 'Enter' && items[highlight]) {
        e.preventDefault()
        onPick(items[highlight])
        onClose()
      }
      if (e.key === 'Escape') onClose()
    },
    [highlight, items, onClose, onPick]
  )

  const vItems = useMemo(() => rowVirtualizer.getVirtualItems(), [rowVirtualizer, items.length])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-sm border border-[#808080] bg-white shadow-xl"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[#808080] bg-[#e8e8e8] px-3 py-2">
          <div className="text-sm font-bold text-slate-900">{title}</div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-sm border border-[#888] bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            onClick={onClose}
          >
            <span>إغلاق</span>
            <X className="h-3.5 w-3.5 opacity-70" />
          </button>
        </div>
        <div className="relative border-b border-[#ccc] bg-white p-3">
          <Search className="absolute right-6 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            ref={inputRef}
            className="w-full rounded-sm border border-[#888] bg-white py-2.5 pl-3 pr-10 text-sm outline-none focus:border-[#1565c0] focus:ring-1 focus:ring-[#1565c0]/40"
            placeholder="بحث: اسم، باركود، مختصر…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {loading && <div className="text-xs text-slate-500 mt-2">جاري البحث…</div>}
        </div>
        <div ref={listRef} className="flex-1 min-h-[200px] max-h-[50vh] overflow-auto p-2">
          <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
            {vItems.map((vi) => {
              const p = items[vi.index]
              if (!p) return null
              const active = vi.index === highlight
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`absolute left-2 right-2 rounded-sm border px-3 py-2 text-right text-sm transition ${
                    active
                      ? 'border-[#1976d2] bg-[#e3f2fd]'
                      : 'border-transparent hover:bg-slate-100'
                  }`}
                  style={{ transform: `translateY(${vi.start}px)`, width: 'calc(100% - 16px)' }}
                  onMouseEnter={() => setHighlight(vi.index)}
                  onClick={() => {
                    onPick(p)
                    onClose()
                  }}
                >
                  <div className="font-medium line-clamp-1">{p.name}</div>
                  <div className="text-xs text-slate-500 font-mono flex justify-between gap-2 mt-0.5">
                    <span>{p.barcode ?? p.barcodes[0]?.barcode ?? '—'}</span>
                    <span>{p.salePrice.toFixed(2)}</span>
                  </div>
                </button>
              )
            })}
          </div>
          {!items.length && !loading && (
            <div className="py-12 text-center text-sm text-slate-500">لا نتائج — جرّب باركودًا أو جزءًا من الاسم</div>
          )}
        </div>
        <div className="border-t border-[#808080] bg-[#ececec] px-3 py-1.5 text-[10px] text-slate-700">
          الأسهم · Enter للاختيار · Esc للإغلاق
        </div>
      </div>
    </div>
  )
}
