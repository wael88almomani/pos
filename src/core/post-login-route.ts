import type { AuthUser } from './stores/auth-store'

const REPORT_PERMS = ['reports.read', 'reports.advanced'] as const

function canReports(user: AuthUser): boolean {
  return REPORT_PERMS.some((p) => user.permissions.includes(p))
}

function canPos(user: AuthUser): boolean {
  return user.permissions.includes('pos.sell')
}

/**
 * أين يُوجَّه المستخدم بعد تسجيل الدخول أو زيارة `/`.
 * دور المدير في البذرة: `code === 'admin'` (اسم العرض «مدير») → التقارير إن وُجدت الصلاحية.
 */
export function getPostLoginPath(user: AuthUser): string {
  const isAdminRole = user.roleCode === 'admin'
  if (isAdminRole && canReports(user)) return '/reports'
  if (canPos(user)) return '/pos'
  if (canReports(user)) return '/reports'
  if (user.permissions.includes('product.read') || user.permissions.includes('product.write')) return '/products'
  if (user.permissions.includes('inventory.read') || user.permissions.includes('inventory.write')) return '/inventory'
  if (user.permissions.includes('settings.write')) return '/settings'
  return '/pos'
}
