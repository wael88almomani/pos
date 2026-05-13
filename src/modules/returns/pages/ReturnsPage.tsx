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
    <div className="flex h-screen flex-col overflow-hidden bg-[#d0d0d0]">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 shadow">
        <h1 className="text-lg font-black text-[#1a1a1a]">المرتجعات</h1>
        <div className="flex border border-[#555] overflow-hidden shadow">
          <button
            type="button"
            className={`px-3 py-1 text-sm font-bold ${
              tab === 'sale'
                ? 'bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] text-black border-l border-[#1a4480]'
                : 'bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] border-l border-[#555]'
            }`}
            onClick={() => setTab('sale')}
          >
            مبيعات
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-sm font-bold ${
              tab === 'purchase'
                ? 'bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] text-black'
                : 'bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0]'
            }`}
            onClick={() => setTab('purchase')}
          >
            مشتريات
          </button>
        </div>
      </div>

      {/* المحتوى */}
      <div className="flex-1 overflow-auto p-3">
        {tab === 'sale' && (
          <Can perm="returns.sales">
            <div className="border-2 border-[#808080] bg-white p-4 shadow">
              <div className="mb-3 border-b border-slate-300 pb-2 text-sm font-black">مرتجع مبيعات</div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-bold">معرّف الفاتورة الأصلية (اختياري)</label>
                  <input
                    className="w-full border border-slate-400 bg-white px-2 py-1.5 font-mono text-xs shadow-inner"
                    placeholder="معرّف الفاتورة"
                    value={saleId}
                    onChange={(e) => setSaleId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold">سبب المرتجع</label>
                  <input
                    className="w-full border border-slate-400 bg-white px-2 py-1.5 shadow-inner"
                    placeholder="سبب المرتجع"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold">طريقة الاسترداد للعميل</label>
                  <select
                    className="w-full border border-slate-400 bg-white px-2 py-1.5 shadow-inner"
                    value={pay}
                    onChange={(e) => setPay(e.target.value)}
                  >
                    <option value="cash">نقدي</option>
                    <option value="card">بطاقة</option>
                    <option value="mixed">متعدد</option>
                  </select>
                </div>

                <div className="text-xs font-bold pt-2">أسطر المرتجع</div>
                <div className="border border-[#808080] bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d8d8d8]">
                        <th className="border-l border-[#c0c0c0] px-2 py-2 text-right font-black">المنتج</th>
                        <th className="border-l border-[#c0c0c0] px-2 py-2 text-center font-black w-24">الكمية</th>
                        <th className="px-2 py-2 text-center font-black w-28">سعر الوحدة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={i} className="border-b border-[#e0e0e0]">
                          <td className="border-l border-[#e0e0e0] p-2">
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-2 py-1 text-xs font-bold shadow"
                                onClick={() => setPickSaleIdx(i)}
                              >
                                بحث
                              </button>
                              <span className="flex-1 truncate font-mono text-xs text-slate-600 py-1" title={l.productId || undefined}>
                                {l.productId ? 'تم اختيار منتج' : 'لم يُختر بعد'}
                              </span>
                            </div>
                          </td>
                          <td className="border-l border-[#e0e0e0] p-2">
                            <input
                              type="number"
                              className="w-full border border-slate-400 bg-white px-2 py-1 text-center font-mono text-xs shadow-inner"
                              value={l.quantity}
                              onChange={(e) =>
                                setLines((r) => r.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              className="w-full border border-slate-400 bg-white px-2 py-1 text-center font-mono text-xs shadow-inner"
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
                  className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-3 py-1 text-sm font-bold shadow"
                  onClick={() => setLines((r) => [...r, { productId: '', quantity: 1, unitPrice: 0 }])}
                >
                  + سطر جديد
                </button>
                <button
                  type="button"
                  className="w-full border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] py-2 text-sm font-black text-black shadow"
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
            <div className="border-2 border-[#808080] bg-white p-4 shadow">
              <div className="mb-3 border-b border-slate-300 pb-2 text-sm font-black">مرتجع مشتريات</div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-bold">المورد</label>
                  <select
                    className="w-full border border-slate-400 bg-white px-2 py-1.5 shadow-inner"
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
                  <label className="mb-1 block text-sm font-bold">سبب المرتجع</label>
                  <input
                    className="w-full border border-slate-400 bg-white px-2 py-1.5 shadow-inner"
                    placeholder="سبب المرتجع"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>

                <div className="border border-[#808080] bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d8d8d8]">
                        <th className="border-l border-[#c0c0c0] px-2 py-2 text-right font-black">المنتج</th>
                        <th className="border-l border-[#c0c0c0] px-2 py-2 text-center font-black w-24">الكمية</th>
                        <th className="px-2 py-2 text-center font-black w-28">تكلفة الوحدة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plines.map((l, i) => (
                        <tr key={i} className="border-b border-[#e0e0e0]">
                          <td className="border-l border-[#e0e0e0] p-2">
                            <div className="flex gap-1 items-center">
                              <button
                                type="button"
                                className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-2 py-1 text-xs font-bold shadow"
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
                          <td className="border-l border-[#e0e0e0] p-2">
                            <input
                              type="number"
                              className="w-full border border-slate-400 bg-white px-2 py-1 text-center font-mono text-xs shadow-inner"
                              value={l.quantity}
                              onChange={(e) =>
                                setPlines((r) => r.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              className="w-full border border-slate-400 bg-white px-2 py-1 text-center font-mono text-xs shadow-inner"
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
                  className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-3 py-1 text-sm font-bold shadow"
                  onClick={() => setPlines((r) => [...r, { productId: '', quantity: 1, unitCost: 0 }])}
                >
                  + سطر جديد
                </button>
                <button
                  type="button"
                  className="w-full border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] py-2 text-sm font-black text-black shadow"
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
