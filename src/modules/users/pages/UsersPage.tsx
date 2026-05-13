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
    <div className="flex h-screen flex-col overflow-hidden bg-[#d0d0d0]">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 shadow">
        <h1 className="text-lg font-black text-[#1a1a1a]">المستخدمون</h1>
        <CanAny perms={['users.manage']}>
          <Link
            to="/users/roles"
            className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-3 py-1 text-sm font-bold shadow hover:from-[#f5f5f5]"
          >
            الأدوار والصلاحيات
          </Link>
        </CanAny>
      </div>

      {/* المحتوى */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        <CanAny perms={['users.create', 'users.manage']}>
          <div className="border-2 border-[#808080] bg-white p-4 shadow">
            <h2 className="mb-3 border-b border-slate-300 pb-2 text-sm font-black">مستخدم جديد</h2>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-sm font-bold">اسم المستخدم</label>
                <input
                  className="w-full border border-slate-400 bg-white px-2 py-1.5 shadow-inner"
                  placeholder="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold">الاسم الظاهر</label>
                <input
                  className="w-full border border-slate-400 bg-white px-2 py-1.5 shadow-inner"
                  placeholder="الاسم الظاهر"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold">PIN</label>
                <input
                  className="w-full border border-slate-400 bg-white px-2 py-1.5 font-mono shadow-inner"
                  type="password"
                  placeholder="PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold">الدور</label>
                <select
                  className="w-full border border-slate-400 bg-white px-2 py-1.5 shadow-inner"
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
                className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-4 py-1.5 text-sm font-black text-black shadow"
                onClick={() => void saveNew()}
              >
                حفظ
              </button>
            </div>
          </div>
        </CanAny>

        {edit && (
          <div className="border-2 border-[#808080] bg-[#ffe] p-4 shadow">
            <h2 className="mb-3 border-b border-slate-300 pb-2 text-sm font-black">تعديل: {edit.username}</h2>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-sm font-bold">الاسم الظاهر</label>
                <input
                  className="w-full border border-slate-400 bg-white px-2 py-1.5 shadow-inner"
                  value={edit.displayName}
                  onChange={(e) => setEdit({ ...edit, displayName: e.target.value })}
                  placeholder="الاسم الظاهر"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold">اسم المستخدم</label>
                <input
                  className="w-full border border-slate-400 bg-white px-2 py-1.5 shadow-inner"
                  value={edit.username}
                  onChange={(e) => setEdit({ ...edit, username: e.target.value })}
                  placeholder="username"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold">الدور</label>
                <select
                  className="w-full border border-slate-400 bg-white px-2 py-1.5 shadow-inner"
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
                <label className="mb-1 block text-sm font-bold">PIN جديد (اختياري)</label>
                <input
                  className="w-full border border-slate-400 bg-white px-2 py-1.5 font-mono shadow-inner"
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
                    className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-3 py-1 text-sm font-bold shadow"
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
                  className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-3 py-1 text-sm font-black text-black shadow"
                  onClick={() => void saveEdit()}
                >
                  حفظ التعديل
                </button>
                <button
                  type="button"
                  className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-3 py-1 text-sm font-bold shadow"
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

        <div className="border-2 border-[#808080] bg-white shadow">
          <div className="border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 text-sm font-black">
            قائمة المستخدمين
          </div>
          <ul className="text-sm divide-y divide-slate-200">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-[#f5f5f5]">
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
                      className="text-xs border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-2 py-0.5 font-bold shadow"
                      onClick={() => nav(`/users/${u.id}/permissions`)}
                    >
                      صلاحيات
                    </button>
                  </CanAny>
                  <CanAny perms={['users.edit', 'users.manage']}>
                    <button
                      type="button"
                      className="text-xs border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-2 py-0.5 font-bold shadow"
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
                      className="text-xs border border-red-400 bg-gradient-to-b from-[#fdd] to-[#fbb] px-2 py-0.5 font-bold text-red-800 shadow disabled:opacity-40"
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
