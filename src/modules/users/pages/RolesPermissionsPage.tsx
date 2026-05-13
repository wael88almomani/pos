import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToastStore } from '../../../core/toast-store'
import { EnterpriseToolbar, enterprisePageRootClass } from '../../shared/EnterpriseToolbar'

type Perm = { id: string; code: string; description: string | null }
type RoleRow = { id: string; name: string; code: string; permissions: string[] }

export function RolesPermissionsPage() {
  const toast = useToastStore((s) => s.push)
  const [perms, setPerms] = useState<Perm[]>([])
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [roleId, setRoleId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [newRoleName, setNewRoleName] = useState('')
  const [dirty, setDirty] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([window.posApi.permissions.list(), window.posApi.users.roles()])
    if (p.ok && 'items' in p) setPerms(p.items as Perm[])
    if (r.ok && 'items' in r) {
      const list = r.items as RoleRow[]
      setRoles(list)
      setRoleId((cur) => cur || list[0]?.id || '')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const active = roles.find((x) => x.id === roleId)

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const map = new Map<string, Perm[]>()
    for (const perm of perms) {
      if (q && !perm.code.toLowerCase().includes(q) && !(perm.description ?? '').toLowerCase().includes(q)) continue
      const prefix = perm.code.split('.')[0] ?? 'other'
      const arr = map.get(prefix) ?? []
      arr.push(perm)
      map.set(prefix, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [perms, search])

  function toggle(code: string) {
    if (!active) return
    const has = active.permissions.includes(code)
    const next = has ? active.permissions.filter((c) => c !== code) : [...active.permissions, code]
    setRoles((rs) => rs.map((r) => (r.id === active.id ? { ...r, permissions: next } : r)))
    setDirty((d) => new Set(d).add(active.id))
  }

  async function saveRole() {
    if (!active) return
    const r = await window.posApi.roles.setPermissions({ roleId: active.id, permissionCodes: active.permissions })
    if (r.ok) {
      toast('تم تحديث الصلاحيات')
      setDirty((d) => {
        const n = new Set(d)
        n.delete(active.id)
        return n
      })
    } else toast('فشل الحفظ', 'err')
  }

  async function createRole() {
    if (!newRoleName.trim()) return
    const r = await window.posApi.roles.create({ name: newRoleName.trim() })
    if (r.ok && 'role' in r) {
      const role = r.role as { id: string }
      setNewRoleName('')
      await load()
      setRoleId(role.id)
      toast('تم إنشاء الدور')
    } else toast('فشل الإنشاء', 'err')
  }

  return (
    <div className={enterprisePageRootClass}>
      <EnterpriseToolbar
        title="الأدوار والصلاحيات"
        subtitle="اختر دورًا وفعّل أو أوقف الصلاحيات، أو أنشئ دورًا جديدًا."
        actions={
          <Link to="/users" className="text-sm text-[#1e40af] hover:underline font-semibold">
            ← المستخدمون
          </Link>
        }
      />

      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-6 max-w-5xl w-full mx-auto">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm space-y-1">
          دور
          <select
            className="block rounded-xl border px-3 py-2 min-w-[200px] bg-transparent"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {active && dirty.has(active.id) && (
          <button
            type="button"
            className="rounded-xl bg-[#1e40af] hover:bg-[#172554] text-white px-4 py-2 text-sm font-semibold"
            onClick={() => void saveRole()}
          >
            حفظ تغييرات الدور
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-300 dark:border-slate-700 p-4 bg-white dark:bg-slate-900 space-y-2">
        <div className="font-semibold text-sm">دور جديد</div>
        <div className="flex gap-2 flex-wrap">
          <input
            className="flex-1 min-w-[200px] rounded-xl border px-3 py-2"
            placeholder="اسم الدور"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
          />
          <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={() => void createRole()}>
            إنشاء
          </button>
        </div>
      </div>

      <input
        className="w-full max-w-md rounded-xl border px-3 py-2 text-sm"
        placeholder="بحث في الصلاحيات…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="space-y-6">
        {grouped.map(([group, list]) => (
          <section key={group} className="rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden">
            <div className="bg-slate-100 dark:bg-slate-800/80 px-4 py-2 font-semibold text-sm">{group}</div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.map((perm) => {
                const on = active?.permissions.includes(perm.code) ?? false
                return (
                  <li key={perm.id} className="flex items-start gap-3 px-4 py-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={on} onChange={() => toggle(perm.code)} />
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-[#1e40af] dark:text-sky-400">{perm.code}</div>
                      <div className="text-slate-600 dark:text-slate-400">{perm.description ?? '—'}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
      </div>
    </div>
  )
}
