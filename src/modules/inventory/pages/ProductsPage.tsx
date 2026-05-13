import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Upload, Plus, Printer, Calendar, Package, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { arSA } from 'date-fns/locale'
import { ProductEditorModal, type InventoryProduct } from '../components/ProductEditorModal'
import { useAuthStore } from '../../../core/stores/auth-store'
import { useToastStore } from '../../../core/toast-store'

type SortKey = 'id' | 'name' | 'category' | 'quantity' | 'purchasePrice' | 'salePrice' | 'expiryDate'

type Product = InventoryProduct

export function ProductsPage() {
  const toast = useToastStore((s) => s.push)
  const canExport = useAuthStore((s) => s.can('product.read'))
  const canImport = useAuthStore((s) => s.can('product.write'))
  const [items, setItems] = useState<Product[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [search, setSearch] = useState('')
  /** '' = كل التصنيفات، '__none__' = بدون تصنيف، وإلا معرّف التصنيف */
  const [filterCategoryId, setFilterCategoryId] = useState('')
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 200

  const toggleSort = useCallback((k: SortKey) => {
    setSortKey((prev) => {
      if (prev !== k) {
        setSortDir('asc')
        return k
      }
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return prev
    })
  }, [])

  const reloadCategories = useCallback(async () => {
    const c = await window.posApi.products.categories()
    if (c.ok && 'items' in c) setCategories(c.items as { id: string; name: string }[])
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const listQuery: { search?: string; categoryId?: string; page: number; pageSize: number } = {
        page,
        pageSize
      }
      if (search.trim()) listQuery.search = search
      if (filterCategoryId) listQuery.categoryId = filterCategoryId
      const [_, p] = await Promise.all([reloadCategories(), window.posApi.products.list(listQuery)])
      if (p.ok && 'items' in p) {
        setItems(p.items as Product[])
        if ('pagination' in p && p.pagination) {
          setTotalPages((p.pagination as any).totalPages || 1)
          setTotalCount((p.pagination as any).totalCount || 0)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [search, filterCategoryId, page, pageSize, reloadCategories])

  useEffect(() => {
    const t = setTimeout(() => void load(), 200)
    return () => clearTimeout(t)
  }, [load])

  useEffect(() => {
    // عند تغيير البحث أو التصنيف، ارجع للصفحة الأولى
    setPage(1)
  }, [search, filterCategoryId])

  const rows = useMemo(() => {
    const catName = (pid: string | null) => categories.find((c) => c.id === pid)?.name ?? ''
    const dir = sortDir === 'asc' ? 1 : -1
    return [...items].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'id':
          cmp = a.id.localeCompare(b.id)
          break
        case 'name':
          cmp = a.name.localeCompare(b.name, 'ar')
          break
        case 'category':
          cmp = catName(a.categoryId).localeCompare(catName(b.categoryId), 'ar')
          break
        case 'quantity':
          cmp = a.quantity - b.quantity
          break
        case 'purchasePrice':
          cmp = Number(a.purchasePrice) - Number(b.purchasePrice)
          break
        case 'salePrice':
          cmp = Number(a.salePrice) - Number(b.salePrice)
          break
        case 'expiryDate':
          const aDate = a.expiryDate ? new Date(a.expiryDate).getTime() : 0
          const bDate = b.expiryDate ? new Date(b.expiryDate).getTime() : 0
          cmp = aDate - bDate
          break
      }
      return cmp * dir
    })
  }, [items, categories, sortKey, sortDir])

  const totals = useMemo(() => {
    const count = rows.length
    const totalCost = rows.reduce((sum, p) => sum + Number(p.purchasePrice) * p.quantity, 0)
    const totalSale = rows.reduce((sum, p) => sum + Number(p.salePrice) * p.quantity, 0)
    const totalPurchasePrice = rows.reduce((sum, p) => sum + Number(p.purchasePrice), 0)
    const totalSalePrice = rows.reduce((sum, p) => sum + Number(p.salePrice), 0)
    return { count, totalCost, totalSale, totalPurchasePrice, totalSalePrice }
  }, [rows])

  const sortMark = (k: SortKey) => (sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '')

  const onExportStock = useCallback(async () => {
    const r = (await window.posApi.products.exportStockTsv()) as
      | { ok: true; path: string }
      | { ok: false; canceled?: boolean; error?: string }
    if ('canceled' in r && r.canceled) return
    if (r.ok && 'path' in r) toast(`تم تصدير المنتجات: ${r.path}`, 'ok')
    else if (!r.ok && 'error' in r && r.error) toast(r.error, 'err')
    else toast('تعذّر التصدير', 'err')
  }, [toast])

  const onImportStock = useCallback(async () => {
    const r = (await window.posApi.products.importStockTsv()) as
      | { ok: true; created: number; updated: number; errors: string[] }
      | { ok: false; canceled?: boolean; error?: string }
    if ('canceled' in r && r.canceled) return
    if (r.ok && 'created' in r) {
      const parts = [`تم الاستيراد: ${r.created} جديد، ${r.updated} محدّث`]
      if (r.errors?.length) parts.push(r.errors.slice(0, 5).join(' — '))
      toast(parts.join(' — '), r.errors?.length ? 'err' : 'ok')
      void load()
    } else if (!r.ok && 'error' in r && r.error) toast(r.error, 'err')
    else toast('تعذّر الاستيراد', 'err')
  }, [toast, load])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#d0d0d0]">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 shadow">
        <h1 className="text-lg font-black text-[#1a1a1a]">المستودعات</h1>
        <div className="flex items-center gap-2">
          <select
            className="h-8 border border-slate-400 bg-white px-2 text-sm shadow-inner"
            value={filterCategoryId}
            onChange={(e) => setFilterCategoryId(e.target.value)}
          >
            <option value="">كل التصنيفات</option>
            <option value="__none__">بدون تصنيف</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="h-8 w-48 border border-slate-400 bg-white px-2 text-sm shadow-inner"
            placeholder="البحث بواسطة: رقم المادة / اسم المادة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* الإحصائيات */}
      <div className="border-b-2 border-[#555] bg-gradient-to-b from-[#f8f8f8] to-[#e0e0e0] px-4 py-3">
        <div className="grid grid-cols-5 gap-6 text-sm">
          <div className="text-right">
            <span className="font-black text-slate-700">معلومات عن المستودع:</span>
            <span className="mr-2 font-semibold text-blue-700">الرئيسي</span>
          </div>
          <div className="text-right">
            <span className="font-black text-slate-700">إجمالي التكلفة الحالية:</span>
            <span className="mr-2 font-mono font-bold text-green-700">{totals.totalCost.toFixed(2)}</span>
          </div>
          <div className="text-right">
            <span className="font-black text-slate-700">إجمالي السعر:</span>
            <span className="mr-2 font-mono font-bold text-blue-700">{totals.totalSale.toFixed(2)}</span>
          </div>
          <div className="text-right">
            <span className="font-black text-slate-700">إجمالي سعر الشراء:</span>
            <span className="mr-2 font-mono font-bold text-orange-700">{totals.totalPurchasePrice.toFixed(2)}</span>
          </div>
          <div className="text-right">
            <span className="font-black text-slate-700">إجمالي سعر البيع:</span>
            <span className="mr-2 font-mono font-bold text-purple-700">{totals.totalSalePrice.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* الجدول */}
      <div className="flex-1 overflow-auto p-3">
        <div className="border-2 border-[#808080] bg-white shadow-lg">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0]">
                <th className="border-l border-[#808080] px-2 py-2.5 text-right">
                  <button type="button" className="font-black hover:text-blue-700" onClick={() => toggleSort('id')}>
                    رقم المادة{sortMark('id')}
                  </button>
                </th>
                <th className="border-l border-[#808080] px-3 py-2.5 text-right">
                  <button type="button" className="font-black hover:text-blue-700" onClick={() => toggleSort('name')}>
                    اسم المادة{sortMark('name')}
                  </button>
                </th>
                <th className="border-l border-[#808080] px-2 py-2.5 text-center">
                  <button type="button" className="font-black hover:text-blue-700" onClick={() => toggleSort('quantity')}>
                    الكمية{sortMark('quantity')}
                  </button>
                </th>
                <th className="border-l border-[#808080] px-2 py-2.5 text-center">
                  <button type="button" className="font-black hover:text-blue-700" onClick={() => toggleSort('purchasePrice')}>
                    سعر التكلفة{sortMark('purchasePrice')}
                  </button>
                </th>
                <th className="border-l border-[#808080] px-2 py-2.5 text-center">
                  <button type="button" className="font-black hover:text-blue-700" onClick={() => toggleSort('salePrice')}>
                    سعر البيع{sortMark('salePrice')}
                  </button>
                </th>
                <th className="border-l border-[#808080] px-2 py-2.5 text-center font-black">
                  سعر البيع
                </th>
                <th className="border-l border-[#808080] px-3 py-2.5 text-right">
                  <button type="button" className="font-black hover:text-blue-700" onClick={() => toggleSort('category')}>
                    التصنيف{sortMark('category')}
                  </button>
                </th>
                <th className="border-l border-[#808080] px-3 py-2.5 text-center font-black">
                  المورد
                </th>
                <th className="border-l border-[#808080] px-2 py-2.5 text-center font-black">
                  نسبة الضريبة %
                </th>
                <th className="px-2 py-2.5 text-center">
                  <button type="button" className="font-black hover:text-blue-700" onClick={() => toggleSort('expiryDate')}>
                    تاريخ الانتهاء{sortMark('expiryDate')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-slate-500">
                    لا توجد منتجات
                  </td>
                </tr>
              ) : (
                rows.map((p, idx) => (
                  <tr 
                    key={p.id} 
                    className={`border-b border-[#d0d0d0] hover:bg-[#e8f4ff] cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f8f8f8]'}`}
                    onClick={() => setEditing(p)}
                  >
                    <td className="border-l border-[#d0d0d0] px-2 py-1.5 text-right font-mono text-xs">{idx + 1}</td>
                    <td className="border-l border-[#d0d0d0] px-3 py-1.5 text-right font-semibold">{p.name}</td>
                    <td className="border-l border-[#d0d0d0] px-2 py-1.5 text-center font-mono">{p.quantity.toLocaleString('ar')}</td>
                    <td className="border-l border-[#d0d0d0] px-2 py-1.5 text-center font-mono">{Number(p.purchasePrice).toFixed(3)}</td>
                    <td className="border-l border-[#d0d0d0] px-2 py-1.5 text-center font-mono">{Number(p.salePrice).toFixed(3)}</td>
                    <td className="border-l border-[#d0d0d0] px-2 py-1.5 text-center font-mono">{Number(p.salePrice).toFixed(3)}</td>
                    <td className="border-l border-[#d0d0d0] px-3 py-1.5 text-right text-slate-700">
                      {categories.find((c) => c.id === p.categoryId)?.name ?? '—'}
                    </td>
                    <td className="border-l border-[#d0d0d0] px-3 py-1.5 text-center text-slate-500">—</td>
                    <td className="border-l border-[#d0d0d0] px-2 py-1.5 text-center font-mono">0.000</td>
                    <td className="px-2 py-1.5 text-center text-xs text-slate-600">
                      {p.expiryDate 
                        ? format(new Date(p.expiryDate), 'yyyy-MM-dd', { locale: arSA })
                        : '—'
                      }
                    </td>
                  </tr>
                ))
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
      </div>

      {/* شريط الأزرار السفلي */}
      <div className="flex items-center justify-between border-t-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-4 py-2.5 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="font-black text-slate-700">عدد المواد</span>
            <span className="rounded border border-[#555] bg-white px-3 py-1 font-mono font-bold text-blue-700">
              {totalCount}
            </span>
          </div>
          
          {/* Pagination */}
          <div className="flex items-center gap-2 border-r border-slate-400 pr-4">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="flex items-center gap-1 border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-3 py-1 text-xs font-bold text-black shadow hover:from-[#b8ddf8] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3 w-3" />
              السابق
            </button>
            <span className="font-mono text-sm font-bold">
              صفحة {page} من {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="flex items-center gap-1 border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-3 py-1 text-xs font-bold text-black shadow hover:from-[#b8ddf8] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              التالي
              <ChevronLeft className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-3 py-1.5 text-sm font-bold shadow hover:from-[#f5f5f5]"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" />
            <span>طباعة كشف المواد</span>
          </button>

          {canExport && (
            <button
              type="button"
              className="flex items-center gap-1.5 border border-[#555] bg-gradient-to-b from-[#90ee90] to-[#50c050] px-3 py-1.5 text-sm font-bold text-black shadow hover:from-[#a0ffa0]"
              onClick={() => void onExportStock()}
            >
              <Download className="h-4 w-4" />
              <span>التصدير لنقل إكسل</span>
            </button>
          )}

          <button
            type="button"
            className="flex items-center gap-1.5 border border-[#555] bg-gradient-to-b from-[#87ceeb] to-[#4682b4] px-3 py-1.5 text-sm font-bold text-black shadow hover:from-[#97defc]"
            onClick={() => {/* TODO: Filter by expiry */}}
          >
            <Calendar className="h-4 w-4" />
            <span>تاريخ الإنتهاء لمواد F3</span>
          </button>

          <button
            type="button"
            className="flex items-center gap-1.5 border border-[#555] bg-gradient-to-b from-[#90ee90] to-[#50c050] px-3 py-1.5 text-sm font-bold text-black shadow hover:from-[#a0ffa0]"
            onClick={() => {/* TODO: Filter by quantity */}}
          >
            <Package className="h-4 w-4" />
            <span>الكميات المتوفرة لمواد F2</span>
          </button>

          <button
            type="button"
            className="flex items-center gap-1.5 border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-4 py-1.5 text-sm font-black text-black shadow hover:from-[#b8ddf8]"
            onClick={() => setEditing('new')}
          >
            <Plus className="h-5 w-5" />
            <span>إضافة مادة F1</span>
          </button>
        </div>
      </div>

      {editing && (
        <ProductEditorModal
          categories={categories}
          reloadCategories={reloadCategories}
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      )}
    </div>
  )
}
