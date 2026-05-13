import { useCallback, useEffect, useState } from 'react'
import { Plus, DollarSign } from 'lucide-react'
import { CURRENCY_SUFFIX } from '../../../core/currency'
import { Can } from '../../../core/Can'
import { useToastStore } from '../../../core/toast-store'

type S = { id: string; name: string; phone: string | null }

export function SuppliersPage() {
  const toast = useToastStore((s) => s.push)
  const [items, setItems] = useState<S[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [editing, setEditing] = useState<S | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [balId, setBalId] = useState<string | null>(null)
  const [balance, setBalance] = useState(0)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await window.posApi.supplier.list()
    if (r.ok && 'items' in r) setItems(r.items as S[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!name.trim()) {
      toast('أدخل اسم المورد', 'err')
      return
    }
    const r = await window.posApi.supplier.save({
      id: editing?.id,
      name,
      phone: phone || undefined
    })
    if (r.ok) {
      toast('تم الحفظ')
      setEditing(null)
      setName('')
      setPhone('')
      setAddOpen(false)
      void load()
    } else toast('فشل', 'err')
  }

  async function showBal(id: string) {
    setBalId(id)
    const r = await window.posApi.supplier.balance(id)
    if (r.ok && 'balance' in r) setBalance(r.balance as number)
  }

  async function handleDelete() {
    if (!deleteId) return
    const r = await window.posApi.supplier.delete(deleteId)
    if (r.ok) {
      toast('تم حذف المورد بنجاح', 'ok')
      setDeleteId(null)
      void load()
    } else {
      toast('فشل حذف المورد', 'err')
    }
  }

  const balName = items.find((x) => x.id === balId)?.name ?? ''
  const deleteName = items.find((x) => x.id === deleteId)?.name ?? ''

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-white to-gray-50 px-4 py-3 shadow-sm">
        <h1 className="text-xl font-bold text-blue-700">الموردين</h1>
        <Can perm="supplier.write">
          <button
            type="button"
            onClick={() => {
              setAddOpen(true)
              setEditing(null)
              setName('')
              setPhone('')
            }}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>مورد جديد</span>
          </button>
        </Can>
      </div>

      {/* الجدول */}
      <div className="flex-1 overflow-auto p-4">
        <div className="rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">#</th>
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">اسم المورد</th>
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">رقم الهاتف</th>
                <th className="px-3 py-3 text-center font-bold text-slate-700">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                    لا توجد موردين
                  </td>
                </tr>
              ) : (
                items.map((s, idx) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                    <td className="border-l border-gray-100 px-3 py-2.5 text-center font-mono">{idx + 1}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 font-semibold">{s.name}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 font-mono">{s.phone || '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => void showBal(s.id)}
                          className="rounded-lg border-2 border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-gray-50 hover:shadow-md transition-all"
                        >
                          الرصيد
                        </button>
                        <Can perm="supplier.write">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(s)
                              setName(s.name)
                              setPhone(s.phone ?? '')
                              setAddOpen(true)
                            }}
                            className="rounded-lg border-2 border-blue-300 bg-gradient-to-br from-blue-500 to-blue-600 px-3 py-1 text-xs font-semibold text-white hover:shadow-lg active:scale-95 transition-all"
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteId(s.id)}
                            className="rounded-lg border-2 border-red-300 bg-gradient-to-br from-red-500 to-red-600 px-3 py-1 text-xs font-semibold text-white hover:shadow-lg active:scale-95 transition-all"
                          >
                            حذف
                          </button>
                        </Can>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* نافذة إضافة/تعديل مورد */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setAddOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3">
              <h2 className="text-base font-bold text-white">{editing ? 'تعديل مورد' : 'مورد جديد'}</h2>
            </div>
            <Can perm="supplier.write">
              <div className="space-y-3 p-4">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">اسم المورد</label>
                  <input
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="أدخل الاسم..."
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">رقم الهاتف</label>
                  <input
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="أدخل رقم الهاتف..."
                  />
                </div>
                <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setAddOpen(false)
                      setEditing(null)
                      setName('')
                      setPhone('')
                    }}
                    className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg active:scale-95"
                  >
                    حفظ
                  </button>
                </div>
              </div>
            </Can>
          </div>
        </div>
      )}

      {/* نافذة الرصيد */}
      {balId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setBalId(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3">
              <h2 className="text-base font-bold text-white">رصيد المورد — {balName}</h2>
            </div>
            <div className="p-4">
              <p className="mb-3 text-xs text-slate-600">مستحق تقريبي على المتجر (حسب المشتريات والدفعات):</p>
              <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 text-center shadow-sm">
                <div className="text-2xl font-mono font-black" dir="ltr">
                  {balance.toFixed(2)}
                  {CURRENCY_SUFFIX}
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setBalId(null)}
                  className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تأكيد الحذف */}
      {deleteId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setDeleteId(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-red-500 to-red-600 px-4 py-3">
              <h2 className="text-base font-bold text-white">تأكيد الحذف</h2>
            </div>
            <div className="p-4">
              <p className="mb-4 text-sm">
                هل أنت متأكد من حذف المورد <span className="font-bold">"{deleteName}"</span>؟
              </p>
              <p className="mb-4 text-xs text-red-700 font-bold">
                ⚠️ تحذير: لن تتمكن من استرجاع هذا المورد بعد الحذف!
              </p>
              <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
                <button
                  type="button"
                  onClick={() => setDeleteId(null)}
                  className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                >
                  إلغاء
                </button>
                <Can perm="supplier.write">
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    className="rounded-lg bg-gradient-to-br from-red-500 to-red-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:from-red-600 hover:to-red-700 hover:shadow-lg active:scale-95"
                  >
                    حذف نهائياً
                  </button>
                </Can>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
