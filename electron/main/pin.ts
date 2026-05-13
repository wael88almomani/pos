import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex')
  const key = scryptSync(pin, salt, 64)
  return `${salt}:${key.toString('hex')}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hex] = stored.split(':')
  if (!salt || !hex) return false
  const key = scryptSync(pin, salt, 64)
  const expected = Buffer.from(hex, 'hex')
  if (key.length !== expected.length) return false
  return timingSafeEqual(key, expected)
}
