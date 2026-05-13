import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CanAny } from '../../../core/Can'
import { useAuthStore } from '../../../core/stores/auth-store'
import { useToastStore } from '../../../core/toast-store'

type UserRow = {
  id: string
  username: string
  displayName: string
  roleId: string
  roleName: string
  isActive: boolean
  useCustomPermissions?: boolean
}

const VIEW_PERMS = ['users.read', 'users.create', 'users.edit', 'users.delete', 'users.manage'] as const

export function UsersPage() {
  const nav = useNavigate()
  const toast = useToastStore((s) => s.push)
  const myId = useAuthStore((s) => s.user?.id)
  const canAny = useAuthStore((s) => s.canAny)
  const canView = useMemo(() => canAny([...VIEW_PERMS]), [canAny])

  const [users, setUsers] = useState<UserRow[]>([])
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([])
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pin, setPin] = useState('')
  const [roleId, setRoleId] = useState('')
  const [edit, setEdit] = useState<UserRow | null>(null)
  const [editPin, setEditPin] = useState('')

  const load = useCallback(async () => {
    if (!canView) return
    const [u, r] = await Promise.all([window.posApi.users.list(), window.posApi.users.roles()])
    if (u.ok && 'items' in u) setUsers(u.items as UserRow[])
    else if (!u.ok) toast('تعذر تحميل المستخدمين', 'err')
    if (r.ok && 'items' in r) setRoles((r.items as { id: string; name: string }[]).map((x) => ({ id: x.id, name: x.name })))
  }, [canView, toast])

  useEffect(() => {
    void load()
  }, [load])

  async function saveNew() {
    const r = await window.posApi.users.save({ username, displayName, pin, roleId })
    if (r.ok) {
      toast('تم إنشاء المستخدم')
      setUsername('')
      setDisplayName('')
      setPin('')
      void load()
    } else toast('فشل الإنشاء', 'err')
  }

  async function saveEdit() {
    if (!edit) return
    const r = await window.posApi.users.save({
      id: edit.id,
      username: edit.username,
      displayName: edit.displayName,
      roleId: edit.roleId,
      isActive: edit.isActive,
      ...(editPin.trim() ? { pin: editPin.trim() } : {})
    })
    if (r.ok) {
      toast('تم حفظ التعديلات')
      setEdit(null)
      setEditPin('')
      void load()
    } else toast('فشل التعديل', 'err')
  }

  async function removeUser(id: string) {
    if (!window.confirm('حذف هذا المستخدم؟ (سيتم إخفاؤه من النظام)')) return
    const r = await window.posApi.users.delete(id)
    if (r.ok) {
      toast('تم الحذف')
      if (edit?.id === id) {
        setEdit(null)
        setEditPin('')
      }
      void load()
    } else toast('فشل الحذف', 'err')
  }

  if (!canView) {
    return (
      <div className="h-full overflow-auto p-6">
        <p className="text-slate-600">ليس لديك صلاحية لعرض أو إدارة المستخدمين.</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-white to-gray-50 px-4 py-3 shadow-sm">
        <h1 className="text-xl font-bold text-blue-700">المستخدمون</h1>
        <CanAny perms={['users.manage']}>
          <Link
            to="/users/roles"
            className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
          >
            الأدوار والصلاحيات
          </Link>
        </CanAny>
      </div>

      {/* المحتوى */}
      <div className="flex-1 overflow-auto space-y-4 p-4">
        <CanAny perms={['users.create', 'users.manage']}>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
            <h2 className="mb-3 border-b border-gray-200 pb-2 text-sm font-bold text-slate-700">مستخدم جديد</h2>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">اسم المستخدم</label>
                <input
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  placeholder="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">الاسم الظاهر</label>
                <input
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  placeholder="الاسم الظاهر"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">PIN</label>
                <input
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 font-mono text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  type="password"
                  placeholder="PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">الدور</label>
                <select
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                >
                  <option value="">— اختر دور —</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg active:scale-95"
                onClick={() => void saveNew()}
              >
                حفظ
              </button>
            </div>
          </div>
        </CanAny>

        {edit && (
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-4 shadow-lg">
            <h2 className="mb-3 border-b border-amber-200 pb-2 text-sm font-bold text-amber-800">تعديل: {edit.username}</h2>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">الاسم الظاهر</label>
                <input
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  value={edit.displayName}
                  onChange={(e) => setEdit({ ...edit, displayName: e.target.value })}
                  placeholder="الاسم الظاهر"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">اسم المستخدم</label>
                <input
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  value={edit.username}
                  onChange={(e) => setEdit({ ...edit, username: e.target.value })}
                  placeholder="username"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">الدور</label>
                <select
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  value={edit.roleId}
                  onChange={(e) => setEdit({ ...edit, roleId: e.target.value })}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />
                نشط
              </label>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">PIN جديد (اختياري)</label>
                <input
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 font-mono text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  type="password"
                  placeholder="PIN جديد"
                  value={editPin}
                  onChange={(e) => setEditPin(e.target.value)}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <CanAny perms={['users.edit', 'users.manage']}>
                  <button
                    type="button"
                    className="rounded-lg border-2 border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                    onClick={() => {
                      nav(`/users/${edit.id}/permissions`)
                      setEdit(null)
                      setEditPin('')
                    }}
                  >
                    شاشة الصلاحيات…
                  </button>
                </CanAny>
                <button
                  type="button"
                  className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg active:scale-95"
                  onClick={() => void saveEdit()}
                >
                  حفظ التعديل
                </button>
                <button
                  type="button"
                  className="rounded-lg border-2 border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                  onClick={() => {
                    setEdit(null)
                    setEditPin('')
                  }}
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 px-3 py-2 text-sm font-bold text-slate-700">
            قائمة المستخدمين
          </div>
          <ul className="text-sm divide-y divide-slate-200">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-blue-50 transition-colors">
                <span>
                  <strong>{u.displayName}</strong>{' '}
                  <span className="text-slate-500">({u.username})</span>
                  {u.useCustomPermissions && (
                    <span className="text-[10px] border border-indigo-400 bg-indigo-50 text-indigo-700 px-1.5 py-0.5 mr-1">
                      صلاحيات مخصّصة
                    </span>
                  )}
                  {!u.isActive && <span className="text-xs text-amber-700 mr-2 font-bold">معطّل</span>}
                </span>
                <span className="text-slate-500">{u.roleName}</span>
                <div className="flex gap-1 flex-wrap">
                  <CanAny perms={['users.edit', 'users.manage']}>
                    <button
                      type="button"
                      className="rounded-lg border-2 border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
                      onClick={() => nav(`/users/${u.id}/permissions`)}
                    >
                      صلاحيات
                    </button>
                  </CanAny>
                  <CanAny perms={['users.edit', 'users.manage']}>
                    <button
                      type="button"
                      className="rounded-lg border-2 border-blue-300 bg-gradient-to-br from-blue-500 to-blue-600 px-2 py-1 text-xs font-semibold text-white shadow-sm transition-all hover:shadow-md active:scale-95"
                      onClick={() => {
                        setEdit(u)
                        setEditPin('')
                      }}
                    >
                      تعديل
                    </button>
                  </CanAny>
                  <CanAny perms={['users.delete', 'users.manage']}>
                    <button
                      type="button"
                      className="rounded-lg bg-gradient-to-br from-red-500 to-red-600 px-2 py-1 text-xs font-semibold text-white shadow-sm transition-all hover:shadow-md active:scale-95 disabled:opacity-40"
                      disabled={u.id === myId}
                      title={u.id === myId ? 'لا يمكن حذف المستخدم الحالي' : undefined}
                      onClick={() => void removeUser(u.id)}
                    >
                      حذف
                    </button>
                  </CanAny>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
