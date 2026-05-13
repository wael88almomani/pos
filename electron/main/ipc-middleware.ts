import type { ZodType } from 'zod'
import { formatValidationForClient } from '../../lib/ipc/schemas'

export type IpcFail = { ok: false; code: 'VALIDATION'; message: string }

export function parseIpc<T>(schema: ZodType<T>, payload: unknown): { ok: true; data: T } | IpcFail {
  const r = schema.safeParse(payload)
  if (!r.success) {
    return { ok: false, code: 'VALIDATION', message: formatValidationForClient(r.error.issues) }
  }
  return { ok: true, data: r.data }
}
