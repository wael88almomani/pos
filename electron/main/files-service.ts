import { app, protocol } from 'electron'
import { existsSync, mkdirSync, copyFileSync, unlinkSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { logInfo, logWarn } from './logger'

/** ضغط اختياري عبر sharp عند التوفر */
export async function maybeCompressImageAtPath(absPath: string): Promise<void> {
  try {
    const sharpMod = await import('sharp')
    const sharp = sharpMod.default
    const lower = absPath.toLowerCase()
    const img = sharp(absPath).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    const buf = lower.endsWith('.png')
      ? await img.png({ quality: 85, compressionLevel: 9 }).toBuffer()
      : await img.jpeg({ quality: 82 }).toBuffer()
    writeFileSync(absPath, buf)
  } catch (e) {
    logWarn('image compress skipped', String(e))
  }
}

export function uploadsRoot(): string {
  const root = join(app.getPath('userData'), 'uploads')
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  return root
}

function safeAbsoluteForRelative(rel: string): string | null {
  const n = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (n.includes('..') || !n.startsWith('expenses/')) return null
  const root = resolve(uploadsRoot())
  const abs = resolve(join(root, ...n.split('/')))
  if (!abs.startsWith(root)) return null
  return abs
}

export function registerPosAssetProtocol(): void {
  protocol.registerFileProtocol('pos-asset', (request, callback) => {
    try {
      const raw = request.url.replace(/^pos-asset:\/+/, '')
      const decoded = decodeURIComponent(raw)
      const abs = safeAbsoluteForRelative(decoded)
      if (!abs || !existsSync(abs)) {
        callback({ error: -6 })
        return
      }
      callback({ path: abs })
    } catch {
      callback({ error: -2 })
    }
  })
}

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024

export function saveExpenseReceiptFromPath(sourcePath: string): { ok: true; relativePath: string } | { ok: false; error: string } {
  try {
    const st = statSync(sourcePath)
    if (!st.isFile() || st.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'file_too_large' }
    const destDir = join(uploadsRoot(), 'expenses')
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
    const ext = sourcePath.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/)?.[1] ?? 'jpg'
    const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    const dest = join(destDir, name)
    copyFileSync(sourcePath, dest)
    void maybeCompressImageAtPath(dest).catch(() => null)
    const rel = `expenses/${name}`
    logInfo('expense receipt saved', { rel })
    return { ok: true, relativePath: rel }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function saveExpenseReceiptFromBuffer(
  buf: Buffer,
  ext: string
): { ok: true; relativePath: string } | { ok: false; error: string } {
  try {
    if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, error: 'file_too_large' }
    const destDir = join(uploadsRoot(), 'expenses')
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
    const safeExt = (ext || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'jpg'
    const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${safeExt}`
    const dest = join(destDir, name)
    writeFileSync(dest, buf)
    const rel = `expenses/${name}`
    return { ok: true, relativePath: rel }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function deleteUploadRelative(rel: string): { ok: boolean; error?: string } {
  const abs = safeAbsoluteForRelative(rel.replace(/\\/g, '/'))
  if (!abs) return { ok: false, error: 'bad_path' }
  try {
    if (existsSync(abs)) unlinkSync(abs)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
