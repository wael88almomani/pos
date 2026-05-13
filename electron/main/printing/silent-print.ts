import { BrowserWindow } from 'electron'
import { logError, logInfo } from '../logger'

export async function printHtmlSilent(html: string, opts: { deviceName?: string; silent?: boolean }): Promise<{ ok: boolean; error?: string }> {
  const silent = opts.silent !== false
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      width: 400,
      height: 1600,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
    const done = (ok: boolean, err?: string) => {
      try {
        win.close()
      } catch {
        /* */
      }
      resolve(ok ? { ok: true } : { ok: false, error: err })
    }
    win.webContents.on('did-fail-load', () => done(false, 'did-fail-load'))
    void win.loadURL(dataUrl).catch((e) => done(false, e instanceof Error ? e.message : String(e)))
    win.webContents.on('did-finish-load', () => {
      win.webContents.print(
        {
          silent,
          printBackground: true,
          deviceName: opts.deviceName || undefined
        },
        (success, failureReason) => {
          if (success) {
            logInfo('silent print completed', { deviceName: opts.deviceName })
            done(true)
          } else {
            logError('silent print failed', { failureReason })
            done(false, failureReason || 'print_failed')
          }
        }
      )
    })
  })
}

export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      width: 794,
      height: 1123,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
    win.webContents.on('did-fail-load', () => {
      win.close()
      reject(new Error('did-fail-load'))
    })
    void win
      .loadURL(dataUrl)
      .then(() => {
        win.webContents
          .printToPDF({
            printBackground: true,
            margins: { marginType: 'default' },
            pageSize: 'A4'
          })
          .then((data) => {
            win.close()
            resolve(data)
          })
          .catch((e) => {
            win.close()
            reject(e)
          })
      })
      .catch((e) => {
        win.close()
        reject(e)
      })
  })
}
