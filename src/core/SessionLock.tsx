import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from './stores/auth-store'
import { useToastStore } from './toast-store'

export function SessionLock() {
  const user = useAuthStore((s) => s.user)
  const [locked, setLocked] = useState(false)
  const [pin, setPin] = useState('')
  const idleMs = useRef(30 * 60 * 1000)
  const last = useRef(Date.now())

  const reset = useCallback(() => {
    last.current = Date.now()
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const r = await window.posApi.settings.get('session.timeout_minutes')
      if (!cancelled && r.ok && r.value) idleMs.current = Math.max(5, Number(r.value)) * 60 * 1000
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    const tick = setInterval(() => {
      if (Date.now() - last.current > idleMs.current) setLocked(true)
    }, 5000)
    const ev = () => reset()
    window.addEventListener('mousemove', ev)
    window.addEventListener('keydown', ev)
    window.addEventListener('click', ev)
    return () => {
      clearInterval(tick)
      window.removeEventListener('mousemove', ev)
      window.removeEventListener('keydown', ev)
      window.removeEventListener('click', ev)
    }
  }, [user, reset])

  async function unlock() {
    const r = await window.posApi.auth.verifyPin(pin)
    if (r.ok) {
      setLocked(false)
      setPin('')
      reset()
      useToastStore.getState().push('تم فتح القفل')
    } else {
      useToastStore.getState().push('PIN غير صحيح', 'err')
    }
  }

  if (!user || !locked) return null

  return (
    <div className="fixed inset-0 z-[300] bg-slate-950/90 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 text-center">
        <h2 className="text-lg font-bold">الجلسة مقفلة</h2>
        <p className="text-sm text-slate-500">أدخل PIN لفتح القفل</p>
        <input
          type="password"
          className="w-full rounded-xl border px-3 py-3 text-center font-mono"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        <button
          type="button"
          className="w-full rounded-sm border border-[#1b5e20] bg-[#2e7d32] py-3 font-semibold text-white hover:bg-[#388e3c]"
          onClick={() => void unlock()}
        >
          فتح
        </button>
      </div>
    </div>
  )
}
