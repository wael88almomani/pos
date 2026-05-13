import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuthStore } from '../../../core/stores/auth-store'
import { useToastStore } from '../../../core/toast-store'
import { EnterpriseToolbar, enterprisePageRootClass } from '../../shared/EnterpriseToolbar'

type Perm = { id: string; code: string; description: string | null }

export function UserPermissionsPage() {
  const { userId } = useParams<{ userId: string }>()
  const toast = useToastStore((s) => s.push)
  const setUser = useAuthStore((s) => s.setUser)
  const myId = useAuthStore((s) => s.user?.id)

  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [roleName, setRoleName] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [roleCodes, setRoleCodes] = useState<string[]>([])
  const [allPerms, setAllPerms] = useState<Perm[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const r = await window.posApi.users.permissionState(userId)
    if (!r.ok || !('allPermissions' in r)) {
      toast('تعذر تحميل الصلاحيات', 'err')
      setLoading(false)
      return
    }
    setUsername(r.username as string)
    setDisplayName(r.displayName as string)
    setRoleName(r.roleName as string)
    setUseCustom(Boolean(r.useCustomPermissions))
    setRoleCodes(r.rolePermissionCodes as string[])
    setAllPerms(r.allPermissions as Perm[])
    const codes = (r.useCustomPermissions ? r.customPermissionCodes : r.rolePermissionCodes) as string[]
    setSelected(new Set(codes as string[]))
    setLoading(false)
  }, [userId, toast])

  useEffect(() => {
    void load()
  }, [load])

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const map = new Map<string, Perm[]>()
    for (const perm of allPerms) {
      if (q && !perm.code.toLowerCase().includes(q) && !(perm.description ?? '').toLowerCase().includes(q)) continue
      const prefix = perm.code.split('.')[0] ?? 'other'
      const arr = map.get(prefix) ?? []
      arr.push(perm)
      map.set(prefix, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [allPerms, search])

  function toggle(code: string) {
    if (!useCustom) return
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(code)) n.delete(code)
      else n.add(code)
      return n
    })
  }

  async function save() {
    if (!userId) return
    const r = await window.posApi.users.setPermissionState({
      userId,
      useCustomPermissions: useCustom,
      permissionCodes: useCustom ? [...selected] : []
    })
    if (!r.ok) {
      toast('تعذر حفظ الصلاحيات', 'err')
      return
    }
    toast('تم حفظ الصلاحيات')
    if (userId === myId) {
      const me = await window.posApi.auth.me()
      if (me.ok && 'user' in me) setUser(me.user as never)
    }
    void load()
  }

  if (!userId) {
    return (
      <div className={enterprisePageRootClass}>
        <EnterpriseToolbar title="صلاحيات المستخدم" subtitle="لم يُحدَّد مستخدم." />
        <div className="p-4">
          <Link to="/users" className="text-[#1e40af] text-sm font-semibold hover:underline">
            ← المستخدمون
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={enterprisePageRootClass}>
        <EnterpriseToolbar title="صلاحيات المستخدم" subtitle="جاري التحميل…" />
        <div className="flex-1 grid place-items-center text-slate-500">جاري التحميل…</div>
      </div>
    )
  }

  return (
    <div className={enterprisePageRootClass}>
      <EnterpriseToolbar
        title="صلاحيات المستخدم"
        subtitle={`${displayName} (${username}) — الدور: ${roleName}`}
        actions={
          <>
            <Link to="/users" className="text-sm text-[#1e40af] hover:underline font-semibold">
              ← المستخدمون
            </Link>
            <button
              type="button"
              className="rounded-xl bg-[#1e40af] hover:bg-[#172554] text-white px-4 py-2 text-sm font-semibold"
              onClick={() => void save()}
            >
              حفظ
            </button>
          </>
        }
      />

      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-6 max-w-5xl w-full mx-auto">

      <label className="flex items-start gap-3 rounded-xl border border-slate-300 dark:border-slate-700 p-4 cursor-pointer bg-white dark:bg-slate-900">
        <input
          type="checkbox"
          className="mt-1"
          checked={useCustom}
          onChange={(e) => {
            const on = e.target.checked
            setUseCustom(on)
            if (on) setSelected(new Set(roleCodes))
            else setSelected(new Set(roleCodes))
          }}
        />
        <div>
          <div className="font-semibold">صلاحيات مخصّصة لهذا المستخدم</div>
          <p className="text-xs text-slate-500 mt-1">
            عند التفعيل تُستخدم القائمة أدناه فقط (وليس صلاحيات الدور). عند الإيقاف يعود المستخدم لصلاحيات الدور «{roleName}».
          </p>
        </div>
      </label>

      <div className="rounded-xl border border-slate-300 dark:border-slate-700 p-4 space-y-3 bg-white dark:bg-slate-900">
        <input
          className="w-full rounded-xl border px-3 py-2 text-sm"
          placeholder="بحث في رمز أو وصف الصلاحية…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-6">
        {grouped.map(([prefix, list]) => (
          <div key={prefix} className="rounded-xl border border-slate-300 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
            <div className="font-semibold text-sm text-slate-600 dark:text-slate-300 mb-3">{prefix}</div>
            <ul className="grid sm:grid-cols-2 gap-2 text-sm">
              {list.map((p) => (
                <li key={p.id}>
                  <label
                    className={`flex items-start gap-2 rounded-lg border border-slate-100 dark:border-slate-800 p-2 ${
                      useCustom ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60' : 'opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={selected.has(p.code)}
                      disabled={!useCustom}
                      onChange={() => toggle(p.code)}
                    />
                    <span>
                      <span className="font-mono text-xs block">{p.code}</span>
                      {p.description && <span className="text-xs text-slate-500">{p.description}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      </div>
    </div>
  )
}
