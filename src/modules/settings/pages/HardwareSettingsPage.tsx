import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToastStore } from '../../../core/toast-store'
import { EnterpriseToolbar, enterprisePageRootClass } from '../../shared/EnterpriseToolbar'

type RawTransport =
  | { type: 'none' }
  | { type: 'com'; port: string }
  | { type: 'tcp'; host: string; port: number }

type HardwareConfig = {
  receiptMode: 'html-silent' | 'escpos-raw'
  printerName: string
  paperMm: 58 | 80
  autoPrintAfterSale: boolean
  openDrawerAfterSale: boolean
  receiptTemplate: 'default' | 'compact' | 'detailed'
  rawTransport: RawTransport
  scaleTcp: { host: string; port: number; timeoutMs: number } | null
  scaleSimulatedKg: number | null
  receiptLogoPath?: string | null
  printCode128OnReceipt?: boolean
  arabicEncodingProfile?: 'utf8' | 'cp864'
  activePrinterProfile?: string
  mockHardwareMode?: boolean
}

export function HardwareSettingsPage() {
  const toast = useToastStore((s) => s.push)
  const [printers, setPrinters] = useState<{ name: string }[]>([])
  const [cfg, setCfg] = useState<HardwareConfig | null>(null)
  const [comPort, setComPort] = useState('COM4')
  const [tcpHost, setTcpHost] = useState('192.168.1.100')
  const [tcpPort, setTcpPort] = useState('9100')
  const [scaleHost, setScaleHost] = useState('')
  const [scalePort, setScalePort] = useState('9001')
  const [simKg, setSimKg] = useState('')

  async function load() {
    const [plist, c] = await Promise.all([window.posApi.hardware.listPrinters(), window.posApi.hardware.getConfig()])
    if (plist.ok && 'items' in plist) setPrinters(plist.items as { name: string }[])
    if (c.ok && 'config' in c) {
      const conf = c.config as HardwareConfig
      setCfg(conf)
      if (conf.rawTransport.type === 'com') setComPort(conf.rawTransport.port)
      if (conf.rawTransport.type === 'tcp') {
        setTcpHost(conf.rawTransport.host)
        setTcpPort(String(conf.rawTransport.port))
      }
      if (conf.scaleTcp) {
        setScaleHost(conf.scaleTcp.host)
        setScalePort(String(conf.scaleTcp.port))
      }
      setSimKg(conf.scaleSimulatedKg != null ? String(conf.scaleSimulatedKg) : '')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function save() {
    if (!cfg) return
    let raw: RawTransport = { type: 'none' }
    if (cfg.receiptMode === 'escpos-raw') {
      if (tcpHost.trim().length > 0) {
        raw = { type: 'tcp', host: tcpHost.trim(), port: Math.max(1, parseInt(tcpPort, 10) || 9100) }
      } else if (comPort.trim().length > 0) {
        raw = { type: 'com', port: comPort.trim() }
      }
    }
    const next: HardwareConfig = {
      ...cfg,
      rawTransport: raw,
      scaleTcp:
        scaleHost.trim().length > 0
          ? { host: scaleHost.trim(), port: Math.max(1, parseInt(scalePort, 10) || 9001), timeoutMs: 2000 }
          : null,
      scaleSimulatedKg: simKg.trim() ? Math.max(0, parseFloat(simKg)) : null
    }
    const r = await window.posApi.hardware.setConfig(next)
    if (r.ok) {
      toast('تم حفظ إعدادات الأجهزة')
      setCfg(next)
    } else toast('تعذر الحفظ', 'err')
  }

  if (!cfg) {
    return (
      <div className={enterprisePageRootClass}>
        <EnterpriseToolbar title="إعدادات الأجهزة" subtitle="تحميل الإعدادات…" />
        <div className="flex-1 grid place-items-center text-slate-500">جاري التحميل…</div>
      </div>
    )
  }

  return (
    <div className={enterprisePageRootClass}>
      <EnterpriseToolbar
        title="إعدادات الأجهزة"
        subtitle="الطباعة الصامتة عبر Windows أو ESC/POS عبر COM أو شبكة (9100)."
        actions={
          <Link to="/settings" className="text-sm text-[#1e40af] hover:underline font-semibold">
            ← الإعدادات
          </Link>
        }
      />

      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-6 max-w-3xl w-full mx-auto">
      <section className="rounded-xl border border-slate-300 dark:border-slate-700 p-5 space-y-4 bg-white dark:bg-slate-900">
        <h2 className="font-semibold">الطابعة والإيصال</h2>
        <label className="block space-y-1 text-sm">
          وضع الطباعة
          <select
            className="w-full rounded-xl border px-3 py-2 bg-transparent"
            value={cfg.receiptMode}
            onChange={(e) => setCfg({ ...cfg, receiptMode: e.target.value as HardwareConfig['receiptMode'] })}
          >
            <option value="html-silent">HTML — طباعة صامتة (اسم الطابعة من Windows)</option>
            <option value="escpos-raw">ESC/POS — خام عبر COM أو TCP</option>
          </select>
        </label>
        {cfg.receiptMode === 'html-silent' && (
          <label className="block space-y-1 text-sm">
            الطابعة الافتراضية
            <select
              className="w-full rounded-xl border px-3 py-2 bg-transparent font-mono text-xs"
              value={cfg.printerName}
              onChange={(e) => setCfg({ ...cfg, printerName: e.target.value })}
            >
              <option value="">— اختر من القائمة —</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {cfg.receiptMode === 'escpos-raw' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              منفذ COM (مثال COM4)
              <input className="w-full rounded-xl border px-3 py-2 font-mono" value={comPort} onChange={(e) => setComPort(e.target.value)} />
            </label>
            <div className="space-y-1 text-sm">
              <span className="block">أو TCP</span>
              <div className="flex gap-2">
                <input className="flex-1 rounded-xl border px-2 py-2 font-mono text-xs" value={tcpHost} onChange={(e) => setTcpHost(e.target.value)} />
                <input className="w-24 rounded-xl border px-2 py-2 font-mono" value={tcpPort} onChange={(e) => setTcpPort(e.target.value)} />
              </div>
            </div>
          </div>
        )}
        <label className="block space-y-1 text-sm">
          عرض الورق (مم)
          <select
            className="w-full rounded-xl border px-3 py-2 bg-transparent"
            value={cfg.paperMm}
            onChange={(e) => setCfg({ ...cfg, paperMm: Number(e.target.value) as 58 | 80 })}
          >
            <option value={58}>58</option>
            <option value={80}>80</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          قالب الإيصال
          <select
            className="w-full rounded-xl border px-3 py-2 bg-transparent"
            value={cfg.receiptTemplate}
            onChange={(e) => setCfg({ ...cfg, receiptTemplate: e.target.value as HardwareConfig['receiptTemplate'] })}
          >
            <option value="default">افتراضي</option>
            <option value="compact">مختصر</option>
            <option value="detailed">تفصيلي</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          مسار شعار المتجر (مطلق أو تحت مجلد بيانات التطبيق)
          <input
            className="w-full rounded-xl border px-3 py-2 font-mono text-xs"
            placeholder="مثال: logos/store.png"
            value={cfg.receiptLogoPath ?? ''}
            onChange={(e) => setCfg({ ...cfg, receiptLogoPath: e.target.value || null })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cfg.printCode128OnReceipt ?? true}
            onChange={(e) => setCfg({ ...cfg, printCode128OnReceipt: e.target.checked })}
          />
          طباعة باركود Code128 على الإيصال
        </label>
        <label className="block space-y-1 text-sm">
          ملف تعريف العربية (ESC/POS — للتوسعة)
          <select
            className="w-full rounded-xl border px-3 py-2 bg-transparent"
            value={cfg.arabicEncodingProfile ?? 'utf8'}
            onChange={(e) =>
              setCfg({ ...cfg, arabicEncodingProfile: e.target.value as HardwareConfig['arabicEncodingProfile'] })
            }
          >
            <option value="utf8">UTF-8</option>
            <option value="cp864">CP864 (قديم)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2">
          <input
            type="checkbox"
            checked={cfg.mockHardwareMode === true}
            onChange={(e) => setCfg({ ...cfg, mockHardwareMode: e.target.checked })}
          />
          وضع أجهزة وهمي (Mock) — يتخطى الطباعة والدرج؛ مفيد للتطوير. يمكن أيضًا تعيين متغير البيئة POS_HARDWARE_MOCK=1
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cfg.autoPrintAfterSale}
            onChange={(e) => setCfg({ ...cfg, autoPrintAfterSale: e.target.checked })}
          />
          طباعة تلقائية بعد إتمام البيع
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cfg.openDrawerAfterSale}
            onChange={(e) => setCfg({ ...cfg, openDrawerAfterSale: e.target.checked })}
          />
          فتح الدرج بعد البيع (يتطلب نقل ESC/POS صحيح)
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={() => void load()}>
            تحديث قائمة الطابعات
          </button>
          <button
            type="button"
            className="rounded-xl bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 px-4 py-2 text-sm"
            onClick={async () => {
              const r = await window.posApi.hardware.testPrint()
              if (r.ok) toast('تم إرسال اختبار الطباعة')
              else toast(`فشل: ${'error' in r ? String(r.error) : ''}`, 'err')
            }}
          >
            اختبار طباعة
          </button>
          <button
            type="button"
            className="rounded-xl border px-4 py-2 text-sm"
            onClick={async () => {
              const r = await window.posApi.hardware.testDrawer()
              if (r.ok) toast('تم إرسال نبضة الدرج')
              else toast(`فشل: ${'error' in r ? String(r.error) : ''}`, 'err')
            }}
          >
            اختبار الدرج
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-300 dark:border-slate-700 p-5 space-y-3 bg-white dark:bg-slate-900">
        <h2 className="font-semibold">الميزان (TCP)</h2>
        <p className="text-xs text-slate-500">للوزن عبر محول شبكة يبث وزنًا كنص. للمحاكاة املأ حقل «وزن تجريبي».</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <input className="rounded-xl border px-3 py-2" placeholder="IP الميزان" value={scaleHost} onChange={(e) => setScaleHost(e.target.value)} />
          <input className="rounded-xl border px-3 py-2" placeholder="منفذ" value={scalePort} onChange={(e) => setScalePort(e.target.value)} />
        </div>
        <label className="block space-y-1 text-sm">
          وزن تجريبي (كغ) — يُستخدم إن لم يتوفر TCP
          <input className="w-full rounded-xl border px-3 py-2" value={simKg} onChange={(e) => setSimKg(e.target.value)} />
        </label>
        <button
          type="button"
          className="rounded-xl border px-4 py-2 text-sm"
          onClick={async () => {
            const r = await window.posApi.scale.readWeight()
            if (r.ok && 'weightKg' in r && r.weightKg != null) toast(`الوزن: ${Number(r.weightKg).toFixed(3)} كغ`)
            else toast('لا قراءة — تحقق من إعداد الميزان', 'err')
          }}
        >
          قراءة وزن الآن
        </button>
      </section>

      <button
        type="button"
        className="rounded-xl bg-[#1e40af] hover:bg-[#172554] text-white px-6 py-3 font-semibold"
        onClick={() => void save()}
      >
        حفظ الإعدادات
      </button>
      </div>
    </div>
  )
}
