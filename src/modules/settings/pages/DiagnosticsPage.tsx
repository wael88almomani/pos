import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, RefreshCw } from 'lucide-react'
import { useToastStore } from '../../../core/toast-store'
import { EnterpriseToolbar, enterprisePageRootClass } from '../../shared/EnterpriseToolbar'

type Report = {
  generatedAt: string
  app: { packaged: boolean; version: string; userData: string }
  database: {
    path: string
    integrity: string
    journalMode: string | null
    pageCount: number | null
    freelistCount: number | null
  }
  backups: { dir: string; count: number; newestMtime: number | null }
  offlineQueue: { outboxLines: number }
  hardware: { receiptMode: string; mockHardwareMode: boolean; posHardwareMockEnv: boolean }
  memory: { rssMb: number; heapUsedMb: number }
}

export function DiagnosticsPage() {
  const toast = useToastStore((s) => s.push)
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.posApi.diagnostics.collect()
      if (r.ok && 'report' in r) setReport(r.report as Report)
      else toast('تعذر جلب التشخيص', 'err')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className={enterprisePageRootClass}>
      <EnterpriseToolbar
        title="تشخيص النظام"
        subtitle="قاعدة البيانات، النسخ الاحتياطي، الطابعة، الذاكرة — بدون أجهزة خارجية."
        actions={
          <>
            <Activity className="h-5 w-5 text-[#1e40af] shrink-0 hidden sm:block" aria-hidden />
            <Link
              to="/settings"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              رجوع للإعدادات
            </Link>
            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
              className="rounded-xl bg-[#1e40af] hover:bg-[#172554] text-white px-4 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-50 font-semibold"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </button>
          </>
        }
      />

      <div className="flex-1 min-h-0 overflow-auto p-4 max-w-4xl mx-auto w-full space-y-6">
      {!report && !loading && (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-slate-500 text-sm bg-white/60 dark:bg-slate-900/40">
          اضغط «تحديث» لعرض التقرير.
        </div>
      )}

      {report && (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-slate-300 dark:border-slate-700 p-4 space-y-2 bg-white dark:bg-slate-900">
            <h2 className="font-semibold text-sm">التطبيق</h2>
            <dl className="text-xs space-y-1 font-mono text-slate-600 dark:text-slate-300">
              <div>الإصدار: {report.app.version}</div>
              <div>معبأ: {report.app.packaged ? 'نعم' : 'لا'}</div>
              <div className="break-all">userData: {report.app.userData}</div>
            </dl>
          </section>
          <section className="rounded-xl border border-slate-300 dark:border-slate-700 p-4 space-y-2 bg-white dark:bg-slate-900">
            <h2 className="font-semibold text-sm">الذاكرة</h2>
            <p className="text-xs font-mono text-slate-600 dark:text-slate-300">
              RSS ≈ {report.memory.rssMb} ميجابايت — Heap ≈ {report.memory.heapUsedMb} ميجابايت
            </p>
          </section>
          <section className="rounded-xl border border-slate-300 dark:border-slate-700 p-4 space-y-2 bg-white dark:bg-slate-900 sm:col-span-2">
            <h2 className="font-semibold text-sm">قاعدة البيانات</h2>
            <dl className="text-xs space-y-1 font-mono text-slate-600 dark:text-slate-300 break-all">
              <div>المسار: {report.database.path}</div>
              <div>integrity_check: {report.database.integrity}</div>
              <div>
                WAL: {report.database.journalMode ?? '—'} — صفحات: {report.database.pageCount ?? '—'} — freelist:{' '}
                {report.database.freelistCount ?? '—'}
              </div>
            </dl>
          </section>
          <section className="rounded-xl border border-slate-300 dark:border-slate-700 p-4 space-y-2 bg-white dark:bg-slate-900">
            <h2 className="font-semibold text-sm">النسخ الاحتياطي</h2>
            <p className="text-xs font-mono break-all text-slate-600 dark:text-slate-300">{report.backups.dir}</p>
            <p className="text-xs">عدد الملفات: {report.backups.count}</p>
          </section>
          <section className="rounded-xl border border-slate-300 dark:border-slate-700 p-4 space-y-2 bg-white dark:bg-slate-900">
            <h2 className="font-semibold text-sm">طابعة / أجهزة</h2>
            <p className="text-xs">الوضع: {report.hardware.receiptMode}</p>
            <p className="text-xs">Mock من الإعدادات: {report.hardware.mockHardwareMode ? 'نعم' : 'لا'}</p>
            <p className="text-xs">POS_HARDWARE_MOCK: {report.hardware.posHardwareMockEnv ? 'نعم' : 'لا'}</p>
          </section>
          <section className="rounded-xl border border-slate-300 dark:border-slate-700 p-4 space-y-2 bg-white dark:bg-slate-900 sm:col-span-2">
            <h2 className="font-semibold text-sm">طابور المزامنة المحلي (تحضيري)</h2>
            <p className="text-xs">سطور outbox.jsonl: {report.offlineQueue.outboxLines}</p>
            <p className="text-xs text-slate-500">تم الإنشاء: {new Date(report.generatedAt).toLocaleString('ar-SA')}</p>
          </section>
        </div>
      )}
      </div>
    </div>
  )
}
