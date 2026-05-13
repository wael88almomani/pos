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
    'rounded-sm px-2.5 py-1.5 text-sm font-medium transition whitespace-nowrap',
    active ? 'border border-[#888] bg-white text-slate-900 shadow-sm' : 'text-slate-800 hover:bg-[#e0e0e0]'
  ].join(' ')
}

function railItemClass(active: boolean): string {
  return [
    'flex flex-col items-center gap-1 rounded-sm px-1.5 py-2 text-[10px] font-semibold leading-tight text-center transition border border-transparent',
    active
      ? 'bg-[#bbdefb] text-blue-950 ring-1 ring-[#1976d2]/80 border-[#64b5f6]'
      : 'text-slate-800 hover:bg-[#e8e8e8]'
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
      <div className="h-full flex flex-col min-h-0 bg-[#c4c4c4]">
        <Outlet />
      </div>
    )
  }

  return (
    <div
      className="h-full flex flex-col bg-[#c4c4c4] text-slate-900 print:bg-white"
      onClick={() => setMenuOpen(null)}
    >
      {/* شريط علوي — مطابقة سطح المكتب */}
      <header className="shrink-0 border-b border-[#808080] bg-[#dcdcdc] print:hidden z-30 shadow-[inset_0_1px_0_#f0f0f0]">
        <div className="flex flex-wrap items-center gap-y-2 gap-x-3 px-3 py-2 min-h-[44px]">
          <div className="w-full sm:w-44 shrink-0 flex justify-end sm:justify-end min-w-0 order-1 sm:order-none">
            <div className="font-bold text-slate-900 truncate text-right max-w-full" title={storeName}>
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
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium ${
                  menuOpen === 'file' ? 'bg-white border border-slate-300 shadow' : 'hover:bg-slate-300/60'
                }`}
              >
                <File className="h-3.5 w-3.5 opacity-80" />
                ملف
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
              {menuOpen === 'file' && (
                <div className="absolute end-0 top-full mt-1 z-50 min-w-[11rem] rounded-lg border border-slate-300 bg-white py-1 shadow-lg text-sm text-slate-800">
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
        {/* شريط يمين أيقونات — أول عنصر في RTL يظهر يمين */}
        <aside
          className="w-[4.75rem] sm:w-[5.75rem] shrink-0 flex flex-col items-stretch gap-1 p-1.5 border-s border-[#808080] bg-[#d4d4d4] print:hidden shadow-[inset_1px_0_0_#ececec]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
            {railItems.map((item) => (
              <NavLink
                key={`${item.to}-${item.label}`}
                to={item.to}
                end={item.end}
                className={({ isActive }) => railItemClass(isActive)}
              >
                <item.icon className="h-6 w-6 sm:h-7 sm:w-7 shrink-0 text-[#0d47a1] opacity-90" />
                <span className="break-words hyphens-auto">{item.label}</span>
              </NavLink>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-auto flex flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-[10px] font-bold text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200"
          >
            <LogOut className="h-6 w-6" />
            الخروج
          </button>
          <div className="pt-2 border-t border-slate-200 flex flex-col items-center gap-1 pb-1">
            <div className="h-8 w-8 rounded-full bg-slate-200 border border-slate-300 grid place-items-center text-[10px] font-bold text-slate-700">
              {initialsFrom(user?.displayName)}
            </div>
            <span className="text-[9px] text-center text-slate-600 leading-tight px-0.5">
              المستخدم
              <br />
              <span className="font-semibold text-slate-900">{user?.displayName?.split(' ')[0] ?? '—'}</span>
            </span>
          </div>
        </aside>

        <div className="flex flex-1 min-w-0 min-h-0 flex-col bg-[#d8d8d8]">
          {/* تنقّل سريع للموبايل — نفس عناصر القائمة الكاملة */}
          <nav className="print:hidden flex sm:hidden overflow-x-auto gap-1 px-2 py-1.5 border-b border-[#808080] bg-[#d0d0d0]">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'shrink-0 flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 min-w-[3.5rem] text-[9px] font-semibold',
                    isActive ? 'bg-white shadow border border-slate-300' : 'opacity-90 hover:bg-white/60'
                  ].join(' ')
                }
              >
                <item.icon className="h-4 w-4" />
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
