import { getPrisma } from './database'

/** صلاحيات المستخدم الفعلية (دور أو صلاحيات مخصّصة) */
export async function getEffectivePermissionCodesForUser(userId: string): Promise<string[]> {
  const u = await getPrisma().user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      userPermissions: { include: { permission: true } }
    }
  })
  if (!u?.role) return []
  if (u.useCustomPermissions) {
    return u.userPermissions.map((x) => x.permission.code)
  }
  return u.role.permissions.map((rp) => rp.permission.code)
}
