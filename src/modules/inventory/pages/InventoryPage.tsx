import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { arSA } from 'date-fns/locale'
import { Package, ChevronLeft, ChevronRight } from 'lucide-react'
import { ProductSearchModal, type PickedProduct } from '../../../components/product-picker/ProductSearchModal'
import { Can } from '../../../core/Can'
import { useAuthStore } from '../../../core/stores/auth-store'
import { useToastStore } from '../../../core/toast-store'
import { ProductEditorModal, type InventoryProduct } from '../components/ProductEditorModal'
import {
  EnterpriseModalFrame,
  EnterpriseToolbar,
  enterprisePageRootClass
} from '../../shared/EnterpriseToolbar'

const MOVE_LABELS: Record<string, string> = {
  stock_in: 'Ø¥Ø¯Ø®Ø§Ù„ Ù…Ø®Ø²ÙˆÙ†',
  stock_out: 'Ø¥Ø®Ø±Ø§Ø¬ Ù…Ø®Ø²ÙˆÙ†',
  adjustment: 'ØªØ¹Ø¯ÙŠÙ„',
  damage: 'ØªÙ„Ù',
  waste: 'Ù‡Ø§Ù„Ùƒ',
  sale: 'Ø¨ÙŠØ¹',
  purchase: 'Ù…Ø´ØªØ±ÙŠØ§Øª'
}

type LowRow = { id: string; name: string; quantity: number; minStock: number }

type MoveRow = {
  id: string
  productId: string
  type: string
  productName: string
  quantity: number
  createdAt: string
  refType?: string | null
  note?: string | null
}

type StockRow = {
  id: string
  name: string
  categoryId: string | null
  categoryName: string | null
  quantity: number
  minStock: number
  expiryDate: string | null
}

type ExpiryStatus = 'all' | 'expired' | 'near' | 'ok' | 'none'

function getExpiryStatus(expiryDate: string | null): Exclude<ExpiryStatus, 'all'> {
  if (!expiryDate) return 'none'
  const d = new Date(expiryDate)
  if (Number.isNaN(d.getTime())) return 'none'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in30 = new Date(today)
  in30.setDate(in30.getDate() + 30)
  if (d.getTime() < today.getTime()) return 'expired'
  if (d.getTime() <= in30.getTime()) return 'near'
  return 'ok'
}

export function InventoryPage() {
  const toast = useToastStore((s) => s.push)
  const can = useAuthStore((s) => s.can)
  const [low, setLow] = useState<LowRow[]>([])
  const [moves, setMoves] = useState<MoveRow[]>([])
  const [stockRows, setStockRows] = useState<StockRow[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [stockCategoryFilter, setStockCategoryFilter] = useState('')
  const [expiryFilter, setExpiryFilter] = useState<ExpiryStatus>('all')
  const [activeProduct, setActiveProduct] = useState<InventoryProduct | null>(null)
  const [productEditorOpen, setProductEditorOpen] = useState(false)
  const [productReadonlyOpen, setProductReadonlyOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [picked, setPicked] = useState<PickedProduct | null>(null)
  const [type, setType] = useState('stock_in')
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [activeTab, setActiveTab] = useState<'low' | 'moves' | 'expiry'>('low')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 200

  const loadCategories = useCallback(async () => {
    const r = await window.posApi.products.categories()
    if (r.ok && 'items' in r) setCategories((r.items as { id: string; name: string }[]) ?? [])
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, b, stock] = await Promise.all([
        window.posApi.inventory.lowStock(),
        window.posApi.inventory.movements({}),
        window.posApi.products.list({ page, pageSize })
      ])
      if (a.ok && 'items' in a) {
        const raw = a.items as { id: string; name: string; quantity: number; minStock: number }[]
        setLow(raw.map((x) => ({ id: x.id, name: x.name, quantity: x.quantity, minStock: x.minStock })))
      }
      if (b.ok && 'items' in b) setMoves(b.items as MoveRow[])
      if (stock.ok && 'items' in stock) {
        const raw = stock.items as InventoryProduct[]
        setStockRows(
          raw.map((x) => ({
            id: x.id,
            name: x.name,
            categoryId: x.categoryId ?? null,
            categoryName: x.categoryName ?? null,
            quantity: x.quantity,
            minStock: x.minStock,
            expiryDate: x.expiryDate ?? null
          }))
        )
        if ('pagination' in stock && stock.pagination) {
          setTotalPages((stock.pagination as any).totalPages || 1)
          setTotalCount((stock.pagination as any).totalCount || 0)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  useEffect(() => {
    void load()
    void loadCategories()
  }, [load, loadCategories])

  const fmtIso = useCallback((iso: string) => {
    try {
      return format(new Date(iso), 'd MMM yyyy HH:mm', { locale: arSA })
    } catch {
      return iso
    }
  }, [])

  async function apply() {
    if (!picked) {
      toast('Ø§Ø®ØªØ± Ù…Ù†ØªØ¬Ø§Ù‹ Ù…Ù† Ø§Ù„Ù‚Ø§Ø¦Ù…Ø©', 'err')
      return
    }
    const r = await window.posApi.inventory.applyMove({
      type,
      productId: picked.id,
      quantity: Number(qty),
      note: note || undefined,
      unitCost: unitCost ? Number(unitCost) : undefined
    })
    if (r.ok) {
      toast('ØªÙ… ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù…Ø®Ø²ÙˆÙ†')
      setMoveOpen(false)
      setPicked(null)
      setQty('1')
      setNote('')
      setUnitCost('')
      void load()
    } else {
      const code = (r as { code?: string }).code
      if (code === 'NEGATIVE_STOCK' || (r as { error?: string }).error === 'NEGATIVE_STOCK')
        toast('Ø§Ù„ÙƒÙ…ÙŠØ© ØºÙŠØ± ÙƒØ§ÙÙŠØ© ÙÙŠ Ø§Ù„Ù…Ø®Ø²ÙˆÙ†', 'err')
      else toast('ÙØ´Ù„ Ø§Ù„Ø­Ø±ÙƒØ©', 'err')
    }
  }

  const pickedSummary = useMemo(() => {
    if (!picked) return null
    return `${picked.name} â€” Ø§Ù„Ù…ØªÙˆÙÙ‘Ø±: ${picked.quantity}`
  }, [picked])

  const filteredStockRows = useMemo(() => {
    return stockRows.filter((x) => {
      if (stockCategoryFilter && x.categoryId !== stockCategoryFilter) return false
      if (expiryFilter === 'all') return true
      return getExpiryStatus(x.expiryDate) === expiryFilter
    })
  }, [stockRows, stockCategoryFilter, expiryFilter])

  const openProductCard = useCallback(
    async (id: string) => {
      const r = await window.posApi.products.get(id)
      if (!r.ok || !('product' in r)) {
        toast('ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø¨Ø·Ø§Ù‚Ø© Ø§Ù„Ù…Ù†ØªØ¬', 'err')
        return
      }
      const pr = r.product as InventoryProduct
      setActiveProduct(pr)
      if (can('product.write')) setProductEditorOpen(true)
      else setProductReadonlyOpen(true)
    },
    [can, toast]
  )

  const nearExpiry = useMemo(() => {
    return stockRows.filter((x) => {
      const st = getExpiryStatus(x.expiryDate)
      return st === 'expired' || st === 'near'
    }).length
  }, [stockRows])

  return (
    <div className={`${enterprisePageRootClass} page-microtype inventory-microtype`}>
      <EnterpriseToolbar
        title="Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹ ÙˆØ§Ù„Ø­Ø±ÙƒØ§Øª"
        actions={
          <Can perm="inventory.write">
            <button
              type="button"
              className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-all"
              onClick={() => {
                setMoveOpen(true)
                setPickerOpen(false)
              }}
            >
              ØªØ³Ø¬ÙŠÙ„ Ø­Ø±ÙƒØ© Ù…Ø®Ø²ÙˆÙ†
            </button>
          </Can>
        }
      />

      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-red-50 to-red-100 p-4 shadow-lg">
            <div className="text-xs font-bold text-slate-700 mb-1">Ù…Ù†ØªØ¬Ø§Øª ØªØ­Øª Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰</div>
            <div className="text-3xl font-bold font-mono text-red-600">{low.length}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-blue-50 to-blue-100 p-4 shadow-lg">
            <div className="text-xs font-bold text-slate-700 mb-1">Ø­Ø±ÙƒØ§Øª Ø§Ù„ÙŠÙˆÙ…</div>
            <div className="text-3xl font-bold font-mono text-blue-600">{moves.length}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-orange-50 to-orange-100 p-4 shadow-lg">
            <div className="text-xs font-bold text-slate-700 mb-1">Ù…Ù†ØªØ¬Ø§Øª Ù‚Ø±ÙŠØ¨Ø©/Ù…Ù†ØªÙ‡ÙŠØ© Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ©</div>
            <div className="text-3xl font-bold font-mono text-orange-600">{nearExpiry}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          <div className="flex flex-wrap border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
            <button
              onClick={() => setActiveTab('low')}
              className={`flex-1 min-w-[11rem] border-l border-gray-200 px-4 py-3 text-sm font-bold transition-all ${
                activeTab === 'low'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-700 hover:bg-white/50'
              }`}
            >
              ØªÙ†Ø¨ÙŠÙ‡Ø§Øª Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ ({low.length})
            </button>
            <button
              onClick={() => setActiveTab('moves')}
              className={`flex-1 min-w-[11rem] border-l border-gray-200 px-4 py-3 text-sm font-bold transition-all ${
                activeTab === 'moves'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-700 hover:bg-white/50'
              }`}
            >
              Ø¢Ø®Ø± Ø§Ù„Ø­Ø±ÙƒØ§Øª ({moves.length})
            </button>
            <button
              onClick={() => setActiveTab('expiry')}
              className={`flex-1 min-w-[11rem] px-4 py-3 text-sm font-bold transition-all ${
                activeTab === 'expiry'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-700 hover:bg-white/50'
              }`}
            >
              ØªÙ‚Ø±ÙŠØ± Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ©
            </button>
          </div>

          <div className="bg-white p-4">
            {activeTab === 'low' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                      <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">Ø§Ù„Ù…Ù†ØªØ¬</th>
                      <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">Ø§Ù„Ù…ØªÙˆÙØ±</th>
                      <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰</th>
                      <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª</th>
                    </tr>
                  </thead>
                  <tbody>
                    {low.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                        <td className="border-l border-gray-100 p-2.5">{p.name}</td>
                        <td className="border-l border-gray-100 p-2.5 text-center font-mono font-bold text-red-600">
                          {p.quantity}
                        </td>
                        <td className="border-l border-gray-100 p-2.5 text-center font-mono">{p.minStock}</td>
                        <td className="border-l border-gray-100 p-2.5 text-center">
                          <button
                            onClick={() => void openProductCard(p.id)}
                            className="rounded-lg border-2 border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-gray-50 hover:shadow-md transition-all"
                          >
                            Ø¹Ø±Ø¶ Ø§Ù„ØªÙØ§ØµÙŠÙ„
                          </button>
                        </td>
                      </tr>
                    ))}
                    {low.length === 0 && (
                      <tr>
                        <td colSpan={4} className="border-l border-gray-100 p-8 text-center text-slate-500">
                          âœ“ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª ÙÙˆÙ‚ Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'moves' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                      <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">Ø§Ù„Ù†ÙˆØ¹</th>
                      <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">Ø§Ù„Ù…Ù†ØªØ¬</th>
                      <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">Ø§Ù„ÙƒÙ…ÙŠØ©</th>
                      <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">Ø§Ù„Ù…Ø±Ø¬Ø¹</th>
                      <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">Ø§Ù„ØªØ§Ø±ÙŠØ®</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moves.map((m) => (
                      <tr key={m.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                        <td className="border-l border-gray-100 p-2.5">
                          <span className="inline-block rounded-lg border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs font-bold text-slate-700">
                            {MOVE_LABELS[m.type] ?? m.type}
                          </span>
                        </td>
                        <td className="border-l border-gray-100 p-2.5">
                          <button
                            onClick={() => void openProductCard(m.productId)}
                            className="text-blue-600 hover:text-blue-700 hover:underline font-semibold transition-colors"
                          >
                            {m.productName}
                          </button>
                        </td>
                        <td className="border-l border-gray-100 p-2.5 text-center font-mono font-bold">
                          {m.quantity > 0 ? '+' : ''}{m.quantity}
                        </td>
                        <td className="border-l border-gray-100 p-2.5 text-xs">
                          {m.refType ?? 'â€”'}
                          {m.note ? ` â€¢ ${m.note}` : ''}
                        </td>
                        <td className="border-l border-gray-100 p-2.5 text-center text-xs font-mono">
                          {fmtIso(m.createdAt)}
                        </td>
                      </tr>
                    ))}
                    {moves.length === 0 && (
                      <tr>
                        <td colSpan={5} className="border-l border-gray-100 p-8 text-center text-slate-500">
                          Ù„Ø§ ØªÙˆØ¬Ø¯ Ø­Ø±ÙƒØ§Øª Ù…Ø³Ø¬Ù„Ø©
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'expiry' && (
              <>
                <div className="mb-4 flex flex-wrap gap-3 items-end">
                  <label className="text-sm space-y-1">
                    <span className="font-bold text-slate-700">Ø§Ù„ØªØµÙ†ÙŠÙ</span>
                    <select
                      className="block h-9 rounded-lg border border-gray-300 px-3 py-2 bg-white min-w-[12rem] shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      value={stockCategoryFilter}
                      onChange={(e) => setStockCategoryFilter(e.target.value)}
                    >
                      <option value="">Ø§Ù„ÙƒÙ„</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm space-y-1">
                    <span className="font-bold text-slate-700">Ø­Ø§Ù„Ø© Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ©</span>
                    <select
                      className="block h-9 rounded-lg border border-gray-300 px-3 py-2 bg-white min-w-[12rem] shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      value={expiryFilter}
                      onChange={(e) => setExpiryFilter(e.target.value as ExpiryStatus)}
                    >
                      <option value="all">Ø§Ù„ÙƒÙ„</option>
                      <option value="expired">Ù…Ù†ØªÙ‡ÙŠ</option>
                      <option value="near">Ù‚Ø±ÙŠØ¨ Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ (30 ÙŠÙˆÙ…)</option>
                      <option value="ok">Ø³Ø§Ø±ÙŠ</option>
                      <option value="none">Ø¨Ø¯ÙˆÙ† ØªØ§Ø±ÙŠØ® ØµÙ„Ø§Ø­ÙŠØ©</option>
                    </select>
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                        <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">Ø§Ù„Ù…Ù†ØªØ¬</th>
                        <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">Ø§Ù„ØªØµÙ†ÙŠÙ</th>
                        <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">Ø§Ù„ÙƒÙ…ÙŠØ©</th>
                        <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰</th>
                        <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">ØªØ§Ø±ÙŠØ® Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ©</th>
                        <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">Ø§Ù„Ø­Ø§Ù„Ø©</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStockRows.map((m) => {
                        const st = getExpiryStatus(m.expiryDate)
                        const rowCls =
                          st === 'expired'
                            ? 'bg-red-100'
                            : st === 'near'
                              ? 'bg-yellow-100'
                              : ''
                        const statusLabel =
                          st === 'expired'
                            ? 'Ù…Ù†ØªÙ‡ÙŠ âŒ'
                            : st === 'near'
                              ? 'Ù‚Ø±ÙŠØ¨ Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ âš ï¸'
                              : st === 'ok'
                                ? 'Ø³Ø§Ø±ÙŠ âœ“'
                                : 'Ø¨Ø¯ÙˆÙ† ØªØ§Ø±ÙŠØ®'
                        return (
                          <tr
                            key={m.id}
                            className={`border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors ${rowCls}`}
                            onClick={() => void openProductCard(m.id)}
                          >
                            <td className="border-l border-gray-100 p-2.5 font-semibold">{m.name}</td>
                            <td className="border-l border-gray-100 p-2.5">{m.categoryName ?? 'â€”'}</td>
                            <td className="border-l border-gray-100 p-2.5 text-center font-mono font-bold">
                              {m.quantity}
                            </td>
                            <td className="border-l border-gray-100 p-2.5 text-center font-mono">{m.minStock}</td>
                            <td className="border-l border-gray-100 p-2.5 text-center font-mono text-xs">
                              {m.expiryDate ? m.expiryDate.slice(0, 10) : 'â€”'}
                            </td>
                            <td className="border-l border-gray-100 p-2.5 text-center text-xs font-bold">
                              {statusLabel}
                            </td>
                          </tr>
                        )
                      })}
                      {filteredStockRows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="border-l border-gray-100 p-8 text-center text-slate-500">
                            Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ù†ØªØ¬Ø§Øª Ù…Ø·Ø§Ø¨Ù‚Ø© Ù„Ù„ØªØµÙÙŠØ©
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                      <div className="text-center">
                        <div className="mb-2 text-2xl">â³</div>
                        <div className="font-bold text-slate-700">Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù…ÙŠÙ„...</div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Pagination */}
                <div className="mt-4 flex items-center justify-center gap-3 border-t border-gray-200 pt-3">
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                    className="flex items-center gap-1 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronRight className="h-3 w-3" />
                    Ø§Ù„Ø³Ø§Ø¨Ù‚
                  </button>
                  <span className="font-mono text-sm font-bold text-slate-700">
                    ØµÙØ­Ø© {page} Ù…Ù† {totalPages} ({totalCount} Ù…Ù†ØªØ¬)
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loading}
                    className="flex items-center gap-1 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Ø§Ù„ØªØ§Ù„ÙŠ
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {moveOpen && (
        <EnterpriseModalFrame title="Ø­Ø±ÙƒØ© Ù…Ø®Ø²ÙˆÙ† ÙŠØ¯ÙˆÙŠØ©" onClose={() => setMoveOpen(false)} maxWidthClass="max-w-lg">
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-xs font-bold block mb-1">Ø§Ù„Ù…Ù†ØªØ¬</span>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="w-full flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-right hover:bg-gray-50 shadow-sm focus:ring-2 focus:ring-blue-500 transition-all"
              >
                <Package className="h-5 w-5 shrink-0 text-slate-600" />
                <span className="flex-1 truncate font-semibold">{pickedSummary ?? 'Ø§Ø¶ØºØ· Ù„Ø§Ø®ØªÙŠØ§Ø± Ù…Ù†ØªØ¬ Ù…Ù† Ø§Ù„Ø¨Ø­Ø«â€¦'}</span>
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-bold">Ù†ÙˆØ¹ Ø§Ù„Ø­Ø±ÙƒØ©</span>
              <select
                className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 py-2 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="stock_in">Ø¥Ø¯Ø®Ø§Ù„ Ù…Ø®Ø²ÙˆÙ†</option>
                <option value="stock_out">Ø¥Ø®Ø±Ø§Ø¬ Ù…Ø®Ø²ÙˆÙ†</option>
                <option value="adjustment">ØªØ¹Ø¯ÙŠÙ„ ÙƒÙ…ÙŠØ©</option>
                <option value="damage">ØªÙ„Ù</option>
                <option value="waste">Ù‡Ø§Ù„Ùƒ</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold">Ø§Ù„ÙƒÙ…ÙŠØ©</span>
              <input
                className="w-full h-9 rounded-lg border border-gray-300 px-3 py-2 font-mono shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold">ØªÙƒÙ„ÙØ© Ø§Ù„ÙˆØ­Ø¯Ø© (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)</span>
              <input
                className="w-full h-9 rounded-lg border border-gray-300 px-3 py-2 font-mono shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold">Ù…Ù„Ø§Ø­Ø¸Ø©</span>
              <input
                className="w-full h-9 rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <Can perm="inventory.write">
              <button
                type="button"
                className="w-full rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 py-3 font-bold text-white shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-all"
                onClick={() => void apply()}
              >
                Ø­ÙØ¸ Ø§Ù„Ø­Ø±ÙƒØ©
              </button>
            </Can>
          </div>
        </EnterpriseModalFrame>
      )}

      <ProductSearchModal
        open={pickerOpen}
        title="Ø§Ø®ØªÙŠØ§Ø± Ù…Ù†ØªØ¬ Ù„Ù„Ø­Ø±ÙƒØ©"
        onClose={() => setPickerOpen(false)}
        onPick={(p) => {
          setPicked(p)
          setPickerOpen(false)
        }}
      />

      {productEditorOpen && activeProduct && (
        <ProductEditorModal
          categories={categories}
          reloadCategories={loadCategories}
          initial={activeProduct}
          onClose={() => {
            setProductEditorOpen(false)
            setActiveProduct(null)
          }}
          onSaved={() => {
            setProductEditorOpen(false)
            setActiveProduct(null)
            void load()
          }}
          titleOverride="Ø¨Ø·Ø§Ù‚Ø© Ø§Ù„Ù…Ù†ØªØ¬"
        />
      )}

      {productReadonlyOpen && activeProduct && (
        <EnterpriseModalFrame
          title={`Ø¨Ø·Ø§Ù‚Ø© Ø§Ù„Ù…Ù†ØªØ¬ â€” ${activeProduct.name}`}
          onClose={() => {
            setProductReadonlyOpen(false)
            setActiveProduct(null)
          }}
          maxWidthClass="max-w-lg"
        >
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-slate-50 p-3 shadow-sm">
                <div className="text-xs font-bold text-slate-600 mb-1">Ø§Ù„Ø§Ø³Ù…</div>
                <div className="font-semibold">{activeProduct.name}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-slate-50 p-3 shadow-sm">
                <div className="text-xs font-bold text-slate-600 mb-1">Ø§Ù„ØªØµÙ†ÙŠÙ</div>
                <div className="font-semibold">{activeProduct.categoryName ?? 'â€”'}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-slate-50 p-3 shadow-sm">
                <div className="text-xs font-bold text-slate-600 mb-1">Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…ØªÙˆÙØ±Ø©</div>
                <div className="font-mono font-bold text-lg">{activeProduct.quantity}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-slate-50 p-3 shadow-sm">
                <div className="text-xs font-bold text-slate-600 mb-1">Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰</div>
                <div className="font-mono font-bold text-lg">{activeProduct.minStock}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-slate-50 p-3 shadow-sm">
                <div className="text-xs font-bold text-slate-600 mb-1">Ø³Ø¹Ø± Ø§Ù„Ø¨ÙŠØ¹</div>
                <div className="font-mono font-bold">{activeProduct.salePrice.toFixed(2)} JD</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-slate-50 p-3 shadow-sm">
                <div className="text-xs font-bold text-slate-600 mb-1">ØªØ§Ø±ÙŠØ® Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ©</div>
                <div className="font-mono font-semibold">
                  {activeProduct.expiryDate ? activeProduct.expiryDate.slice(0, 10) : 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯'}
                </div>
              </div>
            </div>
          </div>
        </EnterpriseModalFrame>
      )}
    </div>
  )
}

