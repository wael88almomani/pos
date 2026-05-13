import { BrowserWindow, Notification, app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join, isAbsolute } from 'node:path'
import QRCode from 'qrcode'
import { getPrisma } from './database'
import { code128DataUrl } from './printing/barcode-image'
import { loadHardwareConfig, type HardwareConfig } from './hardware-settings'
import { buildEscposReceipt, buildDrawerKickOnly, type EscposReceiptInput } from './printing/escpos-receipt'
import { buildThermalReceiptHtml, type HtmlReceiptInput } from './printing/receipt-html'
import { printHtmlSilent } from './printing/silent-print'
import { sendRawEscpos } from './printing/raw-transport'
import { logError, logInfo, logWarn } from './logger'

function envMockHardware(): boolean {
  return process.env.POS_HARDWARE_MOCK === '1' || process.env.POS_HARDWARE_MOCK === 'true'
}

async function isMockHardware(cfg: HardwareConfig): Promise<boolean> {
  if (envMockHardware()) return true
  return cfg.mockHardwareMode === true
}

/** storeName يُملأ تلقائيًا من الإعدادات داخل printSaleReceipt */
export type SaleReceiptPayload = Omit<EscposReceiptInput, 'storeName'> & { saleId?: string }

async function storeName(): Promise<string> {
  const row = await getPrisma().setting.findUnique({ where: { key: 'store.name' } })
  return row?.value?.trim() || 'POS'
}

async function buildQrDataUrl(text: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text, { margin: 1, width: 160, errorCorrectionLevel: 'M' })
  } catch {
    return null
  }
}

function resolveLogoPath(p: string): string | null {
  const trimmed = p.trim()
  if (!trimmed) return null
  const abs = isAbsolute(trimmed) ? trimmed : join(app.getPath('userData'), trimmed)
  if (!existsSync(abs)) return null
  return abs
}

async function loadLogoDataUrl(cfg: HardwareConfig): Promise<string | null> {
  const p = cfg.receiptLogoPath
  if (!p) return null
  const abs = resolveLogoPath(p)
  if (!abs) return null
  try {
    const buf = readFileSync(abs)
    const ext = abs.toLowerCase().split('.').pop()
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/** Optional renderer notification (overlay / second display). */
export function notifyHardwarePrint(payload: unknown): void {
  const win = BrowserWindow.getFocusedWindow()
  win?.webContents.send('hardware:print', payload)
}

export async function printSaleReceipt(payload: SaleReceiptPayload, attempt = 1): Promise<{ ok: boolean; error?: string }> {
  const cfg = await loadHardwareConfig()
  if (await isMockHardware(cfg)) {
    logInfo('printSaleReceipt: mock hardware — skipped IO')
    if (cfg.openDrawerAfterSale) notifyDrawer()
    return { ok: true }
  }
  const store = await storeName()
  const qrText = `${store} | ${payload.invoiceNumber} | ${payload.total.toFixed(2)}`
  const qrDataUrl = await buildQrDataUrl(qrText)
  const logoDataUrl = await loadLogoDataUrl(cfg)
  const barcode128DataUrl =
    cfg.printCode128OnReceipt !== false ? await code128DataUrl(payload.invoiceNumber) : null

  const htmlInput: HtmlReceiptInput = {
    storeName: store,
    invoiceNumber: payload.invoiceNumber,
    cashier: payload.cashier,
    lines: payload.lines,
    subtotal: payload.subtotal,
    discount: payload.discount,
    tax: payload.tax,
    total: payload.total,
    paymentMethod: payload.paymentMethod,
    qrDataUrl,
    logoDataUrl,
    barcode128DataUrl,
    paperMm: cfg.paperMm,
    template: cfg.receiptTemplate
  }

  const escInput: EscposReceiptInput = {
    ...payload,
    storeName: store,
    footer: payload.footer ?? store
  }

  try {
    if (cfg.receiptMode === 'escpos-raw' && cfg.rawTransport.type !== 'none') {
      const buf = buildEscposReceipt(escInput)
      const r = await sendRawEscpos(cfg.rawTransport, buf)
      if (!r.ok && attempt < 3) {
        await new Promise((res) => setTimeout(res, 400 * attempt))
        return printSaleReceipt(payload, attempt + 1)
      }
      if (!r.ok) {
        showPrintError(r.error || 'raw_print')
        return { ok: false, error: r.error }
      }
      logInfo('receipt escpos sent', { transport: cfg.rawTransport.type })
    } else {
      const html = buildThermalReceiptHtml(htmlInput)
      const r = await printHtmlSilent(html, {
        deviceName: cfg.printerName || undefined,
        silent: true
      })
      if (!r.ok && attempt < 3) {
        await new Promise((res) => setTimeout(res, 500 * attempt))
        return printSaleReceipt(payload, attempt + 1)
      }
      if (!r.ok) {
        showPrintError(r.error || 'html_print')
        notifyHardwarePrint(payload)
        return { ok: false, error: r.error }
      }
      logInfo('receipt html silent ok', { printer: cfg.printerName })
    }

    if (cfg.openDrawerAfterSale) {
      await openCashDrawerPhysical(cfg)
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logError('printSaleReceipt', msg)
    showPrintError(msg)
    notifyHardwarePrint(payload)
    return { ok: false, error: msg }
  }
}

function showPrintError(message: string): void {
  if (Notification.isSupported()) {
    new Notification({ title: 'خطأ طباعة', body: message.slice(0, 200) }).show()
  }
}

export async function openCashDrawerPhysical(cfg?: HardwareConfig): Promise<{ ok: boolean; error?: string }> {
  const c = cfg ?? (await loadHardwareConfig())
  if (await isMockHardware(c)) {
    logInfo('openCashDrawerPhysical: mock hardware — skipped')
    notifyDrawer()
    return { ok: true }
  }
  try {
    if (c.rawTransport.type === 'com' || c.rawTransport.type === 'tcp') {
      const buf = buildDrawerKickOnly()
      const r = await sendRawEscpos(c.rawTransport, buf)
      notifyDrawer()
      if (!r.ok) logWarn('drawer raw failed', r.error)
      return r.ok ? { ok: true } : { ok: false, error: r.error }
    }
    notifyDrawer()
    logInfo('cash drawer: configure hardware.config rawTransport (COM/TCP) للنبضة المادية')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function notifyDrawer(): void {
  const win = BrowserWindow.getFocusedWindow()
  win?.webContents.send('hardware:cash-drawer', { openedAt: Date.now() })
}

/** IPC compatibility — triggers physical drawer when raw transport configured */
export function openCashDrawer(): void {
  void openCashDrawerPhysical()
}

export async function readWeightScale(): Promise<number | null> {
  const cfg = await loadHardwareConfig()
  if (await isMockHardware(cfg)) {
    if (cfg.scaleSimulatedKg != null && cfg.scaleSimulatedKg > 0) return cfg.scaleSimulatedKg
    return 1.0
  }
  if (cfg.scaleSimulatedKg != null && cfg.scaleSimulatedKg > 0) return cfg.scaleSimulatedKg
  if (!cfg.scaleTcp) return null
  const { host, port, timeoutMs } = cfg.scaleTcp
  return new Promise((resolve) => {
    const sock = createConnection({ host, port })
    let buf = ''
    const t = setTimeout(() => {
      sock.destroy()
      resolve(null)
    }, timeoutMs ?? 2000)
    sock.on('data', (chunk) => {
      buf += chunk.toString('ascii')
      const m = buf.match(/(\d+\.?\d*)\s*(kg|g)?/i)
      if (m) {
        clearTimeout(t)
        sock.destroy()
        resolve(parseFloat(m[1]))
      }
    })
    sock.on('error', () => {
      clearTimeout(t)
      resolve(null)
    })
  })
}
