import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { format } from 'date-fns'

let logDir: string | null = null

function ensureDir(): string {
  if (logDir) return logDir
  logDir = join(app.getPath('userData'), 'logs')
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
  return logDir
}

function line(level: string, msg: string, meta?: unknown): string {
  const ts = format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS')
  const extra = meta !== undefined ? ` ${typeof meta === 'string' ? meta : JSON.stringify(meta)}` : ''
  return `[${ts}] [${level}] ${msg}${extra}\n`
}

export function logInfo(msg: string, meta?: unknown): void {
  const l = line('INFO', msg, meta)
  console.info(l.trim())
  try {
    appendFileSync(join(ensureDir(), `pos-${format(new Date(), 'yyyy-MM-dd')}.log`), l)
  } catch {
    /* ignore disk errors */
  }
}

export function logWarn(msg: string, meta?: unknown): void {
  const l = line('WARN', msg, meta)
  console.warn(l.trim())
  try {
    appendFileSync(join(ensureDir(), `pos-${format(new Date(), 'yyyy-MM-dd')}.log`), l)
  } catch {
    /* ignore */
  }
}

export function logError(msg: string, meta?: unknown): void {
  const l = line('ERROR', msg, meta)
  console.error(l.trim())
  try {
    appendFileSync(join(ensureDir(), `pos-${format(new Date(), 'yyyy-MM-dd')}.log`), l)
    appendFileSync(join(ensureDir(), 'errors.log'), l)
  } catch {
    /* ignore */
  }
}

export function installProcessLogging(): void {
  process.on('uncaughtException', (err) => {
    logError('uncaughtException', { message: err.message, stack: err.stack })
  })
  process.on('unhandledRejection', (reason) => {
    logError('unhandledRejection', reason instanceof Error ? reason.message : String(reason))
  })
}
