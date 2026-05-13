import type { HardwareConfig } from '../hardware-settings'

export type HealthResult = { ok: boolean; detail?: string }

export interface IPrinterDriver {
  readonly id: string
  printHtml(html: string, cfg: HardwareConfig): Promise<{ ok: boolean; error?: string }>
  healthCheck(cfg: HardwareConfig): Promise<HealthResult>
}

export interface ICashDrawerDriver {
  pulse(cfg: HardwareConfig): Promise<HealthResult>
}

export interface IScaleDriver {
  readWeightKg(cfg: HardwareConfig): Promise<number | null>
}

/** الماسح الضوئي كوحة مفاتيح HID — جاهز لاحقًا لسائق USB مخصص */
export interface IScannerDriver {
  readonly id: string
  /** حالة جاهزية (لا يوجد اتصال مباشر في وضع HID) */
  healthCheck(): Promise<HealthResult>
}

/** طبقة تجريد — التنفيذ الفعلي في ../hardware.ts وملفات printing/ */
export const halMeta = {
  version: 1,
  drivers: ['html-silent', 'escpos-raw', 'tcp-scale', 'hid-scanner'] as const
}
