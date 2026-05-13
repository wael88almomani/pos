import { app, BrowserWindow, ipcMain } from 'electron'
import { createRequire } from 'node:module'
import { getPrisma } from './database'
import { logError, logInfo, logWarn } from './logger'

/** CommonJS فقط — createRequire يعمل مع ESM في main مهما دمج الـ bundler */
const requireUpdater = createRequire(import.meta.url)
const { autoUpdater } = requireUpdater('electron-updater') as {
  autoUpdater: import('electron-updater').AppUpdater
}

let channel: 'stable' | 'beta' = 'stable'
let liveUpdater = false
let ipcRegistered = false

function feedBaseUrl(): string | null {
  const env = process.env.POS_UPDATE_URL?.trim()
  if (env) return env.replace(/\/$/, '')
  return null
}

/** تسجيل معالجات IPC مرة واحدة — حتى لا يفشل الـ preload في التطوير */
export function registerUpdaterIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle('updater:check', async () => {
    if (!liveUpdater) return { ok: false, reason: 'disabled' }
    const r = await autoUpdater.checkForUpdates()
    return { ok: true, updateInfo: r?.updateInfo ?? null }
  })

  ipcMain.handle('updater:install', async () => {
    if (!liveUpdater) return { ok: false, reason: 'disabled' }
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  })

  ipcMain.handle('updater:setChannel', async (_, ch: 'stable' | 'beta') => {
    channel = ch
    try {
      await getPrisma().setting.upsert({
        where: { key: 'app.updateChannel' },
        create: { key: 'app.updateChannel', value: ch },
        update: { value: ch }
      })
    } catch {
      /* */
    }
    if (liveUpdater) {
      autoUpdater.channel = ch === 'beta' ? 'beta' : 'latest'
    }
    return { ok: true }
  })
}

export async function initAutoUpdater(): Promise<void> {
  if (liveUpdater) return
  if (!app.isPackaged) {
    logInfo('updater skipped (dev build)')
    return
  }
  const base = feedBaseUrl()
  if (!base) {
    logWarn('updater: set POS_UPDATE_URL to enable generic feed')
    return
  }

  try {
    const row = await getPrisma().setting.findUnique({ where: { key: 'app.updateChannel' } })
    if (row?.value === 'beta') channel = 'beta'
  } catch {
    /* */
  }

  liveUpdater = true
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.channel = channel === 'beta' ? 'beta' : 'latest'
  autoUpdater.setFeedURL({ provider: 'generic', url: `${base}/` })

  autoUpdater.on('update-available', (info) => {
    logInfo('update available', { version: info.version })
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('updater:status', { state: 'available', version: info.version })
    }
  })
  autoUpdater.on('update-downloaded', (info) => {
    logInfo('update downloaded', { version: info.version })
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('updater:status', { state: 'downloaded', version: info.version })
    }
  })
  autoUpdater.on('error', (err) => logError('updater', err.message))

  void autoUpdater.checkForUpdates().catch((e) => logWarn('initial update check', String(e)))
}
