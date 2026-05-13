import { safeStorage, app } from 'electron'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { logWarn } from './logger'

const ALGO = 'aes-256-gcm'
const KEY_FILE = 'vault-material.bin'

function keyDir(): string {
  const d = join(app.getPath('userData'), '.secrets')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function deriveFallbackKey(): Buffer {
  const p = join(keyDir(), KEY_FILE)
  if (existsSync(p)) return readFileSync(p)
  const k = randomBytes(32)
  writeFileSync(p, k)
  return k
}

/** تشفير نص حساس للتخزين في الإعدادات أو الملفات المحلية */
export function sealSecret(plain: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    const buf = safeStorage.encryptString(plain)
    return `ss:${buf.toString('base64')}`
  }
  logWarn('crypto: safeStorage غير متاح — استخدام AES محلي')
  const key = deriveFallbackKey()
  const iv = randomBytes(12)
  const c = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final(), c.getAuthTag()])
  return `aes:${iv.toString('base64')}:${enc.toString('base64')}`
}

export function openSecret(sealed: string): string | null {
  try {
    if (sealed.startsWith('ss:')) {
      if (!safeStorage.isEncryptionAvailable()) return null
      const buf = Buffer.from(sealed.slice(3), 'base64')
      return safeStorage.decryptString(buf as Buffer)
    }
    if (sealed.startsWith('aes:')) {
      const rest = sealed.slice(4)
      const [ivB64, encB64] = rest.split(':')
      const iv = Buffer.from(ivB64, 'base64')
      const data = Buffer.from(encB64, 'base64')
      const tag = data.subarray(data.length - 16)
      const payload = data.subarray(0, data.length - 16)
      const key = deriveFallbackKey()
      const d = createDecipheriv(ALGO, key, iv)
      d.setAuthTag(tag)
      return Buffer.concat([d.update(payload), d.final()]).toString('utf8')
    }
    return null
  } catch {
    return null
  }
}
