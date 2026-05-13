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
    <div className="flex h-screen flex-col overflow-hidden bg-[#d0d0d0]">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 shadow">
        <h1 className="text-lg font-black text-[#1a1a1a]">الموردين</h1>
        <Can perm="supplier.write">
          <button
            type="button"
            onClick={() => {
              setAddOpen(true)
              setEditing(null)
              setName('')
              setPhone('')
            }}
            className="flex items-center gap-1 border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-4 py-1.5 text-sm font-black text-black shadow hover:from-[#b8ddf8]"
          >
            <Plus className="h-4 w-4" />
            <span>مورد جديد</span>
          </button>
        </Can>
      </div>

      {/* الجدول */}
      <div className="flex-1 overflow-auto p-3">
        <div className="border border-[#808080] bg-white shadow">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d8d8d8]">
                <th className="border-l border-[#c0c0c0] px-3 py-2 text-right font-black">#</th>
                <th className="border-l border-[#c0c0c0] px-3 py-2 text-right font-black">اسم المورد</th>
                <th className="border-l border-[#c0c0c0] px-3 py-2 text-right font-black">رقم الهاتف</th>
                <th className="px-3 py-2 text-center font-black">إجراءات</th>
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
                  <tr key={s.id} className="border-b border-[#e0e0e0] hover:bg-[#f5f5f5]">
                    <td className="border-l border-[#e0e0e0] px-3 py-2 text-center font-mono">{idx + 1}</td>
                    <td className="border-l border-[#e0e0e0] px-3 py-2 font-semibold">{s.name}</td>
                    <td className="border-l border-[#e0e0e0] px-3 py-2 font-mono">{s.phone || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => void showBal(s.id)}
                          className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-3 py-1 text-xs font-bold shadow hover:from-[#f5f5f5]"
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
                            className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-3 py-1 text-xs font-bold shadow hover:from-[#f5f5f5]"
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteId(s.id)}
                            className="border border-[#8b0000] bg-gradient-to-b from-[#ffb3b3] to-[#ff4444] px-3 py-1 text-xs font-bold text-black shadow hover:from-[#ffc0c0]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAddOpen(false)}>
          <div className="w-full max-w-md border-2 border-[#808080] bg-[#d0d0d0] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2">
              <h2 className="text-base font-black text-[#1a1a1a]">{editing ? 'تعديل مورد' : 'مورد جديد'}</h2>
            </div>
            <Can perm="supplier.write">
              <div className="space-y-3 p-4">
                <div>
                  <label className="mb-1 block text-sm font-bold">اسم المورد</label>
                  <input
                    className="w-full border border-slate-400 bg-white px-2 py-1.5 text-sm shadow-inner"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="أدخل الاسم..."
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold">رقم الهاتف</label>
                  <input
                    className="w-full border border-slate-400 bg-white px-2 py-1.5 text-sm shadow-inner"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="أدخل رقم الهاتف..."
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAddOpen(false)
                      setEditing(null)
                      setName('')
                      setPhone('')
                    }}
                    className="border border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-4 py-1.5 text-sm font-bold shadow hover:from-[#f5f5f5]"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-4 py-1.5 text-sm font-black text-black shadow hover:from-[#b8ddf8]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setBalId(null)}>
          <div className="w-full max-w-md border-2 border-[#808080] bg-[#d0d0d0] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2">
              <h2 className="text-base font-black text-[#1a1a1a]">رصيد المورد — {balName}</h2>
            </div>
            <div className="p-4">
              <p className="mb-3 text-xs text-slate-600">مستحق تقريبي على المتجر (حسب المشتريات والدفعات):</p>
              <div className="border-2 border-[#808080] bg-white p-4 text-center">
                <div className="text-2xl font-mono font-black" dir="ltr">
                  {balance.toFixed(2)}
                  {CURRENCY_SUFFIX}
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setBalId(null)}
                  className="border border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-4 py-1.5 text-sm font-bold shadow hover:from-[#f5f5f5]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteId(null)}>
          <div className="w-full max-w-md border-2 border-[#808080] bg-[#d0d0d0] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2">
              <h2 className="text-base font-black text-[#1a1a1a]">تأكيد الحذف</h2>
            </div>
            <div className="p-4">
              <p className="mb-4 text-sm">
                هل أنت متأكد من حذف المورد <span className="font-bold">"{deleteName}"</span>؟
              </p>
              <p className="mb-4 text-xs text-red-700 font-bold">
                ⚠️ تحذير: لن تتمكن من استرجاع هذا المورد بعد الحذف!
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteId(null)}
                  className="border border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-4 py-1.5 text-sm font-bold shadow hover:from-[#f5f5f5]"
                >
                  إلغاء
                </button>
                <Can perm="supplier.write">
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    className="border border-[#8b0000] bg-gradient-to-b from-[#ffb3b3] to-[#ff4444] px-4 py-1.5 text-sm font-bold text-black shadow hover:from-[#ffc0c0]"
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
