import { readFileSync, statSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

const SQLITE_MAGIC = Buffer.from('SQLite format 3\0')

export function isSqliteDatabaseFile(absPath: string): { ok: boolean; reason?: string } {
  try {
    const st = statSync(absPath)
    if (!st.isFile() || st.size < 100) return { ok: false, reason: 'file_too_small' }
    const head = readFileSync(absPath).subarray(0, 16)
    if (!head.equals(SQLITE_MAGIC)) return { ok: false, reason: 'invalid_sqlite_header' }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

/** Opens the DB file read-only via Prisma and runs PRAGMA integrity_check. */
export async function checkSqliteIntegrityAtPath(absPath: string): Promise<{ ok: boolean; message: string }> {
  const header = isSqliteDatabaseFile(absPath)
  if (!header.ok) return { ok: false, message: header.reason ?? 'bad_file' }

  const url = `file:${absPath.replace(/\\/g, '/')}?mode=ro`
  const client = new PrismaClient({
    datasources: { db: { url } },
    log: []
  })
  try {
    const rows = await client.$queryRawUnsafe<Array<{ integrity_check: string }>>(`PRAGMA integrity_check`)
    const msg = rows[0]?.integrity_check ?? 'unknown'
    await client.$disconnect()
    if (msg !== 'ok') return { ok: false, message: msg }
    return { ok: true, message: 'ok' }
  } catch (e) {
    await client.$disconnect().catch(() => {})
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function checkActiveDatabaseIntegrity(
  queryRaw: (sql: string) => Promise<Array<{ integrity_check: string }>>
): Promise<{ ok: boolean; message: string }> {
  try {
    const rows = await queryRaw(`PRAGMA integrity_check`)
    const msg = rows[0]?.integrity_check ?? 'unknown'
    if (msg !== 'ok') return { ok: false, message: msg }
    return { ok: true, message: 'ok' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
