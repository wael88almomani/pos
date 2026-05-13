import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutGrid,
  Package,
  Warehouse,
  Truck,
  BarChart3,
  RotateCcw,
  Wallet,
  Settings,
  LogOut,
  Lock,
  DatabaseBackup,
  ShoppingCart,
  Users,
  ScrollText,
  UserCircle,
  File,
  ChevronDown,
  PieChart,
  CircleDollarSign,
  ClipboardList,
  Tag
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { arSA } from 'date-fns/locale'
import { useAuthStore } from '../core/stores/auth-store'
import { CloseShiftModal } from '../modules/shifts/CloseShiftModal'

const USERS_NAV_PERMS = ['users.read', 'users.create', 'users.edit', 'users.delete', 'users.manage'] as const

function initialsFrom(name: string | undefined): string {
  if (!name?.trim()) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return name.trim().slice(0, 2).toUpperCase()
}

const nav = [
  { to: '/pos', label: 'شاشة البيع', icon: LayoutGrid, k: 'F1', anyOf: ['pos.sell'] as const },
  { to: '/inventory', label: 'المخزون', icon: Warehouse, k: '', anyOf: ['inventory.read', 'inventory.write'] as const },
  { to: '/inventory-count', label: 'الجرد', icon: ClipboardList, k: '', anyOf: ['inventory.read', 'inventory.write'] as const },
  { to: '/suppliers', label: 'الموردين', icon: Truck, k: '', anyOf: ['supplier.read', 'supplier.write'] as const },
  {
    to: '/purchases',
    label: 'المشتريات',
    icon: ShoppingCart,
    k: '',
    anyOf: ['purchase.read', 'purchase.write', 'purchase.complete'] as const
  },
  { to: '/reports', label: 'التقارير', icon: BarChart3, k: '', anyOf: ['reports.read', 'reports.advanced'] as const },
  { to: '/promotions', label: 'العروض', icon: Tag, k: '', anyOf: ['promotion.create', 'promotion.edit', 'promotion.delete'] as const },
  { to: '/returns', label: 'المرتجعات', icon: RotateCcw, k: 'F4', anyOf: ['returns.sales', 'returns.purchase'] as const },
  { to: '/expenses', label: 'المصروفات', icon: Wallet, k: '', anyOf: ['expense.read', 'expense.write'] as const },
  { to: '/customers', label: 'العملاء', icon: UserCircle, k: '', anyOf: ['customer.read', 'customer.write'] as const },
  { to: '/receivables', label: 'الذمم', icon: CircleDollarSign, k: '', anyOf: ['customer.read'] as const },
  { to: '/users', label: 'المستخدمون', icon: Users, k: '', anyOf: USERS_NAV_PERMS },
  { to: '/audit', label: 'التدقيق', icon: ScrollText, k: '', anyOf: ['audit.read'] as const },
  { to: '/settings', label: 'الإعدادات', icon: Settings, k: '', anyOf: ['settings.write'] as const }
] as const

type RailItem = {
  to: string
  label: string
  icon: typeof ShoppingCart
  anyOf: readonly string[]
  end?: boolean
}

const railNav: readonly RailItem[] = [
  { to: '/pos', label: 'شاشة البيع', icon: ShoppingCart, anyOf: ['pos.sell'], end: true },
  { to: '/inventory', label: 'المستودعات', icon: Warehouse, anyOf: ['inventory.read', 'inventory.write'] },
  { to: '/reports', label: 'تقرير المبيعات', icon: PieChart, anyOf: ['reports.read', 'reports.advanced'] },
  { to: '/customers', label: 'الزبائن', icon: UserCircle, anyOf: ['customer.read', 'customer.write'] },
  { to: '/receivables', label: 'الذمم', icon: CircleDollarSign, anyOf: ['customer.read'] },
  { to: '/users', label: 'الموظفين', icon: Users, anyOf: USERS_NAV_PERMS },
  { to: '/settings', label: 'إعدادات النظام', icon: Settings, anyOf: ['settings.write'] }
]

function topLinkClass(active: boolean): string {
  return [
    'rounded-lg px-3 py-2 text-sm font-semibold transition-all whitespace-nowrap',
    active ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md ring-2 ring-blue-300' : 'text-slate-700 hover:bg-blue-50 hover:shadow-sm'
  ].join(' ')
}

function railItemClass(active: boolean): string {
  return [
    'flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-semibold leading-tight text-center transition-all border-2',
    active
      ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg border-blue-300'
      : 'text-slate-700 hover:bg-gray-100 hover:shadow-md border-transparent'
  ].join(' ')
}

export function AppShell() {
  const location = useLocation()
  const isPosOnly = location.pathname === '/pos'
  const navi = useNavigate()
  const user = useAuthStore((s) => s.user)
  const canAny = useAuthStore((s) => s.canAny)
  const setUser = useAuthStore((s) => s.setUser)
  const setSession = useAuthStore((s) => s.setSession)
  const [now, setNow] = useState(new Date())
  const [storeName, setStoreName] = useState('المتجر')
  const [closeOpen, setCloseOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    void (async () => {
      const r = await window.posApi.settings.get('store.name')
      if (r.ok && r.value) setStoreName(String(r.value))
    })()
  }, [])

  useEffect(() => {
    setMenuOpen(null)
  }, [location.pathname])

  const navItems = useMemo(() => nav.filter((item) => canAny([...item.anyOf])), [canAny])
  const railItems = useMemo(() => railNav.filter((item) => canAny([...item.anyOf])), [canAny])

  const showWarehouseMenu = canAny(['product.read', 'product.write', 'inventory.read', 'inventory.write'])
  const showMovementsMenu = canAny(['purchase.read', 'purchase.write', 'purchase.complete', 'returns.sales', 'returns.purchase'])
  const showCustomersSuppliers = canAny(['customer.read', 'customer.write', 'supplier.read', 'supplier.write'])
  const showUsersTop = canAny([...USERS_NAV_PERMS])
  const showReportsTop = canAny(['reports.read', 'reports.advanced'])
  const showSettingsTop = canAny(['settings.write'])

  async function logout() {
    await window.posApi.auth.logout()
    setUser(null)
    setSession(null)
    navi('/login', { replace: true })
  }

  if (isPosOnly) {
    return (
      <div className="h-full flex flex-col min-h-0 bg-gray-50">
        <Outlet />
      </div>
    )
  }

  return (
    <div
      className="h-full flex flex-col bg-gray-50 text-slate-900 print:bg-white"
      onClick={() => setMenuOpen(null)}
    >
      {/* شريط علوي — Material Design 3 */}
      <header className="shrink-0 border-b border-gray-200 bg-gradient-to-r from-white to-gray-50 print:hidden z-30 shadow-sm">
        <div className="flex flex-wrap items-center gap-y-2 gap-x-4 px-4 py-2.5 min-h-[50px]">
          <div className="w-full sm:w-48 shrink-0 flex justify-end sm:justify-end min-w-0 order-1 sm:order-none">
            <div className="font-bold text-lg text-blue-700 truncate text-right max-w-full" title={storeName}>
              {storeName}
            </div>
          </div>

          <nav
            className="flex flex-1 min-w-0 justify-center flex-wrap items-center gap-1 text-sm order-3 sm:order-none w-full sm:w-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen((m) => (m === 'file' ? null : 'file'))
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-semibold text-sm transition-all ${
                  menuOpen === 'file' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-700 hover:bg-blue-50 hover:shadow-sm'
                }`}
              >
                <File className="h-3.5 w-3.5 opacity-80" />
                ملف
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
              {menuOpen === 'file' && (
                <div className="absolute end-0 top-full mt-2 z-50 min-w-[12rem] rounded-xl border border-gray-200 bg-white py-2 shadow-xl text-sm text-slate-800">
                  {canAny(['shift.open', 'shift.close']) && (
                    <button
                      type="button"
                      className="w-full text-right px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
                      onClick={() => {
                        setMenuOpen(null)
                        setCloseOpen(true)
                      }}
                    >
                      <Lock className="h-4 w-4 shrink-0" />
                      قفل / إغلاق شفت
                    </button>
                  )}
                  {canAny(['backup.restore']) && (
                    <button
                      type="button"
                      className="w-full text-right px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
                      onClick={() => {
                        setMenuOpen(null)
                        navi('/restore')
                      }}
                    >
                      <DatabaseBackup className="h-4 w-4 shrink-0" />
                      استعادة نسخة
                    </button>
                  )}
                  {canAny(['expense.read', 'expense.write']) && (
                    <NavLink
                      to="/expenses"
                      className="block px-3 py-2 hover:bg-slate-50"
                      onClick={() => setMenuOpen(null)}
                    >
                      المصروفات
                    </NavLink>
                  )}
                  {canAny(['audit.read']) && (
                    <NavLink to="/audit" className="block px-3 py-2 hover:bg-slate-50" onClick={() => setMenuOpen(null)}>
                      التدقيق
                    </NavLink>
                  )}
                  {canAny(['product.read', 'product.write']) && (
                    <NavLink to="/products" className="block px-3 py-2 hover:bg-slate-50" onClick={() => setMenuOpen(null)}>
                      المنتجات
                    </NavLink>
                  )}
                  <button
                    type="button"
                    className="w-full text-right px-3 py-2 text-red-700 hover:bg-red-50 flex items-center gap-2 border-t border-slate-100 mt-1 pt-1"
                    onClick={() => void logout()}
                  >
                    <LogOut className="h-4 w-4" />
                    خروج
                  </button>
                </div>
              )}
            </div>

            {showWarehouseMenu && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen((m) => (m === 'wh' ? null : 'wh'))
                  }}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium ${
                    menuOpen === 'wh' ? 'bg-white border border-slate-300 shadow' : 'hover:bg-slate-300/60'
                  }`}
                >
                  المستودعات
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
                {menuOpen === 'wh' && (
                  <div className="absolute end-0 top-full mt-1 z-50 min-w-[10rem] rounded-lg border border-slate-300 bg-white py-1 shadow-lg text-sm">
                    {canAny(['inventory.read', 'inventory.write']) && (
                      <NavLink to="/inventory" className="block px-3 py-2 hover:bg-slate-50" onClick={() => setMenuOpen(null)}>
                        المخزون
                      </NavLink>
                    )}
                  </div>
                )}
              </div>
            )}

            {showMovementsMenu && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen((m) => (m === 'mv' ? null : 'mv'))
                  }}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium ${
                    menuOpen === 'mv' ? 'bg-white border border-slate-300 shadow' : 'hover:bg-slate-300/60'
                  }`}
                >
                  الحركات
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
                {menuOpen === 'mv' && (
                  <div className="absolute end-0 top-full mt-1 z-50 min-w-[10rem] rounded-lg border border-slate-300 bg-white py-1 shadow-lg text-sm">
                    {canAny(['purchase.read', 'purchase.write', 'purchase.complete']) && (
                      <NavLink to="/purchases" className="block px-3 py-2 hover:bg-slate-50" onClick={() => setMenuOpen(null)}>
                        المشتريات
                      </NavLink>
                    )}
                    {canAny(['returns.sales', 'returns.purchase']) && (
                      <NavLink to="/returns" className="block px-3 py-2 hover:bg-slate-50" onClick={() => setMenuOpen(null)}>
                        المرتجعات
                      </NavLink>
                    )}
                  </div>
                )}
              </div>
            )}

            {showUsersTop && (
              <NavLink to="/users" className={({ isActive }) => topLinkClass(isActive)} onClick={() => setMenuOpen(null)}>
                إدارة المستخدمين
              </NavLink>
            )}

            {showCustomersSuppliers && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen((m) => (m === 'cs' ? null : 'cs'))
                  }}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium ${
                    menuOpen === 'cs' ? 'bg-white border border-slate-300 shadow' : 'hover:bg-slate-300/60'
                  }`}
                >
                  الزبائن والموردين
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
                {menuOpen === 'cs' && (
                  <div className="absolute end-0 top-full mt-1 z-50 min-w-[10rem] rounded-lg border border-slate-300 bg-white py-1 shadow-lg text-sm">
                    {canAny(['customer.read', 'customer.write']) && (
                      <NavLink to="/customers" className="block px-3 py-2 hover:bg-slate-50" onClick={() => setMenuOpen(null)}>
                        الزبائن
                      </NavLink>
                    )}
                    {canAny(['customer.read']) && (
                      <NavLink to="/receivables" className="block px-3 py-2 hover:bg-slate-50" onClick={() => setMenuOpen(null)}>
                        ذمم الزبائن
                      </NavLink>
                    )}
                    {canAny(['supplier.read', 'supplier.write']) && (
                      <NavLink to="/suppliers" className="block px-3 py-2 hover:bg-slate-50" onClick={() => setMenuOpen(null)}>
                        الموردين
                      </NavLink>
                    )}
                  </div>
                )}
              </div>
            )}

            {showReportsTop && (
              <NavLink to="/reports" className={({ isActive }) => topLinkClass(isActive)} onClick={() => setMenuOpen(null)}>
                التقارير
              </NavLink>
            )}

            {showSettingsTop && (
              <NavLink to="/settings" className={({ isActive }) => topLinkClass(isActive)} onClick={() => setMenuOpen(null)}>
                الإعدادات
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-2 shrink-0 justify-end w-full sm:w-auto sm:ms-auto order-2 sm:order-none">
            <span className="rounded-sm border border-[#1b5e20] bg-[#2e7d32] text-white text-[11px] sm:text-xs px-2 py-0.5 font-semibold whitespace-nowrap">
              {user?.role ?? '—'}
            </span>
            <span className="font-mono text-xs sm:text-sm tabular-nums text-slate-800">
              {format(now, 'hh:mm:ss a', { locale: arSA })}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 min-w-0">
        {/* شريط يمين أيقونات — Material Design 3 */}
        <aside
          className="w-[5rem] sm:w-[6rem] shrink-0 flex flex-col items-stretch gap-2 p-2 border-s border-gray-200 bg-white print:hidden shadow-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto">
            {railItems.map((item) => (
              <NavLink
                key={`${item.to}-${item.label}`}
                to={item.to}
                end={item.end}
                className={({ isActive }) => railItemClass(isActive)}
              >
                <item.icon className="h-6 w-6 sm:h-7 sm:w-7 shrink-0" />
                <span className="break-words hyphens-auto">{item.label}</span>
              </NavLink>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-auto flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-bold text-red-600 hover:bg-red-50 border-2 border-transparent hover:border-red-200 transition-all shadow-sm"
          >
            <LogOut className="h-6 w-6" />
            الخروج
          </button>
          <div className="pt-2 border-t border-gray-200 flex flex-col items-center gap-1.5 pb-1">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 border-2 border-blue-300 grid place-items-center text-xs font-bold text-blue-700 shadow-sm">
              {initialsFrom(user?.displayName)}
            </div>
            <span className="text-[10px] text-center text-slate-600 leading-tight px-0.5">
              المستخدم
              <br />
              <span className="font-semibold text-slate-900">{user?.displayName?.split(' ')[0] ?? '—'}</span>
            </span>
          </div>
        </aside>

        <div className="flex flex-1 min-w-0 min-h-0 flex-col bg-gray-50">
          {/* تنقّل سريع للموبايل */}
          <nav className="print:hidden flex sm:hidden overflow-x-auto gap-1.5 px-2 py-2 border-b border-gray-200 bg-white shadow-sm">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'shrink-0 flex flex-col items-center gap-1 rounded-xl px-3 py-2 min-w-[4rem] text-[10px] font-semibold transition-all',
                    isActive ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md' : 'text-slate-700 hover:bg-blue-50 hover:shadow-sm'
                  ].join(' ')
                }
              >
                <item.icon className="h-5 w-5" />
                <span className="text-center leading-tight">{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <main className="flex-1 min-h-0 min-w-0 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>

      {closeOpen && <CloseShiftModal onClose={() => setCloseOpen(false)} />}
    </div>
  )
}
