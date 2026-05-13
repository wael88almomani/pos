import { useCallback, useEffect, useState } from 'react'
import { Can } from '../../../core/Can'
import { EnterpriseToolbar, enterprisePageRootClass } from '../../shared/EnterpriseToolbar'

export function AuditPage() {
  const [items, setItems] = useState<{ id: string; action: string; entity: string | null; userName: string | null; createdAt: string; meta: string | null }[]>([])

  const load = useCallback(async () => {
    const r = await window.posApi.audit.list({ take: 300 })
    if (r.ok && 'items' in r) setItems(r.items as never)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className={enterprisePageRootClass}>
      <EnterpriseToolbar title="سجل التدقيق" subtitle="آخر الأحداث الحساسة في النظام (قراءة فقط)." />
      <div className="flex-1 min-h-0 overflow-auto p-4 max-w-6xl w-full mx-auto">
      <Can perm="audit.read">
        <div className="overflow-x-auto rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
          <table className="w-full text-right min-w-[720px]">
            <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-600">
              <tr>
                <th className="p-3 font-semibold">وقت</th>
                <th className="p-3 font-semibold">المستخدم</th>
                <th className="p-3 font-semibold">الحدث</th>
                <th className="p-3 font-semibold">كيان</th>
                <th className="p-3 font-semibold">بيانات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-2 text-xs whitespace-nowrap">{a.createdAt}</td>
                  <td className="p-2">{a.userName}</td>
                  <td className="p-2 font-mono text-xs">{a.action}</td>
                  <td className="p-2 text-xs font-mono">{(a as { entityId?: string }).entityId ?? '—'}</td>
                  <td className="p-2 text-xs max-w-xs truncate">{a.meta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Can>
      </div>
    </div>
  )
}
