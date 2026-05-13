import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Can } from '../../../core/Can'
import { useToastStore } from '../../../core/toast-store'
import { useAuthStore } from '../../../core/stores/auth-store'
import { ProductSearchModal, type PickedProduct } from '../../../components/product-picker/ProductSearchModal'

export function PurchasesPage() {
  const canComplete = useAuthStore((s) => s.can('purchase.complete'))
  const toast = useToastStore((s) => s.push)
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [draftId, setDraftId] = useState<string | undefined>()
  const [lines, setLines] = useState<{ productId: string; quantity: number; unitCost: number }[]>([
    { productId: '', quantity: 1, unitCost: 0 }
  ])
  const [tax, setTax] = useState('0')
  const [disc, setDisc] = useState('0')
  const [list, setList] = useState<{ id: string; invoiceNumber: string; status: string; total: number }[]>([])
  const [pickLine, setPickLine] = useState<number | null>(null)

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([window.posApi.supplier.list(), window.posApi.purchase.list({})])
    if (s.ok && 'items' in s) setSuppliers((s.items as { id: string; name: string }[]).map((x) => ({ id: x.id, name: x.name })))
    if (p.ok && 'items' in p) setList(p.items as never)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveDraft() {
    const r = await window.posApi.purchase.saveDraft({
      id: draftId,
      supplierId,
      items: lines.filter((l) => l.productId.trim()),
      taxRate: Number(tax),
      discount: Number(disc)
    })
    if (r.ok && 'id' in r) {
      setDraftId(r.id as string)
      toast('تم حفظ المسودة')
      void load()
    } else toast('فشل الحفظ', 'err')
  }

  async function complete() {
    if (!draftId) return
    const r = await window.posApi.purchase.complete(draftId)
    if (r.ok) {
      toast('تم إتمام المشتراة')
      setDraftId(undefined)
      setLines([{ productId: '', quantity: 1, unitCost: 0 }])
      void load()
    } else toast('فشل الإتمام', 'err')
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#d0d0d0]">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 shadow">
        <h1 className="text-lg font-black text-[#1a1a1a]">المشتريات</h1>
      </div>

      {/* المحتوى */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        <Can perm="purchase.write">
          <div className="border-2 border-[#808080] bg-white p-4 shadow">
            <div className="mb-3 border-b border-slate-300 pb-2 text-sm font-black">فاتورة مشتراة جديدة</div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-bold">المورد</label>
                <select
                  className="w-full border border-slate-400 bg-white px-2 py-1.5 text-sm shadow-inner"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">— اختر موردًا —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border border-[#808080] bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d8d8d8]">
                      <th className="border-l border-[#c0c0c0] px-2 py-2 text-right font-black">المنتج</th>
                      <th className="border-l border-[#c0c0c0] px-2 py-2 text-center font-black w-28">الكمية</th>
                      <th className="px-2 py-2 text-center font-black w-32">تكلفة الوحدة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} className="border-b border-[#e0e0e0]">
                        <td className="border-l border-[#e0e0e0] p-2">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-2 py-1 text-xs font-bold shadow hover:from-[#f5f5f5]"
                              onClick={() => setPickLine(i)}
                            >
                              بحث
                            </button>
                            <input
                              className="flex-1 border border-slate-400 bg-white px-2 py-1 font-mono text-xs shadow-inner"
                              placeholder="معرّف المنتج"
                              value={l.productId}
                              onChange={(e) =>
                                setLines((rows) => rows.map((r, j) => (j === i ? { ...r, productId: e.target.value } : r)))
                              }
                            />
                          </div>
                        </td>
                        <td className="border-l border-[#e0e0e0] p-2">
                          <input
                            type="number"
                            className="w-full border border-slate-400 bg-white px-2 py-1 text-center font-mono text-xs shadow-inner"
                            value={l.quantity}
                            onChange={(e) =>
                              setLines((rows) => rows.map((r, j) => (j === i ? { ...r, quantity: Number(e.target.value) } : r)))
                            }
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            className="w-full border border-slate-400 bg-white px-2 py-1 text-center font-mono text-xs shadow-inner"
                            value={l.unitCost}
                            onChange={(e) =>
                              setLines((rows) => rows.map((r, j) => (j === i ? { ...r, unitCost: Number(e.target.value) } : r)))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-3 py-1 text-sm font-bold shadow hover:from-[#f5f5f5]"
                onClick={() => setLines((r) => [...r, { productId: '', quantity: 1, unitCost: 0 }])}
              >
                + سطر جديد
              </button>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-bold">ضريبة %</label>
                  <input
                    className="w-full border border-slate-400 bg-white px-2 py-1.5 font-mono text-sm shadow-inner"
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold">خصم</label>
                  <input
                    className="w-full border border-slate-400 bg-white px-2 py-1.5 font-mono text-sm shadow-inner"
                    value={disc}
                    onChange={(e) => setDisc(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-4 py-1.5 text-sm font-bold shadow hover:from-[#f5f5f5]"
                  onClick={() => void saveDraft()}
                >
                  حفظ مسودة
                </button>
                {canComplete && (
                  <button
                    type="button"
                    className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-4 py-1.5 text-sm font-black text-black shadow hover:from-[#b8ddf8]"
                    onClick={() => void complete()}
                  >
                    إتمام (تحديث المخزون)
                  </button>
                )}
              </div>

              {draftId && <div className="text-xs font-mono text-slate-600">مسودة نشطة: {draftId}</div>}
            </div>
          </div>
        </Can>

        <div className="border-2 border-[#808080] bg-white shadow">
          <div className="border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 text-sm font-black">
            آخر المشتريات
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d8d8d8]">
                <th className="border-l border-[#c0c0c0] px-3 py-2 text-right font-black">رقم الفاتورة</th>
                <th className="border-l border-[#c0c0c0] px-3 py-2 text-right font-black">الحالة</th>
                <th className="px-3 py-2 text-right font-black">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-slate-500">
                    لا توجد مشتريات
                  </td>
                </tr>
              ) : (
                list.map((x) => (
                  <tr key={x.id} className="border-b border-[#e0e0e0] hover:bg-[#f5f5f5]">
                    <td className="border-l border-[#e0e0e0] px-3 py-2 font-mono">{x.invoiceNumber}</td>
                    <td className="border-l border-[#e0e0e0] px-3 py-2">{x.status}</td>
                    <td className="px-3 py-2 font-mono">{x.total.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProductSearchModal
        open={pickLine !== null}
        title="اختيار منتج للمشتراة"
        onClose={() => setPickLine(null)}
        onPick={(p: PickedProduct) => {
          if (pickLine === null) return
          setLines((rows) =>
            rows.map((r, j) =>
              j === pickLine ? { ...r, productId: p.id, unitCost: r.unitCost || p.purchasePrice || p.salePrice } : r
            )
          )
        }}
      />
    </div>
  )
}
