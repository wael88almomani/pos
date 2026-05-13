import { app, BrowserWindow, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { initDatabase, getPrisma } from './database'
import { registerIpcHandlers } from './ipc'
import { runBackup, startPeriodicBackup } from './backup'
import { installProcessLogging, logInfo, logWarn } from './logger'
import { registerPosAssetProtocol } from './files-service'
import { startDatabaseMaintenance } from './db-maintenance'
import { initAutoUpdater } from './updater-service'
import { startLanDiscovery, stopLanDiscovery } from './lan/lan-discovery'
import { bumpRetryForPending } from './lan/sync-service'
import { getOrCreateDeviceId } from './device-id'

installProcessLogging()

const isDev = !app.isPackaged

function getPreloadPath(): string {
  const candidates = [
    resolve(__dirname, '../preload/index.mjs'),
    resolve(__dirname, '../preload/index.js'),
    resolve(process.cwd(), 'out/preload/index.mjs'),
    resolve(process.cwd(), 'out/preload/index.js')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  logWarn('preload script not found on disk', { tried: candidates })
  return candidates[0]
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'Supermarket POS',
    webPreferences: {
      preload: getPreloadPath(),
      /** false: يضمن تحميل preload + contextBridge بثبات مع electron-vite وlocalhost (راجع docs Electron sandbox) */
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.webContents.on('preload-error', (_ev, path, err) => {
    logWarn('preload-error', { path, message: err?.message ?? String(err) })
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.supermarket.pos')
  }

  registerPosAssetProtocol()

  try {
    await initDatabase()
    logInfo('database ready', { db: 'sqlite' })
  } catch (e) {
    console.error('initDatabase failed', e)
  }
  registerIpcHandlers()
  startPeriodicBackup()
  startDatabaseMaintenance(() => getPrisma())
  await initAutoUpdater()
  void getOrCreateDeviceId().then((id) => startLanDiscovery(id))
  setInterval(() => void bumpRetryForPending(), 120_000)

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopLanDiscovery()
  void runBackup('إغلاق البرنامج')
})
