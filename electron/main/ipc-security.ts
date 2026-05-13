import type { z } from 'zod'
import { salesCreateSchema } from '../../lib/ipc/schemas'
import { parseIpc } from './ipc-middleware'
import { logWarn } from './logger'

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/** حد بسيط لكل قناة IPC لكل مستخدم (منع الضغط العرضي) */
export function ipcRateHit(channel: string, userKey: string, limit = 80, windowMs = 10_000): boolean {
  const k = `${channel}:${userKey}`
  const now = Date.now()
  const b = buckets.get(k) ?? { count: 0, resetAt: now + windowMs }
  if (now > b.resetAt) {
    b.count = 0
    b.resetAt = now + windowMs
  }
  b.count += 1
  buckets.set(k, b)
  if (b.count > limit) {
    logWarn('ipc rate limit', { channel, userKey })
    return true
  }
  return false
}

export function validateSalesCreatePayload(
  payload: unknown
): { ok: true; data: z.infer<typeof salesCreateSchema> } | { ok: false; error: string } {
  const r = parseIpc(salesCreateSchema, payload)
  if (!r.ok) return { ok: false, error: r.message }
  return { ok: true, data: r.data }
}
