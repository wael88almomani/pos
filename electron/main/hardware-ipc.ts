import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFileSync } from 'node:fs'
import { loadHardwareConfig, saveHardwareConfig, type HardwareConfig } from './hardware-settings'
import { openCashDrawerPhysical, readWeightScale } from './hardware'
import { buildThermalReceiptHtml } from './printing/receipt-html'
import { printHtmlSilent } from './printing/silent-print'
import { buildEscposReceipt } from './printing/escpos-receipt'
import { sendRawEscpos } from './printing/raw-transport'
import { getOrCreateDeviceId } from './device-id'
import { saveExpenseReceiptFromPath } from './files-service'
import { exportSaleInvoicePdf } from './invoice-a4'
import { getPrisma } from './database'
import { logError } from './logger'
import { hardwareConfigSchema } from '../../lib/ipc/schemas'
import { parseIpc } from './ipc-middleware'

type Deps = {
  requireAuth: () => string
  requirePermission: (code: string) => Promise<void>
}

async function focusedOrAnyWindow(): Promise<BrowserWindow | null> {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

export function registerHardwareAndAuxIpc(deps: Deps): void {
  const { requireAuth, requirePermission } = deps

  ipcMain.handle('device:getId', async () => {
    requireAuth()
    const id = await getOrCreateDeviceId()
    return { ok: true, deviceId: id }
  })

  ipcMain.handle('hardware:listPrinters', async () => {
    requireAuth()
    const win = await focusedOrAnyWindow()
    if (!win) return { ok: true, items: [] as { name: string; description?: string }[] }
    try {
      const list = await win.webContents.getPrintersAsync()
      return {
        ok: true,
        items: list.map((p) => ({ name: p.name, description: p.description }))
      }
    } catch (e) {
      logError('listPrinters', e)
      return { ok: true, items: [] }
    }
  })

  ipcMain.handle('hardware:getConfig', async () => {
    requireAuth()
    const cfg = await loadHardwareConfig()
    return { ok: true, config: cfg }
  })

  ipcMain.handle('hardware:setConfig', async (_, cfg: unknown) => {
    await requirePermission('settings.write')
    const parsed = parseIpc(hardwareConfigSchema, cfg)
    if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message }
    await saveHardwareConfig(parsed.data as HardwareConfig)
    return { ok: true }
  })

  ipcMain.handle('hardware:testPrint', async () => {
    await requirePermission('settings.write')
    const cfg = await loadHardwareConfig()
    const p = getPrisma()
    const store = (await p.setting.findUnique({ where: { key: 'store.name' } }))?.value || 'POS'
    try {
      if (cfg.receiptMode === 'escpos-raw' && cfg.rawTransport.type !== 'none') {
        const buf = buildEscposReceipt({
          storeName: store,
          invoiceNumber: 'TEST-000001',
          cashier: 'test',
          lines: [{ name: 'Test line', qty: 1, price: 1, total: 1 }],
          subtotal: 1,
          discount: 0,
          tax: 0,
          total: 1,
          paymentMethod: 'test'
        })
        const r = await sendRawEscpos(cfg.rawTransport, buf)
        if (!r.ok) return { ok: false, error: r.error }
      } else {
        const html = buildThermalReceiptHtml({
          storeName: store,
          invoiceNumber: 'TEST-000001',
          cashier: 'test',
          lines: [{ name: 'سطر تجريبي', qty: 1, price: 1, total: 1 }],
          subtotal: 1,
          discount: 0,
          tax: 0,
          total: 1,
          paymentMethod: 'اختبار',
          qrDataUrl: null,
          logoDataUrl: null,
          paperMm: cfg.paperMm,
          template: cfg.receiptTemplate
        })
        const r = await printHtmlSilent(html, { deviceName: cfg.printerName || undefined, silent: true })
        if (!r.ok) return { ok: false, error: r.error }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('hardware:testDrawer', async () => {
    await requirePermission('settings.write')
    const r = await openCashDrawerPhysical()
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  })

  ipcMain.handle('scale:readWeight', async () => {
    await requirePermission('pos.sell')
    const w = await readWeightScale()
    return { ok: true, weightKg: w }
  })

  ipcMain.handle('files:pickExpenseImage', async () => {
    await requirePermission('expense.write')
    const win = (await focusedOrAnyWindow()) ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return { ok: false, error: 'no_window' }
    const r = await dialog.showOpenDialog(win, {
      title: 'صورة إيصال',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
    })
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
    const saved = saveExpenseReceiptFromPath(r.filePaths[0])
    if (!saved.ok) return { ok: false, error: saved.error }
    return { ok: true, relativePath: saved.relativePath }
  })

  ipcMain.handle('invoice:exportSalePdf', async (_, saleId: string) => {
    await requirePermission('reports.read')
    const win = (await focusedOrAnyWindow()) ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return { ok: false, error: 'no_window' }
    const pdf = await exportSaleInvoicePdf(saleId)
    const r = await dialog.showSaveDialog(win, {
      title: 'حفظ فاتورة PDF',
      defaultPath: `invoice-${saleId}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (r.canceled || !r.filePath) return { ok: false, canceled: true }
    writeFileSync(r.filePath, pdf)
    return { ok: true, path: r.filePath }
  })
}
