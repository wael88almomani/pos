import { useCallback, useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { ProductSearchModal, type PickedProduct } from '../../../components/product-picker/ProductSearchModal'
import { Can } from '../../../core/Can'
import { useToastStore } from '../../../core/toast-store'

type SaleLine = { productId: string; quantity: number; unitPrice: number }
type PurLine = { productId: string; quantity: number; unitCost: number }

export function ReturnsPage() {
  const toast = useToastStore((s) => s.push)
  const [tab, setTab] = useState<'sale' | 'purchase'>('sale')
  const [saleId, setSaleId] = useState('')
  const [reason, setReason] = useState('')
  const [pay, setPay] = useState('cash')
  const [lines, setLines] = useState<SaleLine[]>([{ productId: '', quantity: 1, unitPrice: 0 }])
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [supId, setSupId] = useState('')
  const [plines, setPlines] = useState<PurLine[]>([{ productId: '', quantity: 1, unitCost: 0 }])
  const [pickSaleIdx, setPickSaleIdx] = useState<number | null>(null)
  const [pickPurIdx, setPickPurIdx] = useState<number | null>(null)

  const loadSuppliers = useCallback(async () => {
    const r = await window.posApi.supplier.list()
    if (r.ok && 'items' in r) setSuppliers((r.items as { id: string; name: string }[]).map((x) => ({ id: x.id, name: x.name })))
  }, [])

  useEffect(() => {
    if (tab === 'purchase') void loadSuppliers()
  }, [tab, loadSuppliers])

  async function submitSale() {
    const r = await window.posApi.returns.sale({
      saleId: saleId || undefined,
      items: lines.filter((l) => l.productId.trim()),
      reason,
      paymentMethod: pay
    })
    if (r.ok) toast('تم تسجيل المرتجع')
    else toast('فشل التسجيل — تحقق من الصلاحيات والبيانات', 'err')
  }

  async function submitPurchase() {
    const r = await window.posApi.returns.purchase({
      supplierId: supId,
      items: plines.filter((l) => l.productId.trim()),
      reason
    })
    if (r.ok) toast('تم تسجيل مرتجع المشتريات')
    else toast('فشل التسجيل — تحقق من المورد والأصناف', 'err')
  }

  function applySalePick(p: PickedProduct) {
    if (pickSaleIdx === null) return
    setLines((rows) =>
      rows.map((row, j) =>
        j === pickSaleIdx
          ? {
              ...row,
              productId: p.id,
              unitPrice: row.unitPrice > 0 ? row.unitPrice : p.salePrice
            }
          : row
      )
    )
  }

  function applyPurPick(p: PickedProduct) {
    if (pickPurIdx === null) return
    setPlines((rows) =>
      rows.map((row, j) =>
        j === pickPurIdx
          ? {
              ...row,
              productId: p.id,
              unitCost: row.unitCost > 0 ? row.unitCost : p.purchasePrice || p.salePrice
            }
          : row
      )
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-white to-gray-50 px-4 py-3 shadow-sm">
        <h1 className="text-xl font-bold text-blue-700">المرتجعات</h1>
        <div className="flex overflow-hidden rounded-lg border border-gray-300 shadow-sm">
          <button
            type="button"
            className={`px-3 py-1 text-sm font-bold ${
              tab === 'sale'
                ? 'border-l border-blue-300 bg-gradient-to-br from-blue-500 to-blue-600 text-white'
                : 'border-l border-gray-300 bg-white text-slate-700 hover:bg-gray-50'
            }`}
            onClick={() => setTab('sale')}
          >
            مبيعات
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-sm font-bold ${
              tab === 'purchase'
                ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
                : 'bg-white text-slate-700 hover:bg-gray-50'
            }`}
            onClick={() => setTab('purchase')}
          >
            مشتريات
          </button>
        </div>
      </div>

      {/* المحتوى */}
      <div className="flex-1 overflow-auto p-4">
        {tab === 'sale' && (
          <Can perm="returns.sales">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
              <div className="mb-3 border-b border-gray-200 pb-2 text-sm font-bold text-slate-700">مرتجع مبيعات</div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">معرّف الفاتورة الأصلية (اختياري)</label>
                  <input
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 font-mono text-xs shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="معرّف الفاتورة"
                    value={saleId}
                    onChange={(e) => setSaleId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">سبب المرتجع</label>
                  <input
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="سبب المرتجع"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">طريقة الاسترداد للعميل</label>
                  <select
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    value={pay}
                    onChange={(e) => setPay(e.target.value)}
                  >
                    <option value="cash">نقدي</option>
                    <option value="card">بطاقة</option>
                    <option value="mixed">متعدد</option>
                  </select>
                </div>

                <div className="pt-2 text-xs font-bold text-slate-700">أسطر المرتجع</div>
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                        <th className="border-l border-gray-200 px-2 py-2 text-right font-bold text-slate-700">المنتج</th>
                        <th className="w-24 border-l border-gray-200 px-2 py-2 text-center font-bold text-slate-700">الكمية</th>
                        <th className="w-28 px-2 py-2 text-center font-bold text-slate-700">سعر الوحدة</th>
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
                                onClick={() => setPickSaleIdx(i)}
                              >
                                بحث
                              </button>
                              <span className="flex-1 truncate font-mono text-xs text-slate-600 py-1" title={l.productId || undefined}>
                                {l.productId ? 'تم اختيار منتج' : 'لم يُختر بعد'}
                              </span>
                            </div>
                          </td>
                          <td className="border-l border-gray-100 p-2">
                            <input
                              type="number"
                              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-center font-mono text-xs shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                              value={l.quantity}
                              onChange={(e) =>
                                setLines((r) => r.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-center font-mono text-xs shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                              value={l.unitPrice}
                              onChange={(e) =>
                                setLines((r) => r.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) } : x)))
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
                  className="rounded-lg border-2 border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                  onClick={() => setLines((r) => [...r, { productId: '', quantity: 1, unitPrice: 0 }])}
                >
                  + سطر جديد
                </button>
                <button
                  type="button"
                  className="w-full rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 py-2 text-sm font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg active:scale-95"
                  onClick={() => void submitSale()}
                >
                  حفظ مرتجع المبيعات
                </button>
              </div>
            </div>
          </Can>
        )}

        {tab === 'purchase' && (
          <Can perm="returns.purchase">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
              <div className="mb-3 border-b border-gray-200 pb-2 text-sm font-bold text-slate-700">مرتجع مشتريات</div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">المورد</label>
                  <select
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    value={supId}
                    onChange={(e) => setSupId(e.target.value)}
                  >
                    <option value="">— اختر المورد —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">سبب المرتجع</label>
                  <input
                    className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="سبب المرتجع"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                        <th className="border-l border-gray-200 px-2 py-2 text-right font-bold text-slate-700">المنتج</th>
                        <th className="w-24 border-l border-gray-200 px-2 py-2 text-center font-bold text-slate-700">الكمية</th>
                        <th className="w-28 px-2 py-2 text-center font-bold text-slate-700">تكلفة الوحدة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plines.map((l, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="border-l border-gray-100 p-2">
                            <div className="flex gap-1 items-center">
                              <button
                                type="button"
                                className="rounded-lg border-2 border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                                onClick={() => setPickPurIdx(i)}
                              >
                                بحث
                              </button>
                              <Package className="h-4 w-4 text-slate-400 shrink-0" />
                              <span className="truncate font-mono text-xs text-slate-600" title={l.productId || undefined}>
                                {l.productId ? 'تم اختيار منتج' : 'لم يُختر بعد'}
                              </span>
                            </div>
                          </td>
                          <td className="border-l border-gray-100 p-2">
                            <input
                              type="number"
                              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-center font-mono text-xs shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                              value={l.quantity}
                              onChange={(e) =>
                                setPlines((r) => r.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-center font-mono text-xs shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                              value={l.unitCost}
                              onChange={(e) =>
                                setPlines((r) => r.map((x, j) => (j === i ? { ...x, unitCost: Number(e.target.value) } : x)))
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
                  className="rounded-lg border-2 border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                  onClick={() => setPlines((r) => [...r, { productId: '', quantity: 1, unitCost: 0 }])}
                >
                  + سطر جديد
                </button>
                <button
                  type="button"
                  className="w-full rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 py-2 text-sm font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg active:scale-95"
                  onClick={() => void submitPurchase()}
                >
                  حفظ مرتجع المشتريات
                </button>
              </div>
            </div>
          </Can>
        )}
      </div>

      <ProductSearchModal
        open={pickSaleIdx !== null}
        title="منتج — مرتجع مبيعات"
        onClose={() => setPickSaleIdx(null)}
        onPick={(p) => applySalePick(p)}
      />
      <ProductSearchModal
        open={pickPurIdx !== null}
        title="منتج — مرتجع مشتريات"
        onClose={() => setPickPurIdx(null)}
        onPick={(p) => applyPurPick(p)}
      />
    </div>
  )
}
