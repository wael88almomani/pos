import { useAuthStore } from './stores/auth-store'

export function Can({ perm, children }: { perm: string; children: React.ReactNode }) {
  const ok = useAuthStore((s) => s.can(perm))
  if (!ok) return null
  return <>{children}</>
}

export function CanAny({ perms, children }: { perms: string[]; children: React.ReactNode }) {
  const ok = useAuthStore((s) => s.canAny(perms))
  if (!ok) return null
  return <>{children}</>
}
