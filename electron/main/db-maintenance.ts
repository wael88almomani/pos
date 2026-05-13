import type { PrismaClient } from '@prisma/client'
import { logError, logInfo } from './logger'

export function startDatabaseMaintenance(getClient: () => PrismaClient): void {
  const runIntegrity = async () => {
    try {
      const c = getClient()
      const rows = await c.$queryRawUnsafe<Array<{ integrity_check: string }>>(`PRAGMA integrity_check`)
      const msg = rows[0]?.integrity_check
      if (msg !== 'ok') logError('scheduled integrity_check failed', msg)
      else logInfo('scheduled integrity_check ok')
    } catch (e) {
      logError('integrity schedule', e)
    }
  }

  const runOptimize = async () => {
    try {
      const c = getClient()
      await c.$executeRawUnsafe(`PRAGMA optimize`)
      logInfo('PRAGMA optimize done')
    } catch (e) {
      logError('pragma optimize', e)
    }
  }

  const runVacuum = async () => {
    try {
      const c = getClient()
      await c.$executeRawUnsafe(`VACUUM`)
      logInfo('VACUUM completed')
    } catch (e) {
      logError('VACUUM', e)
    }
  }

  void runIntegrity()
  setInterval(() => void runIntegrity(), 24 * 60 * 60 * 1000)
  setInterval(() => void runOptimize(), 6 * 60 * 60 * 1000)
  setInterval(() => void runVacuum(), 7 * 24 * 60 * 60 * 1000)
}
