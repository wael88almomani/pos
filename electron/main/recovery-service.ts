import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_AGE_MS = 72 * 60 * 60 * 1000

export type CartSnapshot = {
  lines: { productId: string; name: string; quantity: number; unitPrice: number; discount: number }[]
  cartDiscount: number
  savedAt: number
}

function dir(): string {
  const d = join(app.getPath('userData'), 'recovery')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function path(): string {
  return join(dir(), 'cart.json')
}

function logPath(): string {
  return join(dir(), 'activity.log')
}

function logLine(kind: string, detail: Record<string, unknown>): void {
  try {
    const line = JSON.stringify({ ts: Date.now(), kind, ...detail }) + '\n'
    appendFileSync(logPath(), line, 'utf8')
  } catch {
    /* non-fatal */
  }
}

export function saveCartSnapshot(snap: Omit<CartSnapshot, 'savedAt'>): void {
  const full: CartSnapshot = { ...snap, savedAt: Date.now() }
  writeFileSync(path(), JSON.stringify(full), 'utf8')
  logLine('cart_save', { lines: full.lines.length, cartDiscount: full.cartDiscount })
}

export function loadCartSnapshot(): CartSnapshot | null {
  try {
    const p = path()
    if (!existsSync(p)) return null
    const raw = JSON.parse(readFileSync(p, 'utf8')) as CartSnapshot
    if (Date.now() - raw.savedAt > MAX_AGE_MS) return null
    if (!Array.isArray(raw.lines)) return null
    logLine('cart_load', { lines: raw.lines.length })
    return raw
  } catch {
    return null
  }
}

export function clearCartSnapshot(): void {
  try {
    const p = path()
    if (existsSync(p)) {
      writeFileSync(p, '{}', 'utf8')
      logLine('cart_clear', {})
    }
  } catch {
    /* */
  }
}
