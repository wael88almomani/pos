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
  stock_in: 'إدخال مخزون',
  stock_out: 'إخراج مخزون',
  adjustment: 'تعديل',
  damage: 'تلف',
  waste: 'هالك',
  sale: 'بيع',
  purchase: 'مشتريات'
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
      toast('اختر منتجاً من القائمة', 'err')
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
      toast('تم تحديث المخزون')
      setMoveOpen(false)
      setPicked(null)
      setQty('1')
      setNote('')
      setUnitCost('')
      void load()
    } else {
      const code = (r as { code?: string }).code
      if (code === 'NEGATIVE_STOCK' || (r as { error?: string }).error === 'NEGATIVE_STOCK')
        toast('الكمية غير كافية في المخزون', 'err')
      else toast('فشل الحركة', 'err')
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
        title="المستودع والحركات"
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
              تسجيل حركة مخزون
            </button>
          </Can>
        }
      />

      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-red-50 to-red-100 p-4 shadow-lg">
            <div className="text-xs font-bold text-slate-700 mb-1">منتجات تحت الحد الأدنى</div>
            <div className="text-3xl font-bold font-mono text-red-600">{low.length}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-blue-50 to-blue-100 p-4 shadow-lg">
            <div className="text-xs font-bold text-slate-700 mb-1">حركات اليوم</div>
            <div className="text-3xl font-bold font-mono text-blue-600">{moves.length}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-orange-50 to-orange-100 p-4 shadow-lg">
            <div className="text-xs font-bold text-slate-700 mb-1">منتجات قريبة/منتهية الصلاحية</div>
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
              تنبيهات الحد الأدنى ({low.length})
            </button>
            <button
              onClick={() => setActiveTab('moves')}
              className={`flex-1 min-w-[11rem] border-l border-gray-200 px-4 py-3 text-sm font-bold transition-all ${
                activeTab === 'moves'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-700 hover:bg-white/50'
              }`}
            >
              آخر الحركات ({moves.length})
            </button>
            <button
              onClick={() => setActiveTab('expiry')}
              className={`flex-1 min-w-[11rem] px-4 py-3 text-sm font-bold transition-all ${
                activeTab === 'expiry'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-700 hover:bg-white/50'
              }`}
            >
              تقرير الصلاحية
            </button>
          </div>

          <div className="bg-white p-4">
            {activeTab === 'low' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                      <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">المنتج</th>
                      <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">المتوفر</th>
                      <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">الحد الأدنى</th>
                      <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">إجراءات</th>
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
                            عرض التفاصيل
                          </button>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {low.length === 0 && (
                      <tr>
                        <td colSpan={4} className="border-l border-gray-100 p-8 text-center text-slate-500">
                          ✓ جميع المنتجات فوق الحد الأدنى
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
                      <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">النوع</th>
                      <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">المنتج</th>
                      <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">الكمية</th>
                      <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">المرجع</th>
                      <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">التاريخ</th>
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
                          لا توجد حركات مسجلة
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
                    <span className="font-bold text-slate-700">التصنيف</span>
                    <select
                      className="block h-9 rounded-lg border border-gray-300 px-3 py-2 bg-white min-w-[12rem] shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      value={stockCategoryFilter}
                      onChange={(e) => setStockCategoryFilter(e.target.value)}
                    >
                      <option value="">الكل</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm space-y-1">
                    <span className="font-bold text-slate-700">حالة الصلاحية</span>
                    <select
                      className="block h-9 rounded-lg border border-gray-300 px-3 py-2 bg-white min-w-[12rem] shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      value={expiryFilter}
                      onChange={(e) => setExpiryFilter(e.target.value as ExpiryStatus)}
                    >
                      <option value="all">الكل</option>
                      <option value="expired">منتهي</option>
                      <option value="near">قريب الانتهاء (30 يوم)</option>
                      <option value="ok">ساري</option>
                      <option value="none">بدون تاريخ صلاحية</option>
                    </select>
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                        <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">المنتج</th>
                        <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">التصنيف</th>
                        <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">الكمية</th>
                        <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">الحد الأدنى</th>
                        <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">تاريخ الصلاحية</th>
                        <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">الحالة</th>
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
                            ? 'منتهي ❌'
                            : st === 'near'
                              ? 'قريب الانتهاء ⚠️'
                              : st === 'ok'
                                ? 'ساري ✓'
                                : 'بدون تاريخ'
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
                            لا توجد منتجات مطابقة للتصنيف
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                      <div className="text-center">
                        <div className="mb-2 text-2xl">⏳</div>
                        <div className="font-bold text-slate-700">جاري التحميل...</div>
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
                    السابق
                  </button>
                  <span className="font-mono text-sm font-bold text-slate-700">
                    صفحة {page} من {totalPages} ({totalCount} منتج)
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loading}
                    className="flex items-center gap-1 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    التالي
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

