import { EnterpriseToolbar, enterprisePageRootClass, enterprisePanelClass } from './EnterpriseToolbar'

/** صفحة احتياطية للوحدات المستقبلية — نفس هيكل الشريط الموحّد */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className={enterprisePageRootClass}>
      <EnterpriseToolbar
        title={title}
        subtitle="وحدة تحضيرية — للتوسع ضمن المعمارية المعيارية (مخزون، مرتجعات، مصروفات، …)."
      />
      <div className="flex-1 min-h-0 overflow-auto p-4 flex items-start justify-center pt-8">
        <div className={`max-w-lg px-6 py-8 text-center text-sm text-slate-700 shadow-sm ${enterprisePanelClass}`}>
          البيانات ومسارات IPC يمكن ربطها بنفس نمط المنتجات والمبيعات الحالية.
        </div>
      </div>
    </div>
  )
}
