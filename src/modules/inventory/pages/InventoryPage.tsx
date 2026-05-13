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
    return `${picked.name} — المتوفّر: ${picked.quantity}`
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
        toast('تعذر تحميل بطاقة المنتج', 'err')
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
    <div className={enterprisePageRootClass}>
      <EnterpriseToolbar
        title="المستودع والحركات"
        actions={
          <Can perm="inventory.write">
            <button
              type="button"
              className="rounded border-2 border-[#808080] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-4 py-2 text-sm font-bold text-black shadow-sm hover:from-[#90c0e8] hover:to-[#2870b4]"
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
          <div className="rounded border-2 border-[#808080] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] p-4 shadow-sm">
            <div className="text-xs font-bold text-slate-700 mb-1">منتجات تحت الحد الأدنى</div>
            <div className="text-3xl font-bold font-mono text-slate-900">{low.length}</div>
          </div>
          <div className="rounded border-2 border-[#808080] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] p-4 shadow-sm">
            <div className="text-xs font-bold text-slate-700 mb-1">حركات اليوم</div>
            <div className="text-3xl font-bold font-mono text-slate-900">{moves.length}</div>
          </div>
          <div className="rounded border-2 border-[#808080] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] p-4 shadow-sm">
            <div className="text-xs font-bold text-slate-700 mb-1">منتجات قريبة/منتهية الصلاحية</div>
            <div className="text-3xl font-bold font-mono text-slate-900">{nearExpiry}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="rounded border-2 border-[#808080] bg-[#d0d0d0] shadow-sm overflow-hidden">
          <div className="flex border-b-2 border-[#808080] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0]">
            <button
              onClick={() => setActiveTab('low')}
              className={`px-4 py-2 text-sm font-bold border-l-2 border-[#808080] ${
                activeTab === 'low'
                  ? 'bg-[#d0d0d0] text-black'
                  : 'text-slate-700 hover:bg-[#d8d8d8]'
              }`}
            >
              تنبيهات الحد الأدنى ({low.length})
            </button>
            <button
              onClick={() => setActiveTab('moves')}
              className={`px-4 py-2 text-sm font-bold border-l-2 border-[#808080] ${
                activeTab === 'moves'
                  ? 'bg-[#d0d0d0] text-black'
                  : 'text-slate-700 hover:bg-[#d8d8d8]'
              }`}
            >
              آخر الحركات ({moves.length})
            </button>
            <button
              onClick={() => setActiveTab('expiry')}
              className={`px-4 py-2 text-sm font-bold ${
                activeTab === 'expiry'
                  ? 'bg-[#d0d0d0] text-black'
                  : 'text-slate-700 hover:bg-[#d8d8d8]'
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
                    <tr className="bg-[#f5f5f5] border-2 border-[#808080]">
                      <th className="border border-slate-400 p-2 text-right font-bold">المنتج</th>
                      <th className="border border-slate-400 p-2 text-center font-bold">المتوفر</th>
                      <th className="border border-slate-400 p-2 text-center font-bold">الحد الأدنى</th>
                      <th className="border border-slate-400 p-2 text-center font-bold">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {low.map((p) => (
                      <tr key={p.id} className="border border-slate-300 hover:bg-[#f0f0f0]">
                        <td className="border border-slate-300 p-2">{p.name}</td>
                        <td className="border border-slate-300 p-2 text-center font-mono font-bold text-red-700">
                          {p.quantity}
                        </td>
                        <td className="border border-slate-300 p-2 text-center font-mono">{p.minStock}</td>
                        <td className="border border-slate-300 p-2 text-center">
                          <button
                            onClick={() => void openProductCard(p.id)}
                            className="rounded border border-[#808080] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-1 text-xs font-bold text-black hover:from-[#d0d0d0] hover:to-[#a8a8a8]"
                          >
                            عرض التفاصيل
                          </button>
                        </td>
                      </tr>
                    ))}
                    {low.length === 0 && (
                      <tr>
                        <td colSpan={4} className="border border-slate-300 p-8 text-center text-slate-500">
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
                    <tr className="bg-[#f5f5f5] border-2 border-[#808080]">
                      <th className="border border-slate-400 p-2 text-right font-bold">النوع</th>
                      <th className="border border-slate-400 p-2 text-right font-bold">المنتج</th>
                      <th className="border border-slate-400 p-2 text-center font-bold">الكمية</th>
                      <th className="border border-slate-400 p-2 text-right font-bold">المرجع</th>
                      <th className="border border-slate-400 p-2 text-center font-bold">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moves.map((m) => (
                      <tr key={m.id} className="border border-slate-300 hover:bg-[#f0f0f0]">
                        <td className="border border-slate-300 p-2">
                          <span className="inline-block rounded border border-slate-400 bg-slate-100 px-2 py-0.5 text-xs font-bold">
                            {MOVE_LABELS[m.type] ?? m.type}
                          </span>
                        </td>
                        <td className="border border-slate-300 p-2">
                          <button
                            onClick={() => void openProductCard(m.productId)}
                            className="text-blue-700 hover:underline font-semibold"
                          >
                            {m.productName}
                          </button>
                        </td>
                        <td className="border border-slate-300 p-2 text-center font-mono font-bold">
                          {m.quantity > 0 ? '+' : ''}{m.quantity}
                        </td>
                        <td className="border border-slate-300 p-2 text-xs">
                          {m.refType ?? '—'}
                          {m.note ? ` • ${m.note}` : ''}
                        </td>
                        <td className="border border-slate-300 p-2 text-center text-xs font-mono">
                          {fmtIso(m.createdAt)}
                        </td>
                      </tr>
                    ))}
                    {moves.length === 0 && (
                      <tr>
                        <td colSpan={5} className="border border-slate-300 p-8 text-center text-slate-500">
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
                    <span className="font-bold">التصنيف</span>
                    <select
                      className="block rounded border-2 border-[#808080] px-3 py-2 bg-white min-w-[12rem]"
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
                    <span className="font-bold">حالة الصلاحية</span>
                    <select
                      className="block rounded border-2 border-[#808080] px-3 py-2 bg-white min-w-[12rem]"
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
                      <tr className="bg-[#f5f5f5] border-2 border-[#808080]">
                        <th className="border border-slate-400 p-2 text-right font-bold">المنتج</th>
                        <th className="border border-slate-400 p-2 text-right font-bold">التصنيف</th>
                        <th className="border border-slate-400 p-2 text-center font-bold">الكمية</th>
                        <th className="border border-slate-400 p-2 text-center font-bold">الحد الأدنى</th>
                        <th className="border border-slate-400 p-2 text-center font-bold">تاريخ الصلاحية</th>
                        <th className="border border-slate-400 p-2 text-center font-bold">الحالة</th>
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
                            className={`border border-slate-300 hover:bg-slate-50 cursor-pointer ${rowCls}`}
                            onClick={() => void openProductCard(m.id)}
                          >
                            <td className="border border-slate-300 p-2 font-semibold">{m.name}</td>
                            <td className="border border-slate-300 p-2">{m.categoryName ?? '—'}</td>
                            <td className="border border-slate-300 p-2 text-center font-mono font-bold">
                              {m.quantity}
                            </td>
                            <td className="border border-slate-300 p-2 text-center font-mono">{m.minStock}</td>
                            <td className="border border-slate-300 p-2 text-center font-mono text-xs">
                              {m.expiryDate ? m.expiryDate.slice(0, 10) : '—'}
                            </td>
                            <td className="border border-slate-300 p-2 text-center text-xs font-bold">
                              {statusLabel}
                            </td>
                          </tr>
                        )
                      })}
                      {filteredStockRows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="border border-slate-300 p-8 text-center text-slate-500">
                            لا توجد منتجات مطابقة للتصفية
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
                <div className="mt-4 flex items-center justify-center gap-3 border-t border-slate-300 pt-3">
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                    className="flex items-center gap-1 rounded border-2 border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-3 py-1.5 text-xs font-bold shadow hover:from-[#f5f5f5] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-3 w-3" />
                    السابق
                  </button>
                  <span className="font-mono text-sm font-bold">
                    صفحة {page} من {totalPages} ({totalCount} منتج)
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loading}
                    className="flex items-center gap-1 rounded border-2 border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-3 py-1.5 text-xs font-bold shadow hover:from-[#f5f5f5] disabled:opacity-50 disabled:cursor-not-allowed"
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
        <EnterpriseModalFrame title="حركة مخزون يدوية" onClose={() => setMoveOpen(false)} maxWidthClass="max-w-lg">
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-xs font-bold block mb-1">المنتج</span>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="w-full flex items-center gap-2 rounded border-2 border-[#808080] bg-white px-3 py-2.5 text-right hover:bg-[#f0f0f0]"
              >
                <Package className="h-5 w-5 shrink-0 text-slate-600" />
                <span className="flex-1 truncate font-semibold">{pickedSummary ?? 'اضغط لاختيار منتج من البحث…'}</span>
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-bold">نوع الحركة</span>
              <select
                className="w-full rounded border-2 border-[#808080] bg-white px-3 py-2"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="stock_in">إدخال مخزون</option>
                <option value="stock_out">إخراج مخزون</option>
                <option value="adjustment">تعديل كمية</option>
                <option value="damage">تلف</option>
                <option value="waste">هالك</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold">الكمية</span>
              <input
                className="w-full rounded border-2 border-[#808080] px-3 py-2 font-mono"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold">تكلفة الوحدة (اختياري)</span>
              <input
                className="w-full rounded border-2 border-[#808080] px-3 py-2 font-mono"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold">ملاحظة</span>
              <input
                className="w-full rounded border-2 border-[#808080] px-3 py-2"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <Can perm="inventory.write">
              <button
                type="button"
                className="w-full rounded border-2 border-[#808080] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] py-3 font-bold text-black hover:from-[#90c0e8] hover:to-[#2870b4]"
                onClick={() => void apply()}
              >
                حفظ الحركة
              </button>
            </Can>
          </div>
        </EnterpriseModalFrame>
      )}

      <ProductSearchModal
        open={pickerOpen}
        title="اختيار منتج للحركة"
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
          titleOverride="بطاقة المنتج"
        />
      )}

      {productReadonlyOpen && activeProduct && (
        <EnterpriseModalFrame
          title={`بطاقة المنتج — ${activeProduct.name}`}
          onClose={() => {
            setProductReadonlyOpen(false)
            setActiveProduct(null)
          }}
          maxWidthClass="max-w-lg"
        >
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border-2 border-[#808080] bg-[#f5f5f5] p-3">
                <div className="text-xs font-bold text-slate-600 mb-1">الاسم</div>
                <div className="font-semibold">{activeProduct.name}</div>
              </div>
              <div className="rounded border-2 border-[#808080] bg-[#f5f5f5] p-3">
                <div className="text-xs font-bold text-slate-600 mb-1">التصنيف</div>
                <div className="font-semibold">{activeProduct.categoryName ?? '—'}</div>
              </div>
              <div className="rounded border-2 border-[#808080] bg-[#f5f5f5] p-3">
                <div className="text-xs font-bold text-slate-600 mb-1">الكمية المتوفرة</div>
                <div className="font-mono font-bold text-lg">{activeProduct.quantity}</div>
              </div>
              <div className="rounded border-2 border-[#808080] bg-[#f5f5f5] p-3">
                <div className="text-xs font-bold text-slate-600 mb-1">الحد الأدنى</div>
                <div className="font-mono font-bold text-lg">{activeProduct.minStock}</div>
              </div>
              <div className="rounded border-2 border-[#808080] bg-[#f5f5f5] p-3">
                <div className="text-xs font-bold text-slate-600 mb-1">سعر البيع</div>
                <div className="font-mono font-bold">{activeProduct.salePrice.toFixed(2)} JD</div>
              </div>
              <div className="rounded border-2 border-[#808080] bg-[#f5f5f5] p-3">
                <div className="text-xs font-bold text-slate-600 mb-1">تاريخ الصلاحية</div>
                <div className="font-mono font-semibold">
                  {activeProduct.expiryDate ? activeProduct.expiryDate.slice(0, 10) : 'غير محدد'}
                </div>
              </div>
            </div>
          </div>
        </EnterpriseModalFrame>
      )}
    </div>
  )
}
