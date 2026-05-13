import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AuthUser } from '../../core/stores/auth-store'
import { useAuthStore } from '../../core/stores/auth-store'
import { getPostLoginPath } from '../../core/post-login-route'

export function LoginPage() {
  const nav = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [usernames, setUsernames] = useState<string[]>([])
  const pinRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user) nav(getPostLoginPath(user), { replace: true })
  }, [user, nav])

  useEffect(() => {
    void (async () => {
      const r = await window.posApi.auth.usernames()
      if (r.ok && 'items' in r) {
        const list = r.items as string[]
        setUsernames(list)
        setUsername((u) => (u ? u : list[0] ?? ''))
      }
    })()
  }, [])

  /** تركيز المؤشر على PIN مباشرة (لوحة مفاتيح / قارئ باركود) */
  useEffect(() => {
    const id = window.setTimeout(() => {
      pinRef.current?.focus({ preventScroll: true })
    }, 0)
    return () => clearTimeout(id)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!window.posApi?.auth?.login) {
      setErr('لم يُحمّل جسر التطبيق (preload). أعد تشغيل البرنامج.')
      return
    }
    setLoading(true)
    try {
      const res = await window.posApi.auth.login(username.trim(), pin.trim())
      if (!res.ok || !('user' in res)) {
        const msg =
          'error' in res && typeof (res as { error?: string }).error === 'string'
            ? (res as { error: string }).error
            : 'message' in res && typeof (res as { message?: string }).message === 'string'
              ? (res as { message: string }).message
              : 'بيانات الدخول غير صحيحة'
        setErr(msg)
        window.setTimeout(() => pinRef.current?.focus({ preventScroll: true }), 0)
        return
      }
      const nextUser = res.user as AuthUser
      setUser(nextUser)
      nav(getPostLoginPath(nextUser), { replace: true })
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : String(ex)
      setErr(`تعذر الاتصال: ${msg}`)
      window.setTimeout(() => pinRef.current?.focus({ preventScroll: true }), 0)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-[#c4c4c4] p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-6 rounded-sm border border-[#808080] bg-white p-8 shadow-md"
      >
        <div className="text-center space-y-2">
          <div className="text-xs font-semibold tracking-wide text-[#1e40af]">OFFLINE POS</div>
          <h1 className="text-2xl font-bold text-slate-900">تسجيل الدخول</h1>
          <p className="text-sm text-slate-600">مدير افتراضي: admin / 1234</p>
        </div>
        <label className="block space-y-2">
          <span className="text-sm text-slate-700">اسم المستخدم</span>
          {usernames.length > 0 ? (
            <select
              className="w-full rounded-sm border border-[#888] bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-[#1e40af]/40"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            >
              {usernames.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="w-full rounded-sm border border-[#888] bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-[#1e40af]/40"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
            />
          )}
        </label>
        <label className="block space-y-2">
          <span className="text-sm text-slate-700">رمز PIN</span>
          <input
            ref={pinRef}
            id="login-pin"
            type="password"
            className="w-full rounded-sm border border-[#888] bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-[#1e40af]/40"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoComplete="current-password"
            autoFocus
          />
        </label>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button
          type="submit"
          disabled={loading}
          className="w-full touch-target rounded-sm border border-[#0d47a1] bg-[#1e40af] py-2.5 font-semibold text-white transition hover:bg-[#172554] active:scale-[0.99] disabled:opacity-60"
        >
          {loading ? 'جاري الدخول…' : 'دخول'}
        </button>
      </form>
    </div>
  )
}
