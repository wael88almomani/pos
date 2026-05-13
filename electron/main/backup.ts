import { app, Notification } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { format } from 'date-fns'
import { copyDatabaseFile, disconnectDatabase, getDbPath, getPrisma } from './database'
import { checkSqliteIntegrityAtPath } from './sqlite-integrity'
import { logError, logInfo } from './logger'

const MAX_BACKUPS = 30

function defaultBackupDir(): string {
  return 'D:/backup'
}

export async function resolveBackupDir(): Promise<string> {
  const p = getPrisma()
  const row = await p.setting.findUnique({ where: { key: 'backup.path' } })
  const dir = row?.value?.trim() || defaultBackupDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export async function runBackup(reason: string): Promise<string | null> {
  try {
    const client = getPrisma()
    await client.$queryRawUnsafe(`PRAGMA wal_checkpoint(TRUNCATE)`)
    const dir = await resolveBackupDir()
    const name = `backup_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.db`
    const dest = join(dir, name)
    copyDatabaseFile(dest)
    pruneOldBackups(dir)
    if (Notification.isSupported()) {
      new Notification({
        title: 'نسخ احتياطي',
        body: `تم الحفظ: ${name} (${reason})`
      }).show()
    }
    return dest
  } catch (e) {
    console.error('backup failed', e)
    return null
  }
}

function pruneOldBackups(dir: string): void {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('backup_') && f.endsWith('.db'))
    .map((f) => {
      const full = join(dir, f)
      return { full, mtime: statSync(full).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
  const overflow = files.slice(MAX_BACKUPS)
  for (const f of overflow) {
    try {
      unlinkSync(f.full)
    } catch {
      /* ignore */
    }
  }
}

export async function listBackups(): Promise<{ path: string; name: string; mtime: number }[]> {
  const dir = await resolveBackupDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.startsWith('backup_') && f.endsWith('.db'))
    .map((name) => {
      const full = join(dir, name)
      return { path: full, name, mtime: statSync(full).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

export async function restoreBackup(filePath: string): Promise<boolean> {
  const chk = await checkSqliteIntegrityAtPath(filePath)
  if (!chk.ok) {
    logError('restore rejected: backup integrity failed', chk.message)
    throw new Error(`BACKUP_INVALID:${chk.message}`)
  }
  logInfo('restore: integrity ok, applying file')
  const target = getDbPath()
  await disconnectDatabase()
  copyFileSync(filePath, target)
  app.relaunch()
  app.exit(0)
  return true
}

let interval: ReturnType<typeof setInterval> | null = null

export function startPeriodicBackup(): void {
  if (interval) clearInterval(interval)
  interval = setInterval(
    () => {
      void runBackup('دوري كل 12 ساعة')
    },
    12 * 60 * 60 * 1000
  )
}
