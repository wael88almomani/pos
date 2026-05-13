import { useEffect, useState } from 'react'
import { EnterpriseToolbar, enterprisePageRootClass } from '../../shared/EnterpriseToolbar'

export function RestorePage() {
  const [items, setItems] = useState<{ path: string; name: string; mtime: number }[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  async function load() {
    const r = await window.posApi.backup.list()
    if (r.ok && 'items' in r) setItems(r.items as { path: string; name: string; mtime: number }[])
  }

  useEffect(() => {
    void load()
  }, [])

  const [err, setErr] = useState<string | null>(null)

  async function restore() {
    if (!selected) return
    if (!confirm('سيتم إعادة تشغيل التطبيق بعد استبدال قاعدة البيانات. متابعة؟')) return
    setErr(null)
    const r = await window.posApi.backup.restore(selected)
    if (r && typeof r === 'object' && 'ok' in r && r.ok === false && 'error' in r) {
      setErr(String((r as { error?: string }).error))
    }
  }

  return (
    <div className={enterprisePageRootClass}>
      <EnterpriseToolbar
        title="استعادة نسخة احتياطية"
        subtitle="اختر ملفًا بصيغة backup_YYYY-MM-DD_HH-mm.db ثم أكّد — سيتم إعادة تشغيل التطبيق بعد الاستبدال."
      />
      <div className="flex-1 min-h-0 overflow-auto p-4 max-w-3xl w-full mx-auto space-y-4">
      <ul className="rounded-xl border border-slate-300 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
        {items.map((it) => (
          <li key={it.path} className="p-3 flex items-center justify-between gap-3">
            <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
              <input type="radio" name="bk" checked={selected === it.path} onChange={() => setSelected(it.path)} />
              <span className="font-mono text-sm truncate">{it.name}</span>
            </label>
            <span className="text-xs text-slate-500 shrink-0">
              {new Date(it.mtime).toLocaleString('ar-SA')}
            </span>
          </li>
        ))}
        {!items.length && <li className="p-6 text-center text-slate-500 text-sm">لا توجد نسخ بعد</li>}
      </ul>
      {err && <div className="text-sm text-red-600 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-3">{err}</div>}
      <button
        type="button"
        disabled={!selected}
        className="rounded-xl bg-[#b45309] text-white px-4 py-3 font-semibold hover:bg-amber-800 disabled:opacity-50"
        onClick={() => void restore()}
      >
        استعادة
      </button>
      </div>
    </div>
  )
}
