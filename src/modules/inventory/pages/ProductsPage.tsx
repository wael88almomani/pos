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
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-white to-gray-50 px-4 py-3 shadow-sm">
        <h1 className="text-xl font-bold text-blue-700">المستودعات</h1>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
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
            className="h-9 w-full sm:w-60 rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            placeholder="البحث بواسطة: رقم المادة / اسم المادة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* الإحصائيات */}
      <div className="border-b border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50 px-4 py-3 shadow-sm">
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
          <div className="text-right">
            <span className="font-bold text-slate-600">معلومات عن المستودع:</span>
            <span className="mr-2 font-semibold text-blue-600">الرئيسي</span>
          </div>
          <div className="text-right">
            <span className="font-bold text-slate-600">إجمالي التكلفة الحالية:</span>
            <span className="mr-2 font-mono font-bold text-green-600">{totals.totalCost.toFixed(2)}</span>
          </div>
          <div className="text-right">
            <span className="font-bold text-slate-600">إجمالي السعر:</span>
            <span className="mr-2 font-mono font-bold text-blue-600">{totals.totalSale.toFixed(2)}</span>
          </div>
          <div className="text-right">
            <span className="font-bold text-slate-600">إجمالي سعر الشراء:</span>
            <span className="mr-2 font-mono font-bold text-orange-600">{totals.totalPurchasePrice.toFixed(2)}</span>
          </div>
          <div className="text-right">
            <span className="font-bold text-slate-600">إجمالي سعر البيع:</span>
            <span className="mr-2 font-mono font-bold text-purple-600">{totals.totalSalePrice.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* الجدول */}
      <div className="flex-1 overflow-auto p-4">
        <div className="rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                <th className="border-l border-gray-200 px-3 py-3 text-right">
                  <button type="button" className="font-bold text-slate-700 hover:text-blue-600 transition-colors" onClick={() => toggleSort('id')}>
                    رقم المادة{sortMark('id')}
                  </button>
                </th>
                <th className="border-l border-gray-200 px-3 py-3 text-right">
                  <button type="button" className="font-bold text-slate-700 hover:text-blue-600 transition-colors" onClick={() => toggleSort('name')}>
                    اسم المادة{sortMark('name')}
                  </button>
                </th>
                <th className="border-l border-gray-200 px-3 py-3 text-center">
                  <button type="button" className="font-bold text-slate-700 hover:text-blue-600 transition-colors" onClick={() => toggleSort('quantity')}>
                    الكمية{sortMark('quantity')}
                  </button>
                </th>
                <th className="border-l border-gray-200 px-3 py-3 text-center">
                  <button type="button" className="font-bold text-slate-700 hover:text-blue-600 transition-colors" onClick={() => toggleSort('purchasePrice')}>
                    سعر التكلفة{sortMark('purchasePrice')}
                  </button>
                </th>
                <th className="border-l border-gray-200 px-3 py-3 text-center">
                  <button type="button" className="font-bold text-slate-700 hover:text-blue-600 transition-colors" onClick={() => toggleSort('salePrice')}>
                    سعر البيع{sortMark('salePrice')}
                  </button>
                </th>
                <th className="border-l border-gray-200 px-3 py-3 text-center font-bold text-slate-700">
                  سعر البيع
                </th>
                <th className="border-l border-gray-200 px-3 py-3 text-right">
                  <button type="button" className="font-bold text-slate-700 hover:text-blue-600 transition-colors" onClick={() => toggleSort('category')}>
                    التصنيف{sortMark('category')}
                  </button>
                </th>
                <th className="border-l border-gray-200 px-3 py-3 text-center font-bold text-slate-700">
                  المورد
                </th>
                <th className="border-l border-gray-200 px-3 py-3 text-center font-bold text-slate-700">
                  نسبة الضريبة %
                </th>
                <th className="px-3 py-3 text-center">
                  <button type="button" className="font-bold text-slate-700 hover:text-blue-600 transition-colors" onClick={() => toggleSort('expiryDate')}>
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
                    className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => setEditing(p)}
                  >
                    <td className="border-l border-gray-100 px-3 py-2.5 text-right font-mono text-xs">{idx + 1}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 text-right font-semibold">{p.name}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 text-center font-mono">{p.quantity.toLocaleString('ar')}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 text-center font-mono">{Number(p.purchasePrice).toFixed(3)}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 text-center font-mono">{Number(p.salePrice).toFixed(3)}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 text-center font-mono">{Number(p.salePrice).toFixed(3)}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 text-right text-slate-700">
                      {categories.find((c) => c.id === p.categoryId)?.name ?? '—'}
                    </td>
                    <td className="border-l border-gray-100 px-3 py-2.5 text-center text-slate-500">—</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 text-center font-mono">0.000</td>
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
      <div className="flex items-center justify-between border-t border-gray-200 bg-gradient-to-r from-white to-gray-50 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">عدد المواد</span>
            <span className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-mono font-bold text-blue-600 shadow-sm">
              {totalCount}
            </span>
          </div>
          
          {/* Pagination */}
          <div className="flex items-center gap-2 border-r border-gray-300 pr-4">
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
              صفحة {page} من {totalPages}
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
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border-2 border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-gray-50 hover:shadow-md transition-all"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" />
            <span>طباعة كشف المواد</span>
          </button>

          {canExport && (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-green-500 to-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-md hover:shadow-lg hover:from-green-600 hover:to-green-700 active:scale-95 transition-all"
              onClick={() => void onExportStock()}
            >
              <Download className="h-4 w-4" />
              <span>التصدير لنقل إكسل</span>
            </button>
          )}

          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-blue-400 to-blue-500 px-3 py-1.5 text-sm font-semibold text-white shadow-md hover:shadow-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-all"
            onClick={() => {/* TODO: Filter by expiry */}}
          >
            <Calendar className="h-4 w-4" />
            <span>تاريخ الإنتهاء لمواد F3</span>
          </button>

          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-green-500 to-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-md hover:shadow-lg hover:from-green-600 hover:to-green-700 active:scale-95 transition-all"
            onClick={() => {/* TODO: Filter by quantity */}}
          >
            <Package className="h-4 w-4" />
            <span>الكميات المتوفرة لمواد F2</span>
          </button>

          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-1.5 text-sm font-bold text-white shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-all"
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
