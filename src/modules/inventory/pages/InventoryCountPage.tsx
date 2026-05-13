import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { arSA } from 'date-fns/locale'
import { Can } from '../../../core/Can'
import { useAuthStore } from '../../../core/stores/auth-store'
import { useToastStore } from '../../../core/toast-store'
import { ProductSearchModal, type PickedProduct } from '../../../components/product-picker/ProductSearchModal'
import {
  EnterpriseModalFrame,
  EnterpriseToolbar,
  enterprisePageRootClass
} from '../../shared/EnterpriseToolbar'

type CountSession = {
  id: string
  status: string
  note: string | null
  startedAt: string
  postedAt: string | null
  userName: string
  linesCount: number
}

type CountLine = {
  id: string
  productId: string
  productName: string
  productBarcode: string | null
  systemQty: number
  countedQty: number
  variance: number
}

export function InventoryCountPage() {
  const toast = useToastStore((s) => s.push)
  const can = useAuthStore((s) => s.can)
  const [sessions, setSessions] = useState<CountSession[]>([])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<CountSession | null>(null)
  const [lines, setLines] = useState<CountLine[]>([])
  const [newCountOpen, setNewCountOpen] = useState(false)
  const [newCountNote, setNewCountNote] = useState('')
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [countQty, setCountQty] = useState('0')

  const loadSessions = useCallback(async () => {
    const r = await window.posApi.inventory.countList()
    if (r.ok && 'items' in r) {
      setSessions(r.items as CountSession[])
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  async function createNewCount() {
    const r = await window.posApi.inventory.countCreate(newCountNote.trim() || undefined)
    if (!r.ok || !('id' in r)) {
      toast('فشل إنشاء الجرد', 'err')
      return
    }
    toast('تم إنشاء جلسة جرد جديدة', 'ok')
    setActiveSessionId(r.id as string)
    setNewCountOpen(false)
    setNewCountNote('')
    void loadSessions()
  }

  async function loadDetails(sessionId: string) {
    const r = await window.posApi.inventory.countDetails(sessionId)
    if (!r.ok || !('session' in r)) {
      toast('فشل تحميل التفاصيل', 'err')
      return
    }
    setSelectedSession(r.session as any)
    setLines(r.lines as CountLine[])
    setDetailsOpen(true)
  }

  async function addProductToCount(product: PickedProduct) {
    if (!activeSessionId) return
    const qty = parseInt(countQty, 10)
    if (isNaN(qty) || qty < 0) {
      toast('أدخل كمية صحيحة', 'err')
      return
    }
    const r = await window.posApi.inventory.countSetLine({
      sessionId: activeSessionId,
      productId: product.id,
      countedQty: qty
    })
    if (!r.ok) {
      toast('فشل إضافة المنتج', 'err')
      return
    }
    toast(`تم تسجيل: ${product.name} - الكمية: ${qty}`, 'ok')
    setCountQty('0')
  }

  async function postCount() {
    if (!activeSessionId) return
    const confirm = window.confirm('هل تريد ترحيل هذا الجرد؟ سيتم تحديث كميات المخزون.')
    if (!confirm) return
    const r = await window.posApi.inventory.countPost(activeSessionId)
    if (!r.ok) {
      toast('فشل ترحيل الجرد', 'err')
      return
    }
    toast('تم ترحيل الجرد بنجاح', 'ok')
    setActiveSessionId(null)
    void loadSessions()
  }

  return (
    <div className={enterprisePageRootClass}>
      <EnterpriseToolbar title="جرد المخزون" />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Header buttons */}
        <div className="flex items-center gap-2">
          <Can do="inventory.write">
            <button
              onClick={() => setNewCountOpen(true)}
              className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg active:scale-95"
            >
              جرد جديد
            </button>
          </Can>
          {activeSessionId && (
            <>
              <button
                onClick={() => setPickerOpen(true)}
                className="rounded-lg bg-gradient-to-br from-green-500 to-green-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:from-green-600 hover:to-green-700 hover:shadow-lg active:scale-95"
              >
                إضافة منتج للجرد
              </button>
              <button
                onClick={() => void postCount()}
                className="rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:from-amber-500 hover:to-amber-600 hover:shadow-lg active:scale-95"
              >
                ترحيل الجرد
              </button>
              <button
                onClick={() => setActiveSessionId(null)}
                className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
              >
                إلغاء
              </button>
            </>
          )}
        </div>

        {activeSessionId && (
          <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 shadow-lg">
            <div className="text-sm font-bold text-blue-700">
              جلسة جرد نشطة: {activeSessionId.slice(0, 8)}...
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={countQty}
                onChange={(e) => setCountQty(e.target.value)}
                placeholder="الكمية المجودة"
                className="w-32 h-9 rounded-lg border border-gray-300 px-3 py-2 text-center text-sm font-bold shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
              <span className="text-xs text-slate-700">ثم اختر منتج لتسجيل الكمية</span>
            </div>
          </div>
        )}

        {/* Sessions table */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-white to-gray-50 border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-bold text-blue-700">جلسات الجرد</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                  <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">رقم الجلسة</th>
                  <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">الحالة</th>
                  <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">المستخدم</th>
                  <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">عدد الأصناف</th>
                  <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">تاريخ البداية</th>
                  <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">تاريخ الترحيل</th>
                  <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">ملاحظات</th>
                  <th className="p-3 text-center font-bold text-slate-700">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-500">
                      لا توجد جلسات جرد
                    </td>
                  </tr>
                )}
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                    <td className="border-l border-gray-100 p-2.5 font-mono text-xs">
                      {s.id.slice(0, 8)}...
                    </td>
                    <td className="border-l border-gray-100 p-2.5">
                      <span
                        className={`inline-block rounded-lg px-2 py-1 text-xs font-bold ${
                          s.status === 'posted'
                            ? 'bg-green-100 text-green-700 border border-green-300'
                            : 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                        }`}
                      >
                        {s.status === 'posted' ? 'مرحّل' : 'مسودة'}
                      </span>
                    </td>
                    <td className="border-l border-gray-100 p-2.5">{s.userName}</td>
                    <td className="border-l border-gray-100 p-2.5 text-center">{s.linesCount}</td>
                    <td className="border-l border-gray-100 p-2.5 text-xs">
                      {format(parseISO(s.startedAt), 'PPp', { locale: arSA })}
                    </td>
                    <td className="border-l border-gray-100 p-2.5 text-xs">
                      {s.postedAt ? format(parseISO(s.postedAt), 'PPp', { locale: arSA }) : '—'}
                    </td>
                    <td className="border-l border-gray-100 p-2.5 text-xs">{s.note || '—'}</td>
                    <td className="p-2.5 text-center">
                      <button
                        onClick={() => void loadDetails(s.id)}
                        className="rounded-lg border-2 border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-gray-50 hover:shadow-md transition-all"
                      >
                        عرض التفاصيل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* New count modal */}
      {newCountOpen && (
        <EnterpriseModalFrame title="جرد جديد" onClose={() => setNewCountOpen(false)}>
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="font-bold text-slate-700">ملاحظات (اختياري)</span>
              <textarea
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                rows={3}
                value={newCountNote}
                onChange={(e) => setNewCountNote(e.target.value)}
                placeholder="مثال: جرد نهاية الشهر"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setNewCountOpen(false)}
                className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-gray-50 hover:shadow-md transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={() => void createNewCount()}
                className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-all"
              >
                إنشاء
              </button>
            </div>
          </div>
        </EnterpriseModalFrame>
      )}

      {/* Details modal */}
      {detailsOpen && selectedSession && (
        <EnterpriseModalFrame
          title={`تفاصيل الجرد: ${selectedSession.id.slice(0, 8)}...`}
          onClose={() => setDetailsOpen(false)}
          maxWidthClass="max-w-5xl"
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-3 text-sm shadow-sm">
              <div>
                <span className="font-bold text-slate-700">المستخدم:</span> {selectedSession.userName}
              </div>
              <div>
                <span className="font-bold text-slate-700">الحالة:</span>{' '}
                {selectedSession.status === 'posted' ? 'مرحّل' : 'مسودة'}
              </div>
              <div>
                <span className="font-bold text-slate-700">تاريخ البداية:</span>{' '}
                {format(parseISO(selectedSession.startedAt), 'PPp', { locale: arSA })}
              </div>
              {selectedSession.postedAt && (
                <div>
                  <span className="font-bold text-slate-700">تاريخ الترحيل:</span>{' '}
                  {format(parseISO(selectedSession.postedAt), 'PPp', { locale: arSA })}
                </div>
              )}
              {selectedSession.note && (
                <div className="col-span-2">
                  <span className="font-bold text-slate-700">ملاحظات:</span> {selectedSession.note}
                </div>
              )}
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                    <th className="border-l border-gray-200 p-3 text-right font-bold text-slate-700">المنتج</th>
                    <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">الباركود</th>
                    <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">الكمية بالنظام</th>
                    <th className="border-l border-gray-200 p-3 text-center font-bold text-slate-700">الكمية المعدودة</th>
                    <th className="p-3 text-center font-bold text-slate-700">الفرق</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-500">
                        لا توجد أصناف في هذا الجرد
                      </td>
                    </tr>
                  )}
                  {lines.map((line) => (
                    <tr key={line.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                      <td className="border-l border-gray-100 p-2.5">{line.productName}</td>
                      <td className="border-l border-gray-100 p-2.5 text-center font-mono text-xs">
                        {line.productBarcode || '—'}
                      </td>
                      <td className="border-l border-gray-100 p-2.5 text-center font-bold">
                        {line.systemQty}
                      </td>
                      <td className="border-l border-gray-100 p-2.5 text-center font-bold">
                        {line.countedQty}
                      </td>
                      <td className="p-2.5 text-center font-bold">
                        <span
                          className={
                            line.variance === 0
                              ? 'text-slate-600'
                              : line.variance > 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }
                        >
                          {line.variance > 0 ? '+' : ''}
                          {line.variance}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </EnterpriseModalFrame>
      )}

      {/* Product picker */}
      <ProductSearchModal
        open={pickerOpen}
        title="اختر منتج لتسجيل كميته"
        onClose={() => setPickerOpen(false)}
        onPick={(p) => {
          void addProductToCount(p)
          setPickerOpen(false)
        }}
      />
    </div>
  )
}
