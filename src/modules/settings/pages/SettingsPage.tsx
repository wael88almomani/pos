import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type Binding = { actionId: string; keys: string }

const LABELS: Record<string, string> = {
  'nav.pos': 'شاشة البيع',
  'nav.products': 'منتج سريع (بحث وإضافة على شاشة البيع)',
  'nav.invoices': 'الفواتير',
  'nav.returns': 'المرتجعات',
  'pay.cash': 'اختيار طريقة دفع: نقدي (لا يُكمِل البيع)',
  'pay.card': 'اختيار طريقة دفع: بطاقة (لا يُكمِل البيع)',
  'pay.other': 'اختيار طريقة دفع: أخرى/متعدد (لا يُكمِل البيع)',
  'cart.hold': 'تعليق فاتورة',
  'sale.complete': 'إتمام البيع',
  'print.receipt': 'طباعة',
  'search.product': 'بحث منتج',
  'pos.held_open': 'قائمة المعلقة',
  'hardware.drawer': 'درج النقد',
  'cart.new': 'فاتورة جديدة',
  'cart.discount': 'خصم',
  'cart.quantity': 'تغيير كمية',
  'cart.void': 'إلغاء فاتورة'
}

export function SettingsPage() {
  const [storeName, setStoreName] = useState('')
  const [backupPath, setBackupPath] = useState('D:/backup')
  const [bindings, setBindings] = useState<Binding[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('ui.sound.enabled') !== '0')
  const [soundVol, setSoundVol] = useState(() => Number(localStorage.getItem('ui.sound.volume') ?? 0.45))

  async function load() {
    const [n, b, list] = await Promise.all([
      window.posApi.settings.get('store.name'),
      window.posApi.settings.get('backup.path'),
      window.posApi.shortcuts.list()
    ])
    if (n.ok && n.value) setStoreName(n.value)
    if (b.ok && b.value) setBackupPath(b.value)
    if (list.ok && 'items' in list) setBindings(list.items as Binding[])
  }

  useEffect(() => {
    void load()
  }, [])

  async function saveCore() {
    await window.posApi.settings.set('store.name', storeName)
    await window.posApi.settings.set('backup.path', backupPath)
    setMsg('تم حفظ الإعدادات')
    setTimeout(() => setMsg(null), 2000)
  }

  async function saveShortcut(row: Binding, keys: string) {
    await window.posApi.shortcuts.set(row.actionId, keys)
    await load()
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-white to-gray-50 px-4 py-3 shadow-sm">
        <h1 className="text-xl font-bold text-blue-700">الإعدادات</h1>
        <div className="flex gap-2 text-sm">
          <Link
            className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
            to="/settings/hardware"
          >
            الأجهزة والطباعة
          </Link>
          <Link
            className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
            to="/users/roles"
          >
            الأدوار والصلاحيات
          </Link>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
        <h2 className="font-bold text-slate-800">عام</h2>
        <label className="block space-y-1 text-sm font-semibold text-slate-700">
          اسم المتجر
          <input className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm font-semibold text-slate-700">
          مجلد النسخ الاحتياطي
          <input
            className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 font-mono text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            value={backupPath}
            onChange={(e) => setBackupPath(e.target.value)}
          />
          <span className="text-xs text-slate-600">يُنشأ تلقائيًا إن لم يكن موجودًا (مثال D:/backup)</span>
        </label>
        <button type="button" className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg active:scale-95" onClick={() => void saveCore()}>
          حفظ
        </button>
        {msg && <div className="text-sm text-[#1e40af] font-bold">{msg}</div>}
      </section>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
        <h2 className="font-bold text-slate-800">التشخيص</h2>
        <p className="text-sm text-slate-600">فحص قاعدة البيانات، النسخ الاحتياطي، والأجهزة (يتطلب صلاحية الإعدادات).</p>
        <Link
          to="/settings/diagnostics"
          className="inline-flex rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md"
        >
          فتح صفحة التشخيص
        </Link>
      </section>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
        <h2 className="font-bold text-slate-800">الأصوات والتغذية الراجعة</h2>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={soundOn}
            onChange={(e) => {
              setSoundOn(e.target.checked)
              localStorage.setItem('ui.sound.enabled', e.target.checked ? '1' : '0')
            }}
          />
          تفعيل أصوات المسح والنجاح والخطأ
        </label>
        <label className="block space-y-1 text-sm font-semibold text-slate-700">
          مستوى الصوت ({Math.round(soundVol * 100)}%)
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={soundVol}
            onChange={(e) => {
              const v = Number(e.target.value)
              setSoundVol(v)
              localStorage.setItem('ui.sound.volume', String(v))
            }}
            className="w-full"
          />
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
        <h2 className="font-bold text-slate-800">اختصارات لوحة المفاتيح</h2>
        <div className="text-xs font-semibold text-slate-600">صيغة: Control+n أو F1 — يُحدّث الربط فورًا.</div>
        <div className="divide-y divide-slate-200">
          {bindings.map((b) => (
            <div key={b.actionId} className="py-2 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[160px]">
                <div className="text-sm font-bold">{LABELS[b.actionId] ?? b.actionId}</div>
                <div className="text-[11px] text-slate-500 font-mono">{b.actionId}</div>
              </div>
              <input
                className="h-9 w-40 rounded-lg border border-gray-300 bg-white px-3 font-mono text-sm shadow-sm transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                defaultValue={b.keys}
                key={b.keys}
                onBlur={(e) => {
                  if (e.target.value !== b.keys) void saveShortcut(b, e.target.value)
                }}
              />
            </div>
          ))}
        </div>
      </section>
      </div>
    </div>
  )
}
