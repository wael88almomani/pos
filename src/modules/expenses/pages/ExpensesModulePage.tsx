import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { arSA } from 'date-fns/locale'
import { Plus, Calendar, Filter } from 'lucide-react'
import { Can } from '../../../core/Can'
import { useAuthStore } from '../../../core/stores/auth-store'
import { useToastStore } from '../../../core/toast-store'

type ExpenseRow = {
  id: string
  amount: number
  categoryName: string
  note: string | null
  createdAt: string
  receiptImagePath?: string | null
  createdByName: string
  createdByUsername: string
}

export function ExpensesModulePage() {
  const toast = useToastStore((s) => s.push)
  const readAll = useAuthStore((s) => s.can('expense.read_all'))
  const [cats, setCats] = useState<{ id: string; name: string }[]>([])
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [cashierTodayOnly, setCashierTodayOnly] = useState(false)
  const [amount, setAmount] = useState('')
  const [catName, setCatName] = useState('')
  const [catId, setCatId] = useState('')
  const [note, setNote] = useState('')
  const [receiptPath, setReceiptPath] = useState<string | null>(null)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterRegistrarId, setFilterRegistrarId] = useState('')
  const [registrars, setRegistrars] = useState<{ id: string; displayName: string; username: string }[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)

  useEffect(() => {
    if (!readAll) {
      setRegistrars([])
      return
    }
    void (async () => {
      const r = await window.posApi.expense.listRegistrars()
      if (r.ok && 'items' in r) {
        setRegistrars(r.items as { id: string; displayName: string; username: string }[])
      }
    })()
  }, [readAll])

  const load = useCallback(async () => {
    const q: { from?: string; to?: string; createdById?: string | null } = {}
    if (readAll) {
      if (filterFrom) q.from = new Date(filterFrom + 'T00:00:00').toISOString()
      if (filterTo) q.to = new Date(filterTo + 'T23:59:59.999').toISOString()
      if (filterRegistrarId) q.createdById = filterRegistrarId
    }
    const [c, e] = await Promise.all([window.posApi.expense.categories(), window.posApi.expense.list(q)])
    if (c.ok && 'items' in c) setCats(c.items as { id: string; name: string }[])
    if (e.ok && 'items' in e) {
      setRows(e.items as ExpenseRow[])
      const meta = e as { meta?: { cashierTodayOnly?: boolean } }
      setCashierTodayOnly(Boolean(meta.meta?.cashierTodayOnly))
    } else if (!e.ok) {
      setRows([])
      setCashierTodayOnly(false)
    }
  }, [filterFrom, filterTo, filterRegistrarId, readAll])

  useEffect(() => {
    void load()
  }, [load])

  async function add() {
    if (!amount || Number(amount) <= 0) {
      toast('أدخل مبلغاً صحيحاً', 'err')
      return
    }
    const cat = cats.find((x) => x.id === catId)
    const r = await window.posApi.expense.create({
      amount: Number(amount),
      category: cat?.name ?? 'عام',
      categoryId: catId || null,
      note: note || undefined,
      receiptImagePath: receiptPath
    })
    if (r.ok) {
      toast('تم تسجيل المصروف')
      setAmount('')
      setNote('')
      setCatId('')
      setReceiptPath(null)
      setAddOpen(false)
      void load()
    } else toast('فشل', 'err')
  }

  function fmtAt(iso: string) {
    try {
      return format(new Date(iso), 'd MMM yyyy HH:mm', { locale: arSA })
    } catch {
      return iso
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-white to-gray-50 px-4 py-3 shadow-sm">
        <h1 className="text-xl font-bold text-blue-700">المصروفات</h1>
        <div className="flex items-center gap-2">
          {readAll && (
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
            >
              <Filter className="h-4 w-4" />
              <span>فلترة</span>
            </button>
          )}
          <Can perm="expense.write">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>تسجيل مصروف</span>
            </button>
          </Can>
        </div>
      </div>

      {/* تنبيه للكاشير */}
      {cashierTodayOnly && (
        <div className="border-b border-[#c0a000] bg-gradient-to-b from-[#fffacd] to-[#ffeaa0] px-3 py-1.5 text-xs font-bold text-[#7a6000]">
          ملاحظة: أنت ترى مصروفاتك لليوم الحالي فقط. السجل الكامل عند المدير.
        </div>
      )}

      {/* الجدول */}
      <div className="flex-1 overflow-auto p-4">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">#</th>
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">التصنيف</th>
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">المبلغ</th>
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">ملاحظة</th>
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">التاريخ</th>
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">المسجّل</th>
                <th className="px-3 py-3 text-right font-bold text-slate-700">إيصال</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    لا توجد مصروفات
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                    <td className="border-l border-gray-100 px-3 py-2.5 text-center font-mono">{idx + 1}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 font-semibold">{r.categoryName}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 font-mono font-bold text-red-700">{r.amount.toFixed(2)}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 text-slate-600">{r.note || '—'}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 text-xs font-mono">{fmtAt(r.createdAt)}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5">
                      <div className="font-semibold">{r.createdByName?.trim() || '—'}</div>
                      <div className="text-xs text-slate-500 font-mono">{r.createdByUsername?.trim() || '—'}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {r.receiptImagePath ? (
                        <img
                          src={`pos-asset://${encodeURIComponent(r.receiptImagePath)}`}
                          alt="إيصال"
                          className="inline-block h-10 w-10 border border-slate-300 object-cover"
                        />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* نافذة الفلترة */}
      {filterOpen && readAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setFilterOpen(false)}>
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3">
              <h2 className="text-base font-bold text-white">تصفية المصروفات</h2>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">من تاريخ</label>
                  <input
                    type="date"
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    value={filterFrom}
                    onChange={(e) => setFilterFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">إلى تاريخ</label>
                  <input
                    type="date"
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    value={filterTo}
                    onChange={(e) => setFilterTo(e.target.value)}
                  />
                </div>
              </div>
              {registrars.length > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">المسجّل</label>
                  <select
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    value={filterRegistrarId}
                    onChange={(e) => setFilterRegistrarId(e.target.value)}
                  >
                    <option value="">— الجميع —</option>
                    {registrars.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName} ({u.username})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setFilterFrom('')
                    setFilterTo('')
                    setFilterRegistrarId('')
                    toast('تم إعادة ضبط الفلاتر')
                  }}
                  className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                >
                  إعادة ضبط
                </button>
                <button
                  type="button"
                  onClick={() => setFilterOpen(false)}
                  className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg active:scale-95"
                >
                  تطبيق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نافذة إضافة مصروف */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setAddOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3">
              <h2 className="text-base font-bold text-white">تسجيل مصروف جديد</h2>
            </div>
            <Can perm="expense.write">
              <div className="space-y-3 p-4">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">التصنيف</label>
                  <select
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    value={catId}
                    onChange={(e) => setCatId(e.target.value)}
                  >
                    <option value="">— اختر تصنيف —</option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">المبلغ</label>
                  <input
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-mono shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">ملاحظة</label>
                  <input
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="ملاحظة اختيارية..."
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">إيصال</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border-2 border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                      onClick={async () => {
                        const img = await window.posApi.files.pickExpenseImage()
                        if (img.ok && 'relativePath' in img) setReceiptPath(img.relativePath as string)
                        else if (img.ok === false && !('canceled' in img && img.canceled)) toast('تعذر اختيار الملف', 'err')
                      }}
                    >
                      إرفاق صورة
                    </button>
                    {receiptPath && (
                      <>
                        <button
                          type="button"
                          className="text-xs font-bold text-red-700"
                          onClick={() => setReceiptPath(null)}
                        >
                          × إزالة
                        </button>
                        <img
                          src={`pos-asset://${encodeURIComponent(receiptPath)}`}
                          alt="إيصال"
                          className="h-12 w-12 border border-slate-300 object-cover"
                        />
                      </>
                    )}
                  </div>
                </div>
                <div className="border-t border-gray-200 pt-2">
                  <div className="mb-2 text-xs font-semibold text-slate-600">إضافة تصنيف جديد:</div>
                  <div className="flex gap-2">
                    <input
                      className="h-9 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      placeholder="اسم التصنيف"
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="rounded-lg border-2 border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                      onClick={async () => {
                        if (!catName) return
                        await window.posApi.expense.categorySave({ name: catName })
                        setCatName('')
                        toast('تم إضافة التصنيف')
                        void load()
                      }}
                    >
                      إضافة
                    </button>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAddOpen(false)}
                    className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={() => void add()}
                    className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg active:scale-95"
                  >
                    حفظ المصروف
                  </button>
                </div>
              </div>
            </Can>
          </div>
        </div>
      )}
    </div>
  )
}
