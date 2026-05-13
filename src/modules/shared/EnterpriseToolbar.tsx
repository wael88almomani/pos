import type { ReactNode } from 'react'

/** خلفية صفحة النظام (مطابقة سطح المكتب / شاشة البيع) */
export const enterprisePageRootClass = 'h-full flex flex-col min-h-0 bg-[#c4c4c4] text-slate-900'

/** منطقة التمرير تحت الشريط العنواني */
export const enterpriseScrollClass = 'flex-1 min-h-0 overflow-auto p-3 sm:p-4'

/** لوحة / بطاقة داخل الصفحة */
export const enterprisePanelClass = 'rounded-sm border border-[#808080] bg-white shadow-sm'

/** شريط علوي موحّد لصفحات النظام */
export function EnterpriseToolbar({
  title,
  subtitle,
  actions
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="shrink-0 border-b border-[#808080] bg-[#dcdcdc] px-3 py-2 shadow-[inset_0_1px_0_#f0f0f0] flex flex-wrap gap-2 items-center justify-between">
      <div className="min-w-0">
        <h1 className="text-sm font-bold text-slate-900 truncate">{title}</h1>
        {subtitle ? <p className="text-[11px] text-slate-700 mt-0.5 max-w-3xl leading-snug">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-1.5 items-center">{actions}</div> : null}
    </div>
  )
}

/** إطار نافذة فرعية موحّد */
export function EnterpriseModalFrame({
  title,
  onClose,
  children,
  maxWidthClass = 'max-w-lg'
}: {
  title: string
  onClose: () => void
  children: ReactNode
  /** مثل max-w-3xl لنماذج كبيرة */
  maxWidthClass?: string
}) {
  return (
    <div className="fixed inset-0 z-[90] bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div
        className={
          'w-full max-h-[92vh] flex flex-col overflow-hidden rounded-sm border border-[#808080] bg-white shadow-xl ' +
          maxWidthClass
        }
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#808080] bg-[#e8e8e8] px-3 py-2">
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            className="rounded-sm border border-[#888] bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            onClick={onClose}
          >
            إغلاق
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3">{children}</div>
      </div>
    </div>
  )
}
