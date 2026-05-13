import { randomUUID } from 'node:crypto'
import { getPrisma } from './database'

const KEY = 'app.deviceId'

export async function getOrCreateDeviceId(): Promise<string> {
  const p = getPrisma()
  const row = await p.setting.findUnique({ where: { key: KEY } })
  if (row?.value?.trim()) return row.value.trim()
  const id = randomUUID()
  await p.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: id },
    update: { value: id }
  })
  return id
}
