import { Link } from 'react-router-dom'
import { useAuthStore } from './stores/auth-store'

export function RequireRoutePerm({
  anyOf,
  children
}: {
  anyOf: readonly string[]
  children: React.ReactNode
}) {
  const canAny = useAuthStore((s) => s.canAny)
  if (!canAny([...anyOf])) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-[#c4c4c4] p-8 text-center">
        <p className="text-slate-800">لا تملك صلاحية الوصول لهذه الشاشة.</p>
        <Link to="/pos" className="rounded-sm border border-[#888] bg-white px-4 py-2 text-sm font-semibold text-[#0d47a1] hover:bg-slate-50">
          العودة لشاشة البيع
        </Link>
      </div>
    )
  }
  return <>{children}</>
}
