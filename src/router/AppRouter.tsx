import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../core/stores/auth-store'
import { LoginPage } from '../modules/auth/LoginPage'
import { AppShell } from '../layout/AppShell'
import { PosPage } from '../modules/pos/pages/PosPage'
import { ProductsPage } from '../modules/inventory/pages/ProductsPage'
import { InventoryPage } from '../modules/inventory/pages/InventoryPage'
import { InventoryCountPage } from '../modules/inventory/pages/InventoryCountPage'
import { SuppliersPage } from '../modules/suppliers/pages/SuppliersPage'
import { PurchasesPage } from '../modules/purchases/pages/PurchasesPage'
import { ReturnsPage } from '../modules/returns/pages/ReturnsPage'
import { ExpensesModulePage } from '../modules/expenses/pages/ExpensesModulePage'
import { CustomersPage } from '../modules/customers/pages/CustomersPage'
import { ReceivablesPage } from '../modules/receivables/pages/ReceivablesPage'
import { UsersPage } from '../modules/users/pages/UsersPage'
import { AuditPage } from '../modules/audit/pages/AuditPage'
import { ReportsPage } from '../modules/reports/pages/ReportsPage'
import { SettingsPage } from '../modules/settings/pages/SettingsPage'
import { HardwareSettingsPage } from '../modules/settings/pages/HardwareSettingsPage'
import { DiagnosticsPage } from '../modules/settings/pages/DiagnosticsPage'
import { PromotionsPage } from '../modules/promotions/pages/PromotionsPage'
import { RolesPermissionsPage } from '../modules/users/pages/RolesPermissionsPage'
import { RestorePage } from '../modules/settings/pages/RestorePage'
import { OpenShiftModal } from '../modules/shifts/OpenShiftModal'
import { RequireRoutePerm } from '../core/RequireRoutePerm'
import { UserPermissionsPage } from '../modules/users/pages/UserPermissionsPage'
import { getPostLoginPath } from '../core/post-login-route'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const loc = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <>{children}</>
}

/** بعد الدخول أو طلب `/` — المدير (admin) يذهب للتقارير افتراضيًا */
function LoggedInHomeRedirect() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={getPostLoginPath(user)} replace />
}

function BootSession({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const session = useAuthStore((s) => s.session)
  const setSession = useAuthStore((s) => s.setSession)
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    if (!user) {
      setBooted(true)
      return
    }
    let alive = true
    ;(async () => {
      const res = await window.posApi.session.current()
      if (!alive) return
      if (res.ok && res.session) setSession(res.session)
      else setSession(null)
      setBooted(true)
    })()
    return () => {
      alive = false
    }
  }, [user, setSession])

  const needShift = Boolean(booted && user && !session)

  if (!user || !booted) return null

  return (
    <>
      {needShift && <OpenShiftModal />}
      {children}
    </>
  )
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <BootSession>
              <AppShell />
            </BootSession>
          </RequireAuth>
        }
      >
        <Route path="/" element={<LoggedInHomeRedirect />} />
        <Route
          path="/pos"
          element={
            <RequireRoutePerm anyOf={['pos.sell']}>
              <PosPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/products"
          element={
            <RequireRoutePerm anyOf={['product.read', 'product.write']}>
              <ProductsPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/inventory"
          element={
            <RequireRoutePerm anyOf={['inventory.read', 'inventory.write']}>
              <InventoryPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/inventory-count"
          element={
            <RequireRoutePerm anyOf={['inventory.read', 'inventory.write']}>
              <InventoryCountPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/suppliers"
          element={
            <RequireRoutePerm anyOf={['supplier.read', 'supplier.write']}>
              <SuppliersPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/purchases"
          element={
            <RequireRoutePerm anyOf={['purchase.read', 'purchase.write', 'purchase.complete']}>
              <PurchasesPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/reports"
          element={
            <RequireRoutePerm anyOf={['reports.read', 'reports.advanced']}>
              <ReportsPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/returns"
          element={
            <RequireRoutePerm anyOf={['returns.sales', 'returns.purchase']}>
              <ReturnsPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/expenses"
          element={
            <RequireRoutePerm anyOf={['expense.read', 'expense.write']}>
              <ExpensesModulePage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/customers"
          element={
            <RequireRoutePerm anyOf={['customer.read', 'customer.write']}>
              <CustomersPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/receivables"
          element={
            <RequireRoutePerm anyOf={['customer.read']}>
              <ReceivablesPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/users"
          element={
            <RequireRoutePerm anyOf={['users.read', 'users.create', 'users.edit', 'users.delete', 'users.manage']}>
              <UsersPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/audit"
          element={
            <RequireRoutePerm anyOf={['audit.read']}>
              <AuditPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireRoutePerm anyOf={['settings.write']}>
              <SettingsPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/settings/hardware"
          element={
            <RequireRoutePerm anyOf={['settings.write']}>
              <HardwareSettingsPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/settings/diagnostics"
          element={
            <RequireRoutePerm anyOf={['settings.write']}>
              <DiagnosticsPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/promotions"
          element={
            <RequireRoutePerm anyOf={['promotion.create', 'promotion.edit', 'promotion.delete']}>
              <PromotionsPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/users/roles"
          element={
            <RequireRoutePerm anyOf={['users.manage']}>
              <RolesPermissionsPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/users/:userId/permissions"
          element={
            <RequireRoutePerm anyOf={['users.edit', 'users.manage']}>
              <UserPermissionsPage />
            </RequireRoutePerm>
          }
        />
        <Route
          path="/restore"
          element={
            <RequireRoutePerm anyOf={['backup.restore']}>
              <RestorePage />
            </RequireRoutePerm>
          }
        />
      </Route>
      <Route
        path="*"
        element={
          <RequireAuth>
            <LoggedInHomeRedirect />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
