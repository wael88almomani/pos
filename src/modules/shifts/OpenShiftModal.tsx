import { useState } from 'react'
import { CURRENCY_LABEL } from '../../core/currency'
import { useAuthStore } from '../../core/stores/auth-store'

export function OpenShiftModal() {
  const setSession = useAuthStore((s) => s.setSession)
  const [opening, setOpening] = useState('0')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const v = Number(opening)
    if (Number.isNaN(v) || v < 0) {
      setErr('أدخل رصيدًا صالحًا')
      return
    }
    setLoading(true)
    try {
      const dev = await window.posApi.device.getId()
      const deviceId = dev.ok && 'deviceId' in dev ? (dev.deviceId as string) : 'desktop-1'
      const res = await window.posApi.session.open(v, deviceId)
      if (!res.ok) {
        const msg =
          'message' in res && typeof (res as { message?: string }).message === 'string'
            ? (res as { message: string }).message
            : 'تعذر فتح الشفت'
        setErr(msg)
        return
      }
      const cur = await window.posApi.session.current()
      if (cur.ok && cur.session) {
        setSession(cur.session)
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md overflow-hidden rounded-sm border border-[#808080] bg-white shadow-2xl">
        <div className="border-b border-[#808080] bg-[#e8e8e8] px-4 py-2">
          <h2 className="text-sm font-bold text-slate-900">فتح شفت — الرصيد الافتتاحي</h2>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm leading-relaxed text-slate-700">
            لا يمكن استخدام شاشة البيع بدون شفت مفتوح. أدخل النقد الموجود في الدرج عند بداية الشفت.
          </p>
          <form onSubmit={submit} className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-800">الرصيد الافتتاحي ({CURRENCY_LABEL})</span>
              <input
                inputMode="decimal"
                className="w-full rounded-sm border border-[#888] bg-white px-4 py-3 font-mono text-lg tabular-nums"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
              />
            </label>
            {err && <div className="text-sm text-red-600">{err}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full touch-target rounded-sm border border-[#0d47a1] bg-[#1e40af] py-3 font-semibold text-white hover:bg-[#172554] disabled:opacity-60"
            >
              {loading ? 'جاري الحفظ…' : 'تأكيد فتح الشفت'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
