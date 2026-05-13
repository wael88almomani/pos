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
    <div className="flex h-screen flex-col overflow-hidden bg-[#d0d0d0]">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 shadow">
        <h1 className="text-lg font-black text-[#1a1a1a]">العملاء</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              className="h-8 w-64 border border-slate-400 bg-white pr-8 pl-2 text-sm shadow-inner"
              placeholder="بحث بالاسم أو الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Can perm="customer.create">
            <button
              type="button"
              onClick={openAdd}
              className="flex items-center gap-1 border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-4 py-1.5 text-sm font-black text-black shadow hover:from-[#b8ddf8]"
            >
              <Plus className="h-4 w-4" />
              <span>عميل جديد</span>
            </button>
          </Can>
        </div>
      </div>

      {/* الجدول */}
      <div className="flex-1 overflow-auto p-3">
        <div className="border border-[#808080] bg-white shadow">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d8d8d8]">
                <th className="border-l border-[#c0c0c0] px-3 py-2 text-right font-black">#</th>
                <th className="border-l border-[#c0c0c0] px-3 py-2 text-right font-black">اسم العميل</th>
                <th className="border-l border-[#c0c0c0] px-3 py-2 text-right font-black">رقم الهاتف</th>
                <th className="border-l border-[#c0c0c0] px-3 py-2 text-right font-black">الرصيد</th>
                <th className="border-l border-[#c0c0c0] px-3 py-2 text-right font-black">نقاط الولاء</th>
                <th className="px-3 py-2 text-center font-black">الإجراءات</th>
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
                  <tr key={c.id} className="border-b border-[#e0e0e0] hover:bg-[#f5f5f5]">
                    <td className="border-l border-[#e0e0e0] px-3 py-2 text-center font-mono">{idx + 1}</td>
                    <td className="border-l border-[#e0e0e0] px-3 py-2 font-semibold">{c.name}</td>
                    <td className="border-l border-[#e0e0e0] px-3 py-2 font-mono">{c.phone || '—'}</td>
                    <td className="border-l border-[#e0e0e0] px-3 py-2 font-mono">{c.balance.toFixed(2)}</td>
                    <td className="border-l border-[#e0e0e0] px-3 py-2 font-mono text-amber-700">{c.loyaltyPoints}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <Can perm="customer.edit">
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] p-1.5 text-black shadow hover:from-[#b8ddf8]"
                            title="تعديل"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </Can>
                        <Can perm="customer.delete">
                          <button
                            type="button"
                            onClick={() => setDeleteId(c.id)}
                            className="border border-[#b71c1c] bg-gradient-to-b from-[#e53935] to-[#b71c1c] p-1.5 text-white shadow hover:from-[#ef5350]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeModal}>
          <div className="w-full max-w-md border-2 border-[#808080] bg-[#d0d0d0] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2">
              <h2 className="text-base font-black text-[#1a1a1a]">
                {editingId ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
              </h2>
            </div>
            <div className="space-y-3 p-4">
              <div>
                <label className="mb-1 block text-sm font-bold">اسم العميل</label>
                <input
                  className="w-full border border-slate-400 bg-white px-2 py-1.5 text-sm shadow-inner disabled:opacity-50"
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
                <label className="mb-1 block text-sm font-bold">رقم الهاتف</label>
                <input
                  className="w-full border border-slate-400 bg-white px-2 py-1.5 text-sm shadow-inner disabled:opacity-50"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !saving) void save()
                  }}
                  placeholder="أدخل رقم الهاتف..."
                  disabled={saving}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="border border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-4 py-1.5 text-sm font-bold shadow hover:from-[#f5f5f5] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-4 py-1.5 text-sm font-black text-black shadow hover:from-[#b8ddf8] disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteId(null)}>
          <div className="w-full max-w-md border-2 border-[#808080] bg-[#d0d0d0] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2">
              <h2 className="text-base font-black text-[#1a1a1a]">تأكيد الحذف</h2>
            </div>
            <div className="p-4">
              <p className="mb-4 text-sm">هل أنت متأكد من حذف هذا العميل؟ لا يمكن التراجع عن هذا الإجراء.</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => !deleting && setDeleteId(null)}
                  disabled={deleting}
                  className="border border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-4 py-1.5 text-sm font-bold shadow hover:from-[#f5f5f5] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => void deleteCustomer()}
                  disabled={deleting}
                  className="border border-[#b71c1c] bg-gradient-to-b from-[#e53935] to-[#b71c1c] px-4 py-1.5 text-sm font-black text-white shadow hover:from-[#ef5350] disabled:opacity-50 disabled:cursor-not-allowed"
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
