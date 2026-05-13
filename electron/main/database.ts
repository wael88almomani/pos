import { PrismaClient, type Prisma } from '@prisma/client'
import { app } from 'electron'
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { logWarn } from './logger'

let prisma: PrismaClient | null = null
let queryListenerAttached = false

export function getDbPath(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    const dir = join(process.cwd(), 'prisma')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return join(dir, 'dev.db')
  }
  const dir = app.getPath('userData')
  return join(dir, 'pos.db')
}

export function getPrisma(): PrismaClient {
  if (prisma) return prisma
  const dbPath = getDbPath()
  const url = `file:${dbPath.replace(/\\/g, '/')}`
  process.env.DATABASE_URL = url
  const slowSql = process.env.POS_SLOW_SQL === '1' || process.env.POS_SLOW_SQL === 'true'
  prisma = new PrismaClient({
    log: slowSql
      ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
      : app.isPackaged
        ? ['error']
        : ['warn', 'error']
  })
  if (slowSql && !queryListenerAttached) {
    queryListenerAttached = true
    prisma.$on('query' as never, (e: { duration: number; query: string; params: string }) => {
      if (e.duration < 280) return
      logWarn('slow_sql', { ms: e.duration, q: e.query.slice(0, 500), params: String(e.params ?? '').slice(0, 240) })
    })
  }
  return prisma
}

/** طرق دفع يجب أن تظل متوفرة حتى لو لم يُشغَّل seed بعد ترحيل أو نسخ قاعدة قديمة */
export async function ensureBuiltInPaymentMethods(): Promise<void> {
  const p = getPrisma()
  await p.paymentMethod.upsert({
    where: { code: 'credit' },
    update: { nameAr: 'آجل / ذمة', isActive: true, sortOrder: 8 },
    create: { code: 'credit', nameAr: 'آجل / ذمة', sortOrder: 8, isActive: true }
  })
}

export async function initDatabase(): Promise<void> {
  const dir = dirname(getDbPath())
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const client = getPrisma()
  // SQLite يُرجع صفوفًا لبعض أوامر PRAGMA — يجب استخدام query وليس execute
  await client.$queryRawUnsafe(`PRAGMA journal_mode = WAL`)
  await client.$queryRawUnsafe(`PRAGMA synchronous = NORMAL`)
  await client.$queryRawUnsafe(`PRAGMA foreign_keys = ON`)
  const integrity = await client.$queryRawUnsafe<Array<{ integrity_check: string }>>(`PRAGMA integrity_check`)
  const msg = integrity[0]?.integrity_check
  if (msg && msg !== 'ok') {
    console.error('[database] integrity_check failed:', msg)
  }
  try {
    await ensureBuiltInPaymentMethods()
  } catch (e) {
    console.error('[database] ensureBuiltInPaymentMethods failed:', e)
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect()
    prisma = null
  }
}

export function copyDatabaseFile(destPath: string): void {
  const src = getDbPath()
  copyFileSync(src, destPath)
}

/** إعادة محاولة المعاملات عند ازدحام SQLite (P2034 / SQLITE_BUSY) */
export async function runTransactionWithRetry<T>(
  run: (tx: Prisma.TransactionClient) => Promise<T>,
  opts?: { attempts?: number }
): Promise<T> {
  const p = getPrisma()
  const attempts = Math.max(1, Math.min(opts?.attempts ?? 5, 12))
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await p.$transaction(run, { maxWait: 8000, timeout: 30_000 })
    } catch (e) {
      last = e
      const m = e instanceof Error ? e.message : String(e)
      const busy = m.includes('SQLITE_BUSY') || m.includes('P2034') || m.includes('database is locked')
      if (!busy) throw e
      await new Promise((r) => setTimeout(r, 40 * Math.pow(2, i)))
    }
  }
  throw last
}
