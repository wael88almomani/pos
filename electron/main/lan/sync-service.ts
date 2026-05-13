import { getPrisma } from '../database'
import { appendOfflineEvent } from '../offline-queue'
import { logInfo } from '../logger'
import { mergeLwwJson } from '../conflict-resolution'

export type SyncEnvelope = { type: string; entity?: string; entityId?: string; payload: Record<string, unknown>; updatedAt: number }

/** تسجيل حدث مزامنة في SQLite + ملف outbox للتوسعة لاحقًا */
export async function logSyncEvent(deviceId: string, direction: string, eventType: string, payload: unknown): Promise<void> {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  appendOfflineEvent({ type: eventType, entity: direction, entityId: deviceId, data: payload })
  try {
    await getPrisma().lanSyncEvent.create({
      data: {
        deviceId,
        direction,
        eventType,
        payload: body,
        status: 'logged'
      }
    })
    logInfo('lan sync event', { eventType, direction })
  } catch {
    /* db may be migrating */
  }
}

export function resolveDocumentConflict<T extends Record<string, unknown>>(local: T, remote: T, localTs: number, remoteTs: number): T {
  return mergeLwwJson(local, remote, localTs, remoteTs)
}

/** إعادة محاولة بسيطة: يحدّث الحالة للسجلات الفاشلة (جاهز لربط شبكة حقيقية) */
export async function bumpRetryForPending(): Promise<number> {
  const p = getPrisma()
  const pending = await p.lanSyncEvent.findMany({ where: { status: 'pending' }, take: 50 })
  for (const row of pending) {
    await p.lanSyncEvent.update({
      where: { id: row.id },
      data: { retryCount: { increment: 1 }, status: 'retry', error: null }
    })
  }
  return pending.length
}
