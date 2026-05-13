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
              className="rounded border-2 border-[#808080] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-4 py-2 text-sm font-bold text-black shadow-sm hover:from-[#90c0e8] hover:to-[#2870b4]"
            >
              جرد جديد
            </button>
          </Can>
          {activeSessionId && (
            <>
              <button
                onClick={() => setPickerOpen(true)}
                className="rounded border-2 border-[#808080] bg-gradient-to-b from-[#a5d6a7] to-[#66bb6a] px-4 py-2 text-sm font-bold text-black shadow-sm hover:from-[#90c890] hover:to-[#50a054]"
              >
                إضافة منتج للجرد
              </button>
              <button
                onClick={() => void postCount()}
                className="rounded border-2 border-[#808080] bg-gradient-to-b from-[#fff59d] to-[#fbc02d] px-4 py-2 text-sm font-bold text-black shadow-sm hover:from-[#ffe680] hover:to-[#e0a820]"
              >
                ترحيل الجرد
              </button>
              <button
                onClick={() => setActiveSessionId(null)}
                className="rounded border-2 border-[#808080] bg-gradient-to-b from-[#e0e0e0] to-[#bdbdbd] px-4 py-2 text-sm font-bold text-black shadow-sm"
              >
                إلغاء
              </button>
            </>
          )}
        </div>

        {activeSessionId && (
          <div className="rounded border-2 border-[#808080] bg-[#d0d0d0] p-3">
            <div className="text-sm font-bold text-slate-900">
              جلسة جرد نشطة: {activeSessionId.slice(0, 8)}...
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={countQty}
                onChange={(e) => setCountQty(e.target.value)}
                placeholder="الكمية المجودة"
                className="w-32 rounded border-2 border-[#808080] px-2 py-1 text-center text-sm font-bold"
              />
              <span className="text-xs text-slate-700">ثم اختر منتج لتسجيل الكمية</span>
            </div>
          </div>
        )}

        {/* Sessions table */}
        <div className="rounded border-2 border-[#808080] bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] border-b-2 border-[#808080] px-3 py-2">
            <h3 className="text-sm font-bold text-slate-900">جلسات الجرد</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f5f5f5] border-b-2 border-[#808080]">
                  <th className="border-l border-[#808080] p-2 text-right font-bold">رقم الجلسة</th>
                  <th className="border-l border-[#808080] p-2 text-right font-bold">الحالة</th>
                  <th className="border-l border-[#808080] p-2 text-right font-bold">المستخدم</th>
                  <th className="border-l border-[#808080] p-2 text-right font-bold">عدد الأصناف</th>
                  <th className="border-l border-[#808080] p-2 text-right font-bold">تاريخ البداية</th>
                  <th className="border-l border-[#808080] p-2 text-right font-bold">تاريخ الترحيل</th>
                  <th className="border-l border-[#808080] p-2 text-right font-bold">ملاحظات</th>
                  <th className="p-2 text-center font-bold">إجراءات</th>
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
                  <tr key={s.id} className="border-b border-[#d0d0d0] hover:bg-[#f0f0f0]">
                    <td className="border-l border-[#d0d0d0] p-2 font-mono text-xs">
                      {s.id.slice(0, 8)}...
                    </td>
                    <td className="border-l border-[#d0d0d0] p-2">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                          s.status === 'posted'
                            ? 'bg-green-200 text-green-900'
                            : 'bg-yellow-200 text-yellow-900'
                        }`}
                      >
                        {s.status === 'posted' ? 'مرحّل' : 'مسودة'}
                      </span>
                    </td>
                    <td className="border-l border-[#d0d0d0] p-2">{s.userName}</td>
                    <td className="border-l border-[#d0d0d0] p-2 text-center">{s.linesCount}</td>
                    <td className="border-l border-[#d0d0d0] p-2 text-xs">
                      {format(parseISO(s.startedAt), 'PPp', { locale: arSA })}
                    </td>
                    <td className="border-l border-[#d0d0d0] p-2 text-xs">
                      {s.postedAt ? format(parseISO(s.postedAt), 'PPp', { locale: arSA }) : '—'}
                    </td>
                    <td className="border-l border-[#d0d0d0] p-2 text-xs">{s.note || '—'}</td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() => void loadDetails(s.id)}
                        className="rounded border border-[#808080] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-1 text-xs font-bold text-black hover:from-[#d0d0d0] hover:to-[#a8a8a8]"
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
              <span className="font-bold">ملاحظات (اختياري)</span>
              <textarea
                className="mt-1 w-full rounded border-2 border-[#808080] px-2 py-1 text-sm"
                rows={3}
                value={newCountNote}
                onChange={(e) => setNewCountNote(e.target.value)}
                placeholder="مثال: جرد نهاية الشهر"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setNewCountOpen(false)}
                className="rounded border-2 border-[#808080] bg-gradient-to-b from-[#e0e0e0] to-[#bdbdbd] px-4 py-2 text-sm font-bold text-black"
              >
                إلغاء
              </button>
              <button
                onClick={() => void createNewCount()}
                className="rounded border-2 border-[#808080] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-4 py-2 text-sm font-bold text-black"
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
            <div className="grid grid-cols-2 gap-3 rounded border-2 border-[#808080] bg-[#f5f5f5] p-3 text-sm">
              <div>
                <span className="font-bold">المستخدم:</span> {selectedSession.userName}
              </div>
              <div>
                <span className="font-bold">الحالة:</span>{' '}
                {selectedSession.status === 'posted' ? 'مرحّل' : 'مسودة'}
              </div>
              <div>
                <span className="font-bold">تاريخ البداية:</span>{' '}
                {format(parseISO(selectedSession.startedAt), 'PPp', { locale: arSA })}
              </div>
              {selectedSession.postedAt && (
                <div>
                  <span className="font-bold">تاريخ الترحيل:</span>{' '}
                  {format(parseISO(selectedSession.postedAt), 'PPp', { locale: arSA })}
                </div>
              )}
              {selectedSession.note && (
                <div className="col-span-2">
                  <span className="font-bold">ملاحظات:</span> {selectedSession.note}
                </div>
              )}
            </div>
            <div className="overflow-x-auto rounded border-2 border-[#808080]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] border-b-2 border-[#808080]">
                    <th className="border-l border-[#808080] p-2 text-right font-bold">المنتج</th>
                    <th className="border-l border-[#808080] p-2 text-center font-bold">الباركود</th>
                    <th className="border-l border-[#808080] p-2 text-center font-bold">الكمية بالنظام</th>
                    <th className="border-l border-[#808080] p-2 text-center font-bold">الكمية المعدودة</th>
                    <th className="p-2 text-center font-bold">الفرق</th>
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
                    <tr key={line.id} className="border-b border-[#d0d0d0]">
                      <td className="border-l border-[#d0d0d0] p-2">{line.productName}</td>
                      <td className="border-l border-[#d0d0d0] p-2 text-center font-mono text-xs">
                        {line.productBarcode || '—'}
                      </td>
                      <td className="border-l border-[#d0d0d0] p-2 text-center font-bold">
                        {line.systemQty}
                      </td>
                      <td className="border-l border-[#d0d0d0] p-2 text-center font-bold">
                        {line.countedQty}
                      </td>
                      <td className="p-2 text-center font-bold">
                        <span
                          className={
                            line.variance === 0
                              ? 'text-slate-600'
                              : line.variance > 0
                              ? 'text-green-700'
                              : 'text-red-700'
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
