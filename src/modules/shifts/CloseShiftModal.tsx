import { useEffect, useState } from 'react'
import { useAuthStore } from '../../core/stores/auth-store'

export function CloseShiftModal({ onClose }: { onClose: () => void }) {
  const session = useAuthStore((s) => s.session)
  const setSession = useAuthStore((s) => s.setSession)
  const [actual, setActual] = useState('0')
  const [notes, setNotes] = useState('')
  const [managerPin, setManagerPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [summary, setSummary] = useState<Record<string, number> | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (session) setActual(String(session.openingCash))
  }, [session])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      const res = await window.posApi.session.close({
        actualCash: Number(actual),
        notes: notes || undefined,
        managerPin: managerPin || undefined
      })
      if (!res.ok) {
        if ('code' in res && res.code === 'MANAGER_PIN_REQUIRED') {
          setErr('الفرق كبير — أدخل PIN المدير')
          return
        }
        if ('code' in res && res.code === 'BAD_MANAGER_PIN') {
          setErr('PIN المدير غير صحيح')
          return
        }
        setErr('تعذر إغلاق الشفت')
        return
      }
      if ('summary' in res) setSummary(res.summary as Record<string, number>)
      setSession(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-sm border border-[#808080] bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#808080] bg-[#e8e8e8] px-4 py-2">
          <h2 className="text-sm font-bold text-slate-900">إغلاق الشفت</h2>
          <button
            type="button"
            className="rounded-sm border border-[#888] bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            onClick={onClose}
          >
            إلغاء
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto p-5">

        {summary ? (
          <div className="space-y-2 text-sm">
            <div className="space-y-1 rounded-sm border border-[#808080] bg-white p-4">
              <Row label="الرصيد الافتتاحي" value={summary.opening} />
              <Row label="مبيعات نقدية" value={summary.cashSales} />
              <Row label="مبيعات بطاقة" value={summary.cardSales} />
              <Row label="مصروفات" value={summary.expenses} />
              <Row label="مرتجعات" value={summary.returns} />
              <Row label="المتوقع" value={summary.expected} />
              <Row label="الفعلي" value={summary.actual} />
              <Row label="الفرق" value={summary.variance} strong />
            </div>
            <button
              type="button"
              className="w-full rounded-sm border border-[#0d47a1] bg-[#1e40af] py-3 font-semibold text-white hover:bg-[#172554]"
              onClick={() => {
                setSummary(null)
                onClose()
              }}
            >
              تم
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate-700">
              أدخل النقد الموجود فعليًا في الدرج. سيتم حساب الفرق تلقائيًا.
            </p>
            <label className="block space-y-2">
              <span className="text-sm">النقد الحالي (عدّ يدويًا)</span>
              <input
                type="text"
                inputMode="numeric"
                className="w-full rounded-sm border border-[#888] bg-white px-4 py-3 text-lg"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                autoFocus
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm">ملاحظات</span>
              <textarea
                className="min-h-[80px] w-full rounded-sm border border-[#888] bg-white px-4 py-3"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm">PIN المدير (عند طلب النظام)</span>
              <input
                type="password"
                className="w-full rounded-sm border border-[#888] bg-white px-4 py-3"
                value={managerPin}
                onChange={(e) => setManagerPin(e.target.value)}
              />
            </label>
            {err && <div className="text-sm text-red-600">{err}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full touch-target rounded-sm border border-[#0d47a1] bg-[#1e40af] py-3 font-semibold text-white hover:bg-[#172554] disabled:opacity-60"
            >
              {loading ? 'جاري الإغلاق…' : 'إغلاق الشفت وحفظ النسخة'}
            </button>
          </form>
        )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className={strong ? 'font-bold' : 'font-mono'}>{value.toFixed(2)}</span>
    </div>
  )
}
