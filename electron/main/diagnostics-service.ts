import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { getPrisma, getDbPath } from './database'
import { resolveBackupDir } from './backup'
import { loadHardwareConfig } from './hardware-settings'

export type DiagnosticsReport = {
  generatedAt: string
  app: { packaged: boolean; version: string; userData: string }
  database: {
    path: string
    integrity: string
    journalMode: string | null
    pageCount: number | null
    freelistCount: number | null
  }
  backups: { dir: string; count: number; newestMtime: number | null }
  offlineQueue: { outboxLines: number }
  hardware: {
    receiptMode: string
    mockHardwareMode: boolean
    posHardwareMockEnv: boolean
  }
  memory: { rssMb: number; heapUsedMb: number }
}

export async function collectDiagnostics(): Promise<DiagnosticsReport> {
  const p = getPrisma()
  const integrity = await p.$queryRawUnsafe<Array<{ integrity_check: string }>>(`PRAGMA integrity_check`)
  const jm = await p.$queryRawUnsafe<Array<{ journal_mode: string }>>(`PRAGMA journal_mode`)
  const pc = await p.$queryRawUnsafe<Array<{ page_count: number }>>(`PRAGMA page_count`)
  const fc = await p.$queryRawUnsafe<Array<{ freelist_count: number }>>(`PRAGMA freelist_count`)

  const backupDir = await resolveBackupDir()
  let backupCount = 0
  let newestMtime: number | null = null
  if (existsSync(backupDir)) {
    const files = readdirSync(backupDir).filter((f) => f.startsWith('backup_') && f.endsWith('.db'))
    backupCount = files.length
    for (const name of files) {
      const st = statSync(join(backupDir, name))
      newestMtime = newestMtime == null ? st.mtimeMs : Math.max(newestMtime, st.mtimeMs)
    }
  }

  const outbox = join(app.getPath('userData'), 'sync-prep', 'outbox.jsonl')
  let outboxLines = 0
  if (existsSync(outbox)) {
    const raw = readFileSync(outbox, 'utf8')
    outboxLines = raw ? raw.split('\n').filter((l) => l.trim()).length : 0
  }

  const hw = await loadHardwareConfig()
  const mem = process.memoryUsage()

  return {
    generatedAt: new Date().toISOString(),
    app: {
      packaged: app.isPackaged,
      version: app.getVersion(),
      userData: app.getPath('userData')
    },
    database: {
      path: getDbPath(),
      integrity: integrity[0]?.integrity_check ?? 'unknown',
      journalMode: jm[0]?.journal_mode ?? null,
      pageCount: pc[0]?.page_count ?? null,
      freelistCount: fc[0]?.freelist_count ?? null
    },
    backups: { dir: backupDir, count: backupCount, newestMtime },
    offlineQueue: { outboxLines },
    hardware: {
      receiptMode: hw.receiptMode,
      mockHardwareMode: Boolean(hw.mockHardwareMode),
      posHardwareMockEnv: process.env.POS_HARDWARE_MOCK === '1' || process.env.POS_HARDWARE_MOCK === 'true'
    },
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024)
    }
  }
}
