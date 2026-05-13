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
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-white to-gray-50 px-4 py-3 shadow-sm">
        <h1 className="text-xl font-bold text-blue-700">المشتريات</h1>
      </div>

      {/* المحتوى */}
      <div className="flex-1 overflow-auto space-y-4 p-4">
        <Can perm="purchase.write">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
            <div className="mb-3 border-b border-gray-200 pb-2 text-sm font-bold text-slate-700">فاتورة مشتراة جديدة</div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">المورد</label>
                <select
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
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

              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                      <th className="border-l border-gray-200 px-2 py-2 text-right font-bold text-slate-700">المنتج</th>
                      <th className="w-28 border-l border-gray-200 px-2 py-2 text-center font-bold text-slate-700">الكمية</th>
                      <th className="w-32 px-2 py-2 text-center font-bold text-slate-700">تكلفة الوحدة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="border-l border-gray-100 p-2">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="rounded-lg border-2 border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                              onClick={() => setPickLine(i)}
                            >
                              بحث
                            </button>
                            <input
                              className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1 font-mono text-xs shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                              placeholder="معرّف المنتج"
                              value={l.productId}
                              onChange={(e) =>
                                setLines((rows) => rows.map((r, j) => (j === i ? { ...r, productId: e.target.value } : r)))
                              }
                            />
                          </div>
                        </td>
                        <td className="border-l border-gray-100 p-2">
                          <input
                            type="number"
                            className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-center font-mono text-xs shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                            value={l.quantity}
                            onChange={(e) =>
                              setLines((rows) => rows.map((r, j) => (j === i ? { ...r, quantity: Number(e.target.value) } : r)))
                            }
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-center font-mono text-xs shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
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
                className="inline-flex items-center rounded-lg border-2 border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                onClick={() => setLines((r) => [...r, { productId: '', quantity: 1, unitCost: 0 }])}
              >
                + سطر جديد
              </button>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">ضريبة %</label>
                  <input
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 font-mono text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">خصم</label>
                  <input
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 font-mono text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    value={disc}
                    onChange={(e) => setDisc(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                  onClick={() => void saveDraft()}
                >
                  حفظ مسودة
                </button>
                {canComplete && (
                  <button
                    type="button"
                    className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg active:scale-95"
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

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 px-3 py-2 text-sm font-bold text-slate-700">
            آخر المشتريات
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">رقم الفاتورة</th>
                <th className="border-l border-gray-200 px-3 py-3 text-right font-bold text-slate-700">الحالة</th>
                <th className="px-3 py-3 text-right font-bold text-slate-700">الإجمالي</th>
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
                  <tr key={x.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                    <td className="border-l border-gray-100 px-3 py-2.5 font-mono">{x.invoiceNumber}</td>
                    <td className="border-l border-gray-100 px-3 py-2.5">{x.status}</td>
                    <td className="px-3 py-2.5 font-mono">{x.total.toFixed(2)}</td>
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
