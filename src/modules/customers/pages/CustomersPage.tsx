import { useCallback, useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { Can } from '../../../core/Can'
import { useToastStore } from '../../../core/toast-store'

type C = { id: string; name: string; phone: string | null; balance: number; loyaltyPoints: number }

export function CustomersPage() {
  const toast = useToastStore((s) => s.push)
  const [items, setItems] = useState<C[]>([])
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const r = await window.posApi.customers.list({ search })
    if (r.ok && 'items' in r) setItems(r.items as C[])
  }, [search])

  useEffect(() => {
    const t = setTimeout(() => void load(), 200)
    return () => clearTimeout(t)
  }, [load])

  async function save() {
    if (saving) return // منع الضغط المتكرر
    if (!name.trim()) {
      toast('يرجى إدخال اسم العميل', 'err')
      return
    }
    
    setSaving(true)
    try {
      console.log('🔵 بدء الحفظ:', { editingId, name: name.trim(), phone: phone.trim() })
      
      const r = await window.posApi.customers.save({ 
        id: editingId || undefined,
        name: name.trim(), 
        phone: phone.trim() || undefined 
      })
      
      console.log('🔵 نتيجة الحفظ:', r)
      
      if (r.ok) {
        const message = editingId ? 'تم التعديل بنجاح' : 'تم الحفظ بنجاح'
        console.log('✅ نجح الحفظ:', message)
        toast(message, 'ok')
        
        // إعادة تعيين الحقول وإغلاق النافذة
        setName('')
        setPhone('')
        setEditingId(null)
        setAddOpen(false)
        
        // تحديث القائمة
        await load()
        console.log('✅ تم تحديث القائمة')
      } else {
        const msg = ('error' in r && r.error) ? r.error : 'فشل الحفظ'
        console.log('❌ فشل الحفظ:', msg)
        toast(msg, 'err')
      }
    } catch (error) {
      console.error('❌ خطأ غير متوقع في الحفظ:', error)
      toast('حدث خطأ غير متوقع أثناء الحفظ', 'err')
    } finally {
      console.log('🔵 انتهى setSaving(false)')
      setSaving(false)
    }
  }

  async function deleteCustomer() {
    if (!deleteId || deleting) return
    
    setDeleting(true)
    try {
      const r = await window.posApi.customers.delete({ id: deleteId })
      if (r.ok) {
        toast('تم الحذف بنجاح', 'ok')
        setDeleteId(null)
        await load()
      } else {
        const msg = ('error' in r && r.error) ? r.error : 'فشل الحذف'
        toast(msg, 'err')
        // إغلاق نافذة التأكيد حتى في حالة الخطأ
        setDeleteId(null)
      }
    } catch (error) {
      console.error('خطأ في حذف العميل:', error)
      toast('حدث خطأ غير متوقع أثناء الحذف', 'err')
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  function openEdit(customer: C) {
    setEditingId(customer.id)
    setName(customer.name)
    setPhone(customer.phone || '')
    setAddOpen(true)
  }

  function openAdd() {
    setEditingId(null)
    setName('')
    setPhone('')
    setAddOpen(true)
  }

  function closeModal() {
    setAddOpen(false)
    setEditingId(null)
    setName('')
    setPhone('')
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-white to-gray-50 px-4 py-3 shadow-sm">
        <h1 className="text-xl font-bold text-blue-700">العملاء</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              className="h-9 w-64 rounded-lg border border-gray-300 bg-white pr-10 pl-3 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              placeholder="بحث بالاسم أو الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Can perm="customer.create">
            <button
              type="button"
              onClick={openAdd}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>عميل جديد</span>
            </button>
          </Can>
        </div>
      </div>

      {/* الجدول */}
      <div className="flex-1 overflow-auto p-4">
        <div className="rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">#</th>
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">اسم العميل</th>
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">رقم الهاتف</th>
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">الرصيد</th>
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">نقاط الولاء</th>
                <th className="px-3 py-3 text-center font-bold text-slate-700">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    لا توجد بيانات
                  </td>
                </tr>
              ) : (
                items.map((c, idx) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                    <td className="border-l border-gray-100 px-3 py-2.5 text-center font-mono">{idx + 1}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 font-semibold">{c.name}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 font-mono">{c.phone || '—'}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 font-mono">{c.balance.toFixed(2)}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5 font-mono text-amber-600">{c.loyaltyPoints}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <Can perm="customer.edit">
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="rounded-lg border-2 border-blue-300 bg-gradient-to-br from-blue-500 to-blue-600 p-1.5 text-white shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-all"
                            title="تعديل"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </Can>
                        <Can perm="customer.delete">
                          <button
                            type="button"
                            onClick={() => setDeleteId(c.id)}
                            className="rounded-lg border-2 border-red-300 bg-gradient-to-br from-red-500 to-red-600 p-1.5 text-white shadow-md hover:shadow-lg hover:from-red-600 hover:to-red-700 active:scale-95 transition-all"
                            title="حذف"
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* نافذة إضافة/تعديل عميل */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={closeModal}>
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3">
              <h2 className="text-lg font-bold text-white">
                {editingId ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
              </h2>
            </div>
            <div className="space-y-3 p-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">اسم العميل</label>
                <input
                  className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 transition-all"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !saving) void save()
                  }}
                  placeholder="أدخل الاسم..."
                  disabled={saving}
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">رقم الهاتف</label>
                <input
                  className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 transition-all"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !saving) void save()
                  }}
                  placeholder="أدخل رقم الهاتف..."
                  disabled={saving}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-gray-50 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2 text-sm font-bold text-white shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تأكيد الحذف */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setDeleteId(null)}>
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between bg-gradient-to-r from-red-500 to-red-600 px-4 py-3">
              <h2 className="text-lg font-bold text-white">تأكيد الحذف</h2>
            </div>
            <div className="p-4">
              <p className="mb-4 text-sm text-slate-700">هل أنت متأكد من حذف هذا العميل؟ لا يمكن التراجع عن هذا الإجراء.</p>
              <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
                <button
                  type="button"
                  onClick={() => !deleting && setDeleteId(null)}
                  disabled={deleting}
                  className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-gray-50 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => void deleteCustomer()}
                  disabled={deleting}
                  className="rounded-lg bg-gradient-to-br from-red-500 to-red-600 px-4 py-2 text-sm font-bold text-white shadow-md hover:shadow-lg hover:from-red-600 hover:to-red-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {deleting ? 'جاري الحذف...' : 'حذف'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
