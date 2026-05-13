import { getPrisma } from './database'

export type RawTransport =
  | { type: 'none' }
  | { type: 'com'; port: string }
  | { type: 'tcp'; host: string; port: number }

export type HardwareConfig = {
  receiptMode: 'html-silent' | 'escpos-raw'
  /** Windows printer display name for silent HTML receipt */
  printerName: string
  paperMm: 58 | 80
  autoPrintAfterSale: boolean
  openDrawerAfterSale: boolean
  receiptTemplate: 'default' | 'compact' | 'detailed'
  rawTransport: RawTransport
  /** TCP host:port for some label scales streaming weight */
  scaleTcp: { host: string; port: number; timeoutMs: number } | null
  /** Simulated weight (kg) for testing when no hardware */
  scaleSimulatedKg: number | null
  /** مسار ملف الشعار (مطلق أو تحت userData) */
  receiptLogoPath?: string | null
  /** طباعة باركود Code128 على الإيصال الحراري HTML */
  printCode128OnReceipt?: boolean
  /** ملف تعريف ترميز العربية للـ ESC/POS (الوضع الحالي يطبع HTML أساسًا) */
  arabicEncodingProfile?: 'utf8' | 'cp864'
  /** ملفات تعريف طابعات متعددة — الاسم النشط */
  activePrinterProfile?: string
  /** وضع تجريبي: يتخطى الإرسال الفعلي للطابعة/الدرج (للمطورين والاختبار) */
  mockHardwareMode?: boolean
}

export const defaultHardwareConfig: HardwareConfig = {
  receiptMode: 'html-silent',
  printerName: '',
  paperMm: 80,
  autoPrintAfterSale: false,
  openDrawerAfterSale: false,
  receiptTemplate: 'default',
  rawTransport: { type: 'none' },
  scaleTcp: null,
  scaleSimulatedKg: null,
  receiptLogoPath: null,
  printCode128OnReceipt: true,
  arabicEncodingProfile: 'utf8',
  activePrinterProfile: 'default',
  mockHardwareMode: false
}

const KEY = 'hardware.config'

export async function loadHardwareConfig(): Promise<HardwareConfig> {
  try {
    const row = await getPrisma().setting.findUnique({ where: { key: KEY } })
    if (!row?.value) return { ...defaultHardwareConfig }
    const parsed = JSON.parse(row.value) as Partial<HardwareConfig>
    return { ...defaultHardwareConfig, ...parsed }
  } catch {
    return { ...defaultHardwareConfig }
  }
}

export async function saveHardwareConfig(cfg: HardwareConfig): Promise<void> {
  await getPrisma().setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(cfg) },
    update: { value: JSON.stringify(cfg) }
  })
}
