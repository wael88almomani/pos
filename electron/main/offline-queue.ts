import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { logInfo } from './logger'

/** Append-only local queue for future LAN / multi-register sync (no cloud). */
export function appendOfflineEvent(payload: { type: string; entity?: string; entityId?: string; data?: unknown }): void {
  try {
    const dir = join(app.getPath('userData'), 'sync-prep')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const line = JSON.stringify({ ...payload, ts: Date.now() }) + '\n'
    appendFileSync(join(dir, 'outbox.jsonl'), line, { encoding: 'utf8' })
    logInfo('offline_queue append', { type: payload.type })
  } catch {
    /* non-fatal */
  }
}
