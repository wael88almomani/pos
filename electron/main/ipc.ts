import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { Decimal } from '@prisma/client/runtime/library'
import { verifyPin } from './pin'
import { getPrisma, runTransactionWithRetry } from './database'
import { listBackups, restoreBackup, runBackup } from './backup'
import { openCashDrawerPhysical, printSaleReceipt } from './hardware'
import { auth } from './auth-context'
import { mapProduct } from './mappers'
import { registerEnterpriseIpc } from './enterprise-ipc'
import { registerHardwareAndAuxIpc } from './hardware-ipc'
import { ipcRateHit, validateSalesCreatePayload } from './ipc-security'
import { registerUpdaterIpc } from './updater-service'
import { saveCartSnapshot, loadCartSnapshot, clearCartSnapshot } from './recovery-service'
import { sealSecret, openSecret } from './crypto-vault'
import { loadHardwareConfig } from './hardware-settings'
import { appendOfflineEvent } from './offline-queue'
import { sortProductsByQuery, type ProductSearchRow } from '../../lib/product-search-rank'
import {
  authLoginSchema,
  barcodeCodeSchema,
  productsListQuerySchema,
  productsCreateCategorySchema,
  productsSearchAdvancedSchema,
  recoveryCartSchema,
  salesHoldSchema,
  sessionCloseSchema,
  sessionOpenSchema,
  settingsKeySchema,
  settingsSetSchema,
  verifyPinInputSchema
} from '../../lib/ipc/schemas'
import { parseIpc } from './ipc-middleware'
import { collectDiagnostics } from './diagnostics-service'

function requireAuth(): string {
  if (!auth.userId) throw new Error('UNAUTHORIZED')
  return auth.userId
}

function requireSession(): string {
  requireAuth()
  if (!auth.sessionId) throw new Error('NO_SHIFT')
  return auth.sessionId
}

async function getEffectivePermissionCodes(userId: string): Promise<string[]> {
  const u = await getPrisma().user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      userPermissions: { include: { permission: true } } }
  })
  if (!u?.role) return []
  if (u.useCustomPermissions) {
    return u.userPermissions.map((x) => x.permission.code)
  }
  return u.role.permissions.map((rp) => rp.permission.code)
}

async function requirePermission(code: string): Promise<void> {
  const uid = requireAuth()
  const codes = await getEffectivePermissionCodes(uid)
  if (!codes.includes(code)) throw new Error(`FORBIDDEN:${code}`)
}

async function nextInvoiceNumber(): Promise<string> {
  const p = getPrisma()
  const count = await p.sale.count()
  return `INV-${String(count + 1).padStart(6, '0')}`
}

async function generateUniqueBarcode(): Promise<string> {
  const p = getPrisma()
  for (let i = 0; i < 50; i++) {
    const base = String(Math.floor(200000000000 + Math.random() * 799999999999))
    const chk = ean13CheckDigit(base.slice(0, 12))
    const candidate = base.slice(0, 12) + chk
    const exists =
      (await p.product.findFirst({ where: { barcode: candidate } })) ||
      (await p.productBarcode.findFirst({ where: { barcode: candidate } }))
    if (!exists) return candidate
  }
  throw new Error('BARCODE_GEN_FAILED')
}

function ean13CheckDigit(body12: string): string {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const n = Number(body12[i])
    sum += (i % 2 === 0 ? n : n * 3) as number
  }
  const mod = sum % 10
  return String((10 - mod) % 10)
}

function escapeTsvField(val: string | number | boolean): string {
  const s = typeof val === 'boolean' ? (val ? '1' : '0') : String(val ?? '')
  return s.replace(/\r?\n/g, ' ').replace(/\t/g, ' ')
}

function parseIntSafe(s: string | undefined, def = 0): number {
  const n = Number(String(s ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? Math.trunc(n) : def
}

function parseFloatSafe(s: string | undefined, def = 0): number {
  const n = Number(String(s ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : def
}

function parseBoolLoose(s: string | undefined, def: boolean): boolean {
  const t = String(s ?? '').trim().toLowerCase()
  if (!t) return def
  if (['1', 'true', 'yes', 'y', 'نعم', 'on'].includes(t)) return true
  if (['0', 'false', 'no', 'n', 'لا', 'off'].includes(t)) return false
  return def
}

export function registerIpcHandlers(): void {
  registerUpdaterIpc()

  ipcMain.handle('pos:ping', async () => ({ ok: true, t: Date.now() }))

  ipcMain.handle('auth:login', async (_, payload: unknown) => {
    try {
      const parsed = parseIpc(authLoginSchema, payload)
      if (!parsed.ok) return { ok: false, error: parsed.message, code: parsed.code }
      const body = parsed.data
      const p = getPrisma()
      const user = await p.user.findFirst({
        where: { username: body.username, deletedAt: null, isActive: true },
        include: {
          role: {
            include: { permissions: { include: { permission: true } } }
          },
          userPermissions: { include: { permission: true } }
        }
      })
      if (!user || !verifyPin(body.pin, user.pinHash)) {
        return { ok: false, error: 'بيانات الدخول غير صحيحة' }
      }
      if (!user.role) {
        return { ok: false, error: 'حساب المستخدم غير مكتمل (لا يوجد دور). أعد تشغيل seed أو أصلح قاعدة البيانات.' }
      }
      auth.userId = user.id
      await p.auditLog.create({
        data: { userId: user.id, action: 'login', entity: 'User', entityId: user.id }
      })
      const permissions = user.useCustomPermissions
        ? user.userPermissions.map((x) => x.permission.code)
        : user.role.permissions.map((rp) => rp.permission.code)
      return {
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role.name,
          roleCode: user.role.code,
          permissions
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: `خطأ في الخادم: ${msg}` }
    }
  })

  ipcMain.handle('auth:logout', async () => {
    const uid = auth.userId
    auth.userId = null
    auth.sessionId = null
    if (uid) {
      await getPrisma().auditLog.create({
        data: { userId: uid, action: 'logout', entity: 'User', entityId: uid }
      })
    }
    await runBackup('تسجيل خروج')
    return { ok: true }
  })

  ipcMain.handle('auth:verifyPin', async (_, pin: unknown) => {
    const pr = verifyPinInputSchema.safeParse(pin)
    if (!pr.success) return { ok: false }
    if (!auth.userId) return { ok: false }
    const u = await getPrisma().user.findUnique({ where: { id: auth.userId } })
    if (!u || !verifyPin(pr.data, u.pinHash)) return { ok: false }
    return { ok: true }
  })

  ipcMain.handle('auth:me', async () => {
    if (!auth.userId) return { ok: false }
    const p = getPrisma()
    const user = await p.user.findUnique({
      where: { id: auth.userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        userPermissions: { include: { permission: true } }
      }
    })
    if (!user) return { ok: false }
    const permissions = user.useCustomPermissions
      ? user.userPermissions.map((x) => x.permission.code)
      : user.role.permissions.map((rp) => rp.permission.code)
    return {
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role.name,
        roleCode: user.role.code,
        permissions
      },
      sessionId: auth.sessionId
    }
  })

  /** أسماء مستخدمين نشطة لقائمة تسجيل الدخول (بدون مصادقة — معدّل طلبات) */
  ipcMain.handle('auth:usernames', async () => {
    if (ipcRateHit('auth:usernames', 'login', 60, 60_000)) {
      return { ok: false, error: 'RATE_LIMIT' }
    }
    const rows = await getPrisma().user.findMany({
      where: { deletedAt: null, isActive: true },
      select: { username: true },
      orderBy: { username: 'asc' }
    })
    return { ok: true, items: rows.map((r) => r.username) }
  })

  ipcMain.handle('session:open', async (_, payload: unknown) => {
    const uid = requireAuth()
    const parsed = parseIpc(sessionOpenSchema, payload)
    if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message }
    const body = parsed.data
    const p = getPrisma()
    const open = await p.cashierSession.findFirst({
      where: { userId: uid, closedAt: null }
    })
    if (open) {
      auth.sessionId = open.id
      return { ok: true, sessionId: open.id, reused: true }
    }
    const s = await p.cashierSession.create({
      data: {
        userId: uid,
        deviceId: body.deviceId || 'desktop-1',
        openingCash: new Decimal(body.openingCash)
      }
    })
    auth.sessionId = s.id
    await requirePermission('shift.open')
    await p.auditLog.create({
      data: {
        userId: uid,
        action: 'shift_open',
        entity: 'CashierSession',
        entityId: s.id,
        meta: JSON.stringify({ openingCash: body.openingCash })
      }
    })
    return { ok: true, sessionId: s.id }
  })

  ipcMain.handle('session:current', async () => {
    const uid = auth.userId
    if (!uid) return { ok: false }
    const p = getPrisma()
    const s = await p.cashierSession.findFirst({
      where: { userId: uid, closedAt: null }
    })
    if (!s) {
      auth.sessionId = null
      return { ok: true, session: null }
    }
    auth.sessionId = s.id
    return {
      ok: true,
      session: {
        id: s.id,
        openedAt: s.openedAt.toISOString(),
        openingCash: Number(s.openingCash),
        deviceId: s.deviceId
      }
    }
  })

  /** ملخص مبيعات الشفت الحالي لشاشة البيع (يومية الكاشير) — يتطلب pos.sell وشفتًا مفتوحًا */
  ipcMain.handle('session:salesStats', async () => {
    try {
      await requirePermission('pos.sell')
      const sid = requireSession()
      const uid = requireAuth()
      const p = getPrisma()
      const session = await p.cashierSession.findFirst({
        where: { id: sid, userId: uid, closedAt: null }
      })
      if (!session) {
        return { ok: false as const, error: 'NO_SHIFT' as const }
      }

      const [completedAgg, cashAgg, cardAgg, mixedAgg, heldCount, top] = await Promise.all([
        p.sale.aggregate({
          where: { cashierSessionId: sid, deletedAt: null, status: 'completed' },
          _sum: { total: true }
        }),
        p.sale.aggregate({
          where: { cashierSessionId: sid, deletedAt: null, status: 'completed', paymentMethod: 'cash' },
          _sum: { total: true }
        }),
        p.sale.aggregate({
          where: { cashierSessionId: sid, deletedAt: null, status: 'completed', paymentMethod: 'card' },
          _sum: { total: true }
        }),
        p.sale.aggregate({
          where: { cashierSessionId: sid, deletedAt: null, status: 'completed', paymentMethod: 'mixed' },
          _sum: { total: true }
        }),
        p.sale.count({
          where: { cashierSessionId: sid, deletedAt: null, status: 'held' }
        }),
        p.saleItem.groupBy({
          by: ['productId'],
          where: { sale: { cashierSessionId: sid, deletedAt: null, status: 'completed' } },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 8
        })
      ])

      const invCount = await p.sale.count({
        where: { cashierSessionId: sid, deletedAt: null, status: 'completed' }
      })

      const products = await p.product.findMany({
        where: { id: { in: top.map((t) => t.productId) } }
      })
      const map = new Map(products.map((pr) => [pr.id, pr.name]))

      return {
        ok: true as const,
        stats: {
          openingCash: Number(session.openingCash),
          openedAt: session.openedAt.toISOString(),
          deviceId: session.deviceId,
          revenue: Number(completedAgg._sum.total ?? 0),
          invoices: invCount,
          cashSales: Number(cashAgg._sum.total ?? 0),
          cardSales: Number(cardAgg._sum.total ?? 0),
          mixedSales: Number(mixedAgg._sum.total ?? 0),
          heldInvoices: heldCount,
          topItems: top.map((t) => ({
            name: map.get(t.productId) ?? t.productId,
            qty: t._sum.quantity ?? 0
          }))
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'NO_SHIFT') return { ok: false as const, error: 'NO_SHIFT' as const }
      if (msg.startsWith('FORBIDDEN')) return { ok: false as const, error: 'FORBIDDEN' as const }
      if (msg === 'UNAUTHORIZED') return { ok: false as const, error: 'UNAUTHORIZED' as const }
      throw e
    }
  })

  ipcMain.handle('session:close', async (_, raw: unknown) => {
    const parsed = parseIpc(sessionCloseSchema, raw)
    if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message }
    const body = parsed.data
    await requirePermission('shift.close')
    const sid = requireSession()
    const uid = requireAuth()
    const p = getPrisma()
    const session = await p.cashierSession.findUnique({ where: { id: sid } })
    if (!session || session.closedAt) throw new Error('SESSION_INVALID')

    const openedAt = session.openedAt

    const cashSales = await p.sale.aggregate({
      where: {
        cashierSessionId: sid,
        deletedAt: null,
        status: 'completed',
        paymentMethod: 'cash'
      },
      _sum: { total: true }
    })
    const cardSales = await p.sale.aggregate({
      where: {
        cashierSessionId: sid,
        deletedAt: null,
        status: 'completed',
        paymentMethod: 'card'
      },
      _sum: { total: true }
    })
    const expenses = await p.expense.aggregate({
      where: { cashierSessionId: sid, deletedAt: null },
      _sum: { amount: true }
    })
    const returns = await p.return.aggregate({
      where: {
        deletedAt: null,
        createdAt: { gte: openedAt }
      },
      _sum: { refundTotal: true }
    })

    const opening = Number(session.openingCash)
    const cashTotal = Number(cashSales._sum.total ?? 0)
    const cardTotal = Number(cardSales._sum.total ?? 0)
    const expTotal = Number(expenses._sum.amount ?? 0)
    const retTotal = Number(returns._sum.refundTotal ?? 0)

    const expected = opening + cashTotal - expTotal - retTotal
    const actual = body.actualCash
    const variance = actual - expected

    const thresholdRow = await p.setting.findUnique({
      where: { key: 'shift.variance_pin_threshold' }
    })
    const threshold = Number(thresholdRow?.value ?? 100)
    const needsPin = Math.abs(variance) >= threshold

    if (needsPin) {
      if (!body.managerPin) {
        return {
          ok: false,
          code: 'MANAGER_PIN_REQUIRED',
          expected,
          variance
        }
      }
      const admin = await p.user.findFirst({
        where: { username: 'admin', deletedAt: null },
        include: { role: true }
      })
      if (!admin || !verifyPin(body.managerPin, admin.pinHash)) {
        return { ok: false, code: 'BAD_MANAGER_PIN' }
      }
    }

    await p.cashierSession.update({
      where: { id: sid },
      data: {
        closedAt: new Date(),
        closingCash: new Decimal(actual),
        expectedCash: new Decimal(expected),
        variance: new Decimal(variance),
        varianceNote: body.notes ?? null,
        varianceApproved: needsPin
      }
    })

    auth.sessionId = null

    await p.auditLog.create({
      data: {
        userId: uid,
        action: 'shift_close',
        entity: 'CashierSession',
        entityId: sid,
        meta: JSON.stringify({
          expected,
          actual,
          variance,
          cashTotal,
          cardTotal,
          expTotal,
          retTotal
        })
      }
    })

    await runBackup('إغلاق شفت')

    return {
      ok: true,
      summary: {
        opening,
        cashSales: cashTotal,
        cardSales: cardTotal,
        expenses: expTotal,
        returns: retTotal,
        expected,
        actual,
        variance
      }
    }
  })

  ipcMain.handle('barcode:lookup', async (_, code: unknown) => {
    requireAuth()
    const bc = barcodeCodeSchema.safeParse(code)
    if (!bc.success) return { ok: false }
    const p = getPrisma()
    const trimmed = bc.data
    const alias = await p.productBarcode.findFirst({
      where: { barcode: trimmed },
      include: { product: { include: { category: true, barcodes: true } } }
    })
    if (alias?.product && !alias.product.deletedAt) {
      return { ok: true, product: mapProduct(alias.product) }
    }
    const prod = await p.product.findFirst({
      where: { barcode: trimmed, deletedAt: null },
      include: { category: true, barcodes: true }
    })
    if (prod) return { ok: true, product: mapProduct(prod) }
    return { ok: false }
  })

  ipcMain.handle('products:list', async (_, q: unknown) => {
    requireAuth()
    const parsed = parseIpc(productsListQuerySchema, q ?? {})
    if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message }
    const query = parsed.data
    const p = getPrisma()
    const where: Record<string, unknown> = { deletedAt: null }
    if (query.categoryId === '__none__') where.categoryId = null
    else if (query.categoryId) where.categoryId = query.categoryId
    if (query.search?.trim()) {
      const s = query.search.trim()
      where.OR = [
        { name: { contains: s } },
        { shortName: { contains: s } },
        { barcode: { contains: s } },
        { barcodes: { some: { barcode: { contains: s } } } }
      ]
    }
    
    // حساب pagination
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 200
    const skip = (page - 1) * pageSize
    
    // جلب العدد الكلي للمنتجات
    const totalCount = await p.product.count({ where })
    
    // جلب البيانات مع pagination
    const items = await p.product.findMany({
      where,
      include: { category: true, barcodes: true },
      orderBy: { name: 'asc' },
      skip,
      take: pageSize
    })
    
    return { 
      ok: true, 
      items: items.map(mapProduct),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    }
  })

  ipcMain.handle('products:get', async (_, rawId: unknown) => {
    requireAuth()
    const id = typeof rawId === 'string' ? rawId.trim() : ''
    if (!id) return { ok: false as const, error: 'MISSING_ID' }
    const p = getPrisma()
    const product = await p.product.findFirst({
      where: { id, deletedAt: null },
      include: { category: true, barcodes: true }
    })
    if (!product) return { ok: false as const, error: 'NOT_FOUND' }
    return { ok: true as const, product: mapProduct(product) }
  })

  ipcMain.handle('products:searchAdvanced', async (_, q: unknown) => {
    requireAuth()
    const parsed = parseIpc(productsSearchAdvancedSchema, q)
    if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message }
    const query = parsed.data
    const p = getPrisma()
    const take = Math.min(query.limit ?? 80, 200)
    const raw = query.query.trim()
    if (!raw) {
      const recentIds = (query.recentProductIds ?? []).filter(Boolean).slice(0, 40)
      if (recentIds.length > 0) {
        const recent = await p.product.findMany({
          where: { id: { in: recentIds }, deletedAt: null },
          include: { category: true, barcodes: true }
        })
        const orderMap = new Map(recentIds.map((id, i) => [id, i]))
        recent.sort((a, b) => (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99))
        return { ok: true, items: recent.map(mapProduct), source: 'recent' as const }
      }
      const browse = await p.product.findMany({
        where: { deletedAt: null },
        include: { category: true, barcodes: true },
        orderBy: { name: 'asc' },
        take: 60
      })
      return { ok: true, items: browse.map(mapProduct), source: 'browse' as const }
    }
    const broad = await p.product.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: raw } },
          { shortName: { contains: raw } },
          { barcode: { contains: raw } },
          { barcodes: { some: { barcode: { contains: raw } } } }
        ]
      },
      include: { category: true, barcodes: true },
      take: 400
    })
    const rows: ProductSearchRow[] = broad.map((pr) => ({
      id: pr.id,
      name: pr.name,
      shortName: pr.shortName,
      barcode: pr.barcode,
      variantBarcodes: pr.barcodes.map((b) => b.barcode)
    }))
    const ranked = sortProductsByQuery(raw, rows).slice(0, take)
    const idOrder = new Map(ranked.map((r, i) => [r.id, i]))
    const sorted = [...broad].sort((a, b) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999))
    return { ok: true, items: sorted.map(mapProduct), source: 'search' as const }
  })

  ipcMain.handle('products:posGrid', async () => {
    requireAuth()
    const p = getPrisma()
    const items = await p.product.findMany({
      where: { deletedAt: null, showOnPos: true },
      include: { category: true, barcodes: true },
      orderBy: { name: 'asc' }
    })
    return { ok: true, items: items.map(mapProduct) }
  })

  ipcMain.handle('products:categories', async () => {
    requireAuth()
    const p = getPrisma()
    const cats = await p.category.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' }
    })
    return { ok: true, items: cats }
  })

  ipcMain.handle('products:createCategory', async (_, raw: unknown) => {
    await requirePermission('product.write')
    const parsed = parseIpc(productsCreateCategorySchema, raw ?? {})
    if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message }
    const p = getPrisma()
    const agg = await p.category.aggregate({
      where: { deletedAt: null },
      _max: { sortOrder: true }
    })
    const sortOrder = (agg._max.sortOrder ?? 0) + 1
    const cat = await p.category.create({
      data: { 
        name: parsed.data.name, 
        sortOrder,
        showOnPos: parsed.data.showOnPos ?? true 
      }
    })
    return { ok: true, item: { id: cat.id, name: cat.name } }
  })

  ipcMain.handle('products:generateBarcode', async () => {
    const code = await generateUniqueBarcode()
    return { ok: true, barcode: code }
  })

  ipcMain.handle(
    'products:save',
    async (
      _,
      payload: {
        id?: string
        name: string
        shortName?: string | null
        categoryId?: string | null
        barcode?: string | null
        purchasePrice: number
        salePrice: number
        quantity: number
        minStock: number
        expiryDate?: string | null
        showOnPos: boolean
        imagePath?: string | null
        averageCost?: number
        isWeighted?: boolean
        weightPrefix?: string | null
        barcodes?: { barcode: string; variantName?: string | null; isDefault?: boolean }[]
      }
    ) => {
      await requirePermission('product.write')
      const p = getPrisma()
      const expiryDate = payload.expiryDate ? new Date(payload.expiryDate) : null
      if (expiryDate && Number.isNaN(expiryDate.getTime())) {
        return { ok: false as const, error: 'INVALID_EXPIRY_DATE' }
      }
      const bars = payload.barcodes?.filter((b) => b.barcode.trim()) ?? []
      let mainBarcode = payload.barcode?.trim() || null
      if (!mainBarcode && bars.length === 0) {
        mainBarcode = await generateUniqueBarcode()
      }

      if (payload.id) {
        await p.productBarcode.deleteMany({ where: { productId: payload.id } })
        const barcodeRows = bars.length
          ? bars.map((b, idx) => ({
              barcode: b.barcode.trim(),
              variantName: b.variantName?.trim() || null,
              isDefault: b.isDefault ?? idx === 0
            }))
          : mainBarcode
            ? [{ barcode: mainBarcode, variantName: null, isDefault: true }]
            : []

        const product = await p.product.update({
          where: { id: payload.id },
          data: {
            name: payload.name,
            shortName: payload.shortName ?? null,
            categoryId: payload.categoryId ?? null,
            barcode: mainBarcode,
            purchasePrice: new Decimal(payload.purchasePrice),
            salePrice: new Decimal(payload.salePrice),
            quantity: payload.quantity,
            minStock: payload.minStock,
            expiryDate,
            showOnPos: payload.showOnPos,
            imagePath: payload.imagePath ?? null,
            averageCost: new Decimal(payload.averageCost ?? payload.purchasePrice),
            isWeighted: payload.isWeighted ?? false,
            weightPrefix: payload.weightPrefix?.trim() || null,
            barcodes: { create: barcodeRows }
          },
          include: { category: true, barcodes: true }
        })
        return { ok: true, product: mapProduct(product) }
      }

      const barcodeRows = bars.length
        ? bars.map((b, idx) => ({
            barcode: b.barcode.trim(),
            variantName: b.variantName?.trim() || null,
            isDefault: b.isDefault ?? idx === 0
          }))
        : [{ barcode: mainBarcode!, variantName: null, isDefault: true }]

      const product = await p.product.create({
        data: {
          name: payload.name,
          shortName: payload.shortName ?? null,
          categoryId: payload.categoryId ?? null,
          barcode: mainBarcode,
          purchasePrice: new Decimal(payload.purchasePrice),
          salePrice: new Decimal(payload.salePrice),
          quantity: payload.quantity,
          minStock: payload.minStock,
          expiryDate,
          showOnPos: payload.showOnPos,
          imagePath: payload.imagePath ?? null,
          averageCost: new Decimal(payload.averageCost ?? payload.purchasePrice),
          isWeighted: payload.isWeighted ?? false,
          weightPrefix: payload.weightPrefix?.trim() || null,
          barcodes: { create: barcodeRows }
        },
        include: { category: true, barcodes: true }
      })
      return { ok: true, product: mapProduct(product) }
    }
  )

  ipcMain.handle('products:exportStockTsv', async () => {
    requireAuth()
    await requirePermission('product.read')
    const p = getPrisma()
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return { ok: false as const, error: 'no_window' }
    const products = await p.product.findMany({
      where: { deletedAt: null },
      include: { category: true, barcodes: true },
      orderBy: { name: 'asc' },
      take: 15000
    })
    const header =
      'id\tname\tbarcode\tshortName\tcategoryName\tpurchasePrice\tsalePrice\tquantity\tminStock\tshowOnPos\tisWeighted\tweightPrefix\textraBarcodes'
    const rowLines = products.map((pr) => {
      const main = (pr.barcode ?? '').trim()
      const extras = pr.barcodes
        .filter((b) => b.barcode !== main)
        .map((b) => b.barcode)
        .join('|')
      const cells: (string | number)[] = [
        pr.id,
        pr.name,
        main,
        pr.shortName ?? '',
        pr.category?.name ?? '',
        Number(pr.purchasePrice),
        Number(pr.salePrice),
        pr.quantity,
        pr.minStock,
        pr.showOnPos ? 1 : 0,
        pr.isWeighted ? 1 : 0,
        pr.weightPrefix ?? '',
        extras
      ]
      return cells.map((c) => escapeTsvField(c)).join('\t')
    })
    const body = `\uFEFF${header}\n${rowLines.join('\n')}\n`
    const r = await dialog.showSaveDialog(win, {
      title: 'تصدير المنتجات (مستودع)',
      defaultPath: `products-${new Date().toISOString().slice(0, 10)}.tsv`,
      filters: [{ name: 'TSV', extensions: ['tsv', 'txt'] }]
    })
    if (r.canceled || !r.filePath) return { ok: false as const, canceled: true as const }
    writeFileSync(r.filePath, body, 'utf8')
    return { ok: true as const, path: r.filePath }
  })

  ipcMain.handle('products:importStockTsv', async () => {
    await requirePermission('product.write')
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return { ok: false as const, error: 'no_window' }
    const pick = await dialog.showOpenDialog(win, {
      title: 'استيراد المنتجات (مستودع)',
      properties: ['openFile'],
      filters: [{ name: 'TSV/CSV', extensions: ['tsv', 'txt', 'csv'] }]
    })
    if (pick.canceled || !pick.filePaths[0]) return { ok: false as const, canceled: true as const }

    const raw = readFileSync(pick.filePaths[0], 'utf8')
    const text = raw.replace(/^\uFEFF/, '')
    const rawLines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ''))
    const allLines = rawLines.filter((l) => l.length > 0)
    if (allLines.length < 2) return { ok: false as const, error: 'EMPTY_FILE' }

    const delim = allLines[0]!.includes('\t') ? '\t' : ','
    const headerCells = allLines[0]!.split(delim).map((h) => h.replace(/^\uFEFF/, '').trim().toLowerCase())
    const col = (name: string) => headerCells.indexOf(name.toLowerCase())
    const iName = col('name')
    if (iName < 0) return { ok: false as const, error: 'MISSING_NAME_COLUMN' }
    const iId = col('id')
    const iBarcode = col('barcode')
    const iShort = col('shortname')
    const iCat = col('categoryname')
    const iPur = col('purchaseprice')
    const iSale = col('saleprice')
    const iQty = col('quantity')
    const iMin = col('minstock')
    const iShow = col('showonpos')
    const iW = col('isweighted')
    const iWp = col('weightprefix')
    const iExtra = col('extrabarcodes')

    const p = getPrisma()
    const errors: string[] = []
    let created = 0
    let updated = 0

    const cell = (parts: string[], idx: number) => (idx >= 0 ? (parts[idx] ?? '').trim() : '')

    async function resolveCategoryId(catName: string): Promise<string | null> {
      const n = catName.trim()
      if (!n) return null
      const found = await p.category.findFirst({ where: { name: n, deletedAt: null } })
      if (found) return found.id
      const agg = await p.category.aggregate({ where: { deletedAt: null }, _max: { sortOrder: true } })
      const sortOrder = (agg._max.sortOrder ?? 0) + 1
      const c = await p.category.create({ data: { name: n, sortOrder } })
      return c.id
    }

    async function findProductForRow(parts: string[], lookupBarcode: string) {
      const idVal = iId >= 0 ? cell(parts, iId) : ''
      if (idVal.length >= 20) {
        const byId = await p.product.findFirst({
          where: { id: idVal, deletedAt: null },
          include: { barcodes: true, category: true }
        })
        if (byId) return byId
      }
      const bc = lookupBarcode.trim()
      if (bc) {
        const alias = await p.productBarcode.findFirst({
          where: { barcode: bc },
          include: { product: { include: { barcodes: true, category: true } } }
        })
        if (alias?.product && !alias.product.deletedAt) return alias.product
        const byMain = await p.product.findFirst({
          where: { barcode: bc, deletedAt: null },
          include: { barcodes: true, category: true }
        })
        if (byMain) return byMain
      }
      return null
    }

    const dataRows = allLines.slice(1)
    for (let ri = 0; ri < dataRows.length; ri++) {
      const line = dataRows[ri]!
      const parts = line.split(delim)
      const name = cell(parts, iName)
      if (!name) continue

      const shortName = iShort >= 0 ? cell(parts, iShort) || null : null
      const catName = iCat >= 0 ? cell(parts, iCat) : ''
      const purchasePrice = parseFloatSafe(iPur >= 0 ? parts[iPur!] : undefined, 0)
      const salePrice = parseFloatSafe(iSale >= 0 ? parts[iSale!] : undefined, 0)
      const quantity = parseIntSafe(iQty >= 0 ? parts[iQty!] : undefined, 0)
      const minStock = parseIntSafe(iMin >= 0 ? parts[iMin!] : undefined, 0)
      const showOnPos = parseBoolLoose(iShow >= 0 ? parts[iShow!] : undefined, true)
      const isWeighted = parseBoolLoose(iW >= 0 ? parts[iW!] : undefined, false)
      const weightPrefix = iWp >= 0 ? cell(parts, iWp) || null : null
      const extraRaw = iExtra >= 0 ? cell(parts, iExtra) : ''
      const extras = extraRaw
        ? extraRaw
            .split('|')
            .map((x) => x.trim())
            .filter(Boolean)
        : []

      let mainBarcode = iBarcode >= 0 ? cell(parts, iBarcode) : ''
      if (!mainBarcode && extras.length > 0) mainBarcode = extras[0]!
      const uniqueExtras = [...new Set(extras.filter((b) => b && b !== mainBarcode))]

      let categoryId: string | null = null
      try {
        categoryId = await resolveCategoryId(catName)
      } catch (e) {
        errors.push(`سطر ${ri + 2}: تصنيف — ${String((e as Error)?.message ?? e)}`)
        continue
      }

      let existing: Awaited<ReturnType<typeof findProductForRow>>
      try {
        existing = await findProductForRow(parts, mainBarcode)
      } catch (e) {
        errors.push(`سطر ${ri + 2}: بحث — ${String((e as Error)?.message ?? e)}`)
        continue
      }

      const buildBarcodeRows = (main: string | null) => {
        const m = main?.trim() || null
        const ordered = m ? [m, ...uniqueExtras.filter((x) => x !== m)] : [...uniqueExtras]
        if (ordered.length === 0) return [] as { barcode: string; variantName: null; isDefault: boolean }[]
        return ordered.map((barcode, idx) => ({
          barcode,
          variantName: null as string | null,
          isDefault: idx === 0
        }))
      }

      try {
        if (existing) {
          let mb = mainBarcode || existing.barcode?.trim() || null
          if (!mb && uniqueExtras.length === 0) {
            mb = await generateUniqueBarcode()
          } else if (!mb) {
            mb = uniqueExtras[0]!
          }
          const barcodeRows = buildBarcodeRows(mb)
          if (barcodeRows.length === 0) {
            errors.push(`سطر ${ri + 2}: لا يوجد باركود صالح`)
            continue
          }
          await p.productBarcode.deleteMany({ where: { productId: existing.id } })
          await p.product.update({
            where: { id: existing.id },
            data: {
              name,
              shortName,
              categoryId,
              barcode: barcodeRows[0]!.barcode,
              purchasePrice: new Decimal(purchasePrice),
              salePrice: new Decimal(salePrice),
              quantity,
              minStock,
              showOnPos,
              isWeighted,
              weightPrefix,
              averageCost: new Decimal(purchasePrice),
              barcodes: { create: barcodeRows }
            }
          })
          updated++
        } else {
          let mb = (mainBarcode || '').trim()
          if (!mb) mb = await generateUniqueBarcode()
          const barcodeRows = buildBarcodeRows(mb)
          if (barcodeRows.length === 0) {
            errors.push(`سطر ${ri + 2}: لا يوجد باركود`)
            continue
          }
          await p.product.create({
            data: {
              name,
              shortName,
              categoryId,
              barcode: barcodeRows[0]!.barcode,
              purchasePrice: new Decimal(purchasePrice),
              salePrice: new Decimal(salePrice),
              quantity,
              minStock,
              showOnPos,
              isWeighted,
              weightPrefix,
              imagePath: null,
              averageCost: new Decimal(purchasePrice),
              barcodes: { create: barcodeRows }
            }
          })
          created++
        }
      } catch (e) {
        errors.push(`سطر ${ri + 2}: ${name} — ${String((e as Error)?.message ?? e)}`)
        if (errors.length >= 40) break
      }
    }

    return { ok: true as const, created, updated, errors }
  })

  ipcMain.handle(
    'sales:create',
    async (
      _,
      payload: {
        items: { productId: string; quantity: number; unitPrice: number; discount?: number }[]
        discount: number
        paymentMethod: string
        cashReceived?: number
        customerId?: string | null
        taxRate?: number
        printReceipt?: boolean
      }
    ) => {
      await requirePermission('pos.sell')
      const sid = requireSession()
      const uid = requireAuth()
      if (ipcRateHit('sales:create', uid, 120, 60_000)) {
        return { ok: false, error: 'RATE_LIMIT' }
      }
      const validated = validateSalesCreatePayload(payload)
      if (!validated.ok) return { ok: false, error: validated.error }
      const body = validated.data
      const p = getPrisma()

      const pmOk = await p.paymentMethod.findFirst({
        where: { code: body.paymentMethod, isActive: true }
      })
      if (!pmOk) return { ok: false, error: 'INVALID_PAYMENT_METHOD' }

      const productRows = await p.product.findMany({
        where: { id: { in: body.items.map((x) => x.productId) }, deletedAt: null },
        select: { id: true, name: true, expiryDate: true }
      })
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      const expired = productRows.filter((x) => x.expiryDate && x.expiryDate.getTime() < startOfToday.getTime())
      if (expired.length > 0) {
        return { ok: false as const, error: 'EXPIRED_PRODUCT', products: expired.map((x) => x.name) }
      }

      const lines = body.items
      let subtotal = 0
      for (const l of lines) {
        const gross = l.unitPrice * l.quantity - (l.discount ?? 0)
        subtotal += gross
      }
      if (body.discount > 0) await requirePermission('pos.discount')
      const afterDisc = Math.max(0, subtotal - body.discount)
      const taxRate = body.taxRate ?? 0
      const taxAmount = (afterDisc * taxRate) / 100
      const total = afterDisc + taxAmount

      if (body.paymentMethod === 'credit' && !body.customerId) {
        return { ok: false, error: 'CREDIT_REQUIRES_CUSTOMER' }
      }

      const invoiceNumber = await nextInvoiceNumber()

      let sale: { id: string; invoiceNumber: string }
      try {
        sale = await runTransactionWithRetry(async (tx) => {
        const s = await tx.sale.create({
          data: {
            invoiceNumber,
            cashierSessionId: sid,
            userId: uid,
            customerId: body.customerId ?? null,
            status: 'completed',
            subtotal: new Decimal(subtotal),
            discount: new Decimal(body.discount),
            taxRate: new Decimal(taxRate),
            taxAmount: new Decimal(taxAmount),
            total: new Decimal(total),
            paymentMethod: body.paymentMethod,
            cashReceived:
              body.paymentMethod === 'cash' && body.cashReceived != null
                ? new Decimal(body.cashReceived)
                : null,
            changeDue:
              body.paymentMethod === 'cash' && body.cashReceived != null
                ? new Decimal(Math.max(0, body.cashReceived - total))
                : null,
            items: {
              create: lines.map((l) => {
                const lineTotal = l.unitPrice * l.quantity - (l.discount ?? 0)
                return {
                  productId: l.productId,
                  quantity: l.quantity,
                  unitPrice: new Decimal(l.unitPrice),
                  discount: new Decimal(l.discount ?? 0),
                  lineTotal: new Decimal(lineTotal)
                }
              })
            }
          },
          include: { items: { include: { product: true } } }
        })

        for (const l of lines) {
          await tx.product.update({
            where: { id: l.productId },
            data: { quantity: { decrement: l.quantity } }
          })
          await tx.inventoryMovement.create({
            data: {
              productId: l.productId,
              type: 'sale',
              quantity: -l.quantity,
              refType: 'sale',
              refId: s.id
            }
          })
        }

        if (body.paymentMethod === 'credit' && body.customerId) {
          const cust = await tx.customer.findFirst({
            where: { id: body.customerId, deletedAt: null }
          })
          if (!cust) throw new Error('CUSTOMER_NOT_FOUND')
          await tx.customer.update({
            where: { id: cust.id },
            data: { balance: { increment: new Decimal(total) } }
          })
        }

        return s
      })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg === 'CUSTOMER_NOT_FOUND') return { ok: false, error: 'CUSTOMER_NOT_FOUND' }
        throw e
      }

      appendOfflineEvent({ type: 'sale_completed', entity: 'Sale', entityId: sale.id })
      clearCartSnapshot()

      const hw = await loadHardwareConfig()
      const shouldPrint =
        body.printReceipt === true ? true : body.printReceipt === false ? false : hw.autoPrintAfterSale
      if (shouldPrint) {
        const full = await p.sale.findFirst({
          where: { id: sale.id },
          include: { items: { include: { product: true } }, user: true }
        })
        if (full) {
          void printSaleReceipt({
            saleId: full.id,
            invoiceNumber: full.invoiceNumber,
            cashier: full.user.displayName,
            lines: full.items.map((i) => ({
              name: i.product.name,
              qty: i.quantity,
              price: Number(i.unitPrice),
              total: Number(i.lineTotal)
            })),
            subtotal: Number(full.subtotal),
            discount: Number(full.discount),
            tax: Number(full.taxAmount),
            total: Number(full.total),
            paymentMethod: full.paymentMethod
          })
        }
      }

      return { ok: true, sale: { id: sale.id, invoiceNumber: sale.invoiceNumber, total } }
    }
  )

  ipcMain.handle('sales:hold', async (_, raw: unknown) => {
    const parsed = parseIpc(salesHoldSchema, raw)
    if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message }
    const payload = parsed.data
    const sid = requireSession()
    const uid = requireAuth()
    const p = getPrisma()
    let subtotal = 0
    for (const l of payload.items) {
      subtotal += l.unitPrice * l.quantity - (l.discount ?? 0)
    }
    const total = Math.max(0, subtotal - payload.discount)
    const invoiceNumber = await nextInvoiceNumber()
    await p.sale.create({
      data: {
        invoiceNumber,
        cashierSessionId: sid,
        userId: uid,
        status: 'held',
        heldName: payload.heldName,
        subtotal: new Decimal(subtotal),
        discount: new Decimal(payload.discount),
        taxRate: new Decimal(0),
        taxAmount: new Decimal(0),
        total: new Decimal(total),
        paymentMethod: 'pending',
        items: {
          create: payload.items.map((l) => {
            const lineTotal = l.unitPrice * l.quantity - (l.discount ?? 0)
            return {
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: new Decimal(l.unitPrice),
              discount: new Decimal(l.discount ?? 0),
              lineTotal: new Decimal(lineTotal)
            }
          })
        }
      }
    })
    return { ok: true }
  })

  ipcMain.handle('settings:get', async (_, key: unknown) => {
    const kr = settingsKeySchema.safeParse(key)
    if (!kr.success) return { ok: false, code: 'VALIDATION' as const, message: 'مفتاح غير صالح' }
    const row = await getPrisma().setting.findUnique({ where: { key: kr.data } })
    let value = row?.value ?? null
    if (value && kr.data.endsWith('.sealed')) {
      value = openSecret(value) ?? value
    }
    return { ok: true, value }
  })

  ipcMain.handle('settings:set', async (_, payload: unknown) => {
    await requirePermission('settings.write')
    const parsed = parseIpc(settingsSetSchema, payload)
    if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message }
    const body = parsed.data
    const p = getPrisma()
    const stored = body.key.endsWith('.sealed') ? sealSecret(body.value) : body.value
    await p.setting.upsert({
      where: { key: body.key },
      create: { key: body.key, value: stored },
      update: { value: stored }
    })
    return { ok: true }
  })

  ipcMain.handle('shortcuts:list', async () => {
    const rows = await getPrisma().shortcutBinding.findMany()
    return { ok: true, items: rows }
  })

  ipcMain.handle('shortcuts:set', async (_, payload: { actionId: string; keys: string }) => {
    await requirePermission('settings.write')
    const p = getPrisma()
    await p.shortcutBinding.upsert({
      where: { actionId: payload.actionId },
      create: { actionId: payload.actionId, keys: payload.keys },
      update: { keys: payload.keys }
    })
    return { ok: true }
  })

  ipcMain.handle('backup:list', async () => {
    const items = await listBackups()
    return { ok: true, items }
  })

  ipcMain.handle('backup:run', async () => {
    const path = await runBackup('يدوي')
    return { ok: true, path }
  })

  ipcMain.handle('backup:restore', async (_, filePath: string) => {
    await requirePermission('backup.restore')
    try {
      await restoreBackup(filePath)
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle('hardware:cashDrawer', async () => {
    const r = await openCashDrawerPhysical()
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  })

  ipcMain.handle('reports:dashboard', async () => {
    requireAuth()
    await requirePermission('reports.read')
    const p = getPrisma()
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    const salesToday = await p.sale.aggregate({
      where: { deletedAt: null, status: 'completed', createdAt: { gte: from } },
      _sum: { total: true },
      _count: true
    })
    const top = await p.saleItem.groupBy({
      by: ['productId'],
      where: { sale: { deletedAt: null, status: 'completed', createdAt: { gte: from } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 8
    })
    const products = await p.product.findMany({
      where: { id: { in: top.map((t) => t.productId) } }
    })
    const map = new Map(products.map((pr) => [pr.id, pr.name]))
    return {
      ok: true,
      today: {
        revenue: Number(salesToday._sum.total ?? 0),
        invoices: salesToday._count
      },
      topProducts: top.map((t) => ({
        productId: t.productId,
        name: map.get(t.productId) ?? t.productId,
        qty: t._sum.quantity ?? 0
      }))
    }
  })

  ipcMain.handle('reports:slowMovers', async () => {
    requireAuth()
    const p = getPrisma()
    const since = new Date()
    since.setDate(since.getDate() - 30)
    const moved = await p.saleItem.groupBy({
      by: ['productId'],
      where: { sale: { deletedAt: null, status: 'completed', createdAt: { gte: since } } },
      _sum: { quantity: true }
    })
    const movedSet = new Set(moved.map((m) => m.productId))
    const stagnant = await p.product.findMany({
      where: { deletedAt: null, id: { notIn: Array.from(movedSet) } },
      take: 50,
      orderBy: { quantity: 'desc' }
    })
    return { ok: true, items: stagnant.map((x) => ({ id: x.id, name: x.name, qty: x.quantity })) }
  })

  ipcMain.handle('expenses:add', async (_, payload: { amount: number; category: string; note?: string }) => {
    const uid = requireAuth()
    const sid = auth.sessionId
    const p = getPrisma()
    await p.expense.create({
      data: {
        amount: new Decimal(payload.amount),
        category: payload.category,
        note: payload.note ?? null,
        cashierSessionId: sid,
        createdById: uid
      }
    })
    return { ok: true }
  })

  ipcMain.handle('recovery:saveCart', async (_, snap: unknown) => {
    requireAuth()
    const parsed = parseIpc(recoveryCartSchema, snap)
    if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message }
    saveCartSnapshot(parsed.data)
    return { ok: true }
  })

  ipcMain.handle('recovery:loadCart', async () => {
    requireAuth()
    const snapshot = loadCartSnapshot()
    return { ok: true, snapshot }
  })

  ipcMain.handle('recovery:clearCart', async () => {
    requireAuth()
    clearCartSnapshot()
    return { ok: true }
  })

  ipcMain.handle('paymentMethods:list', async () => {
    requireSession()
    await requirePermission('pos.sell')
    const rows = await getPrisma().paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    })
    return { ok: true, items: rows.map((r) => ({ code: r.code, nameAr: r.nameAr })) }
  })

  ipcMain.handle('diagnostics:collect', async () => {
    requireAuth()
    await requirePermission('settings.write')
    const report = await collectDiagnostics()
    return { ok: true, report }
  })

  // ==================== Promotions ====================
  ipcMain.handle('promotions:save', async (_, payload: unknown) => {
    requireAuth()
    await requirePermission('promotion.create')
    const schema = z.object({
      id: z.string().optional(),
      productId: z.string(),
      type: z.enum(['discount', 'fixed', 'bogo', 'bundle']),
      value: z.number().min(0),
      freeQty: z.number().int().min(0).optional().default(1),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      isActive: z.boolean().optional().default(true)
    })
    const parsed = parseIpc(schema, payload)
    if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message }
    const data = parsed.data
    const p = getPrisma()

    // التحقق من وجود المنتج
    const product = await p.product.findUnique({ where: { id: data.productId, deletedAt: null } })
    if (!product) return { ok: false, error: 'PRODUCT_NOT_FOUND' }

    if (data.id) {
      // تحديث عرض موجود
      await requirePermission('promotion.edit')
      await p.promotion.update({
        where: { id: data.id },
        data: {
          type: data.type,
          value: new Decimal(data.value),
          freeQty: data.freeQty,
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
          isActive: data.isActive
        }
      })
    } else {
      // إنشاء عرض جديد
      await p.promotion.create({
        data: {
          productId: data.productId,
          type: data.type,
          value: new Decimal(data.value),
          freeQty: data.freeQty,
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
          isActive: data.isActive
        }
      })
    }

    return { ok: true }
  })

  ipcMain.handle('promotions:list', async (_, productId: unknown) => {
    requireAuth()
    const schema = z.string()
    const parsed = parseIpc(schema, productId)
    if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message }
    
    const p = getPrisma()
    const promotions = await p.promotion.findMany({
      where: { productId: parsed.data },
      orderBy: { createdAt: 'desc' }
    })

    return {
      ok: true,
      items: promotions.map((promo) => ({
        id: promo.id,
        productId: promo.productId,
        type: promo.type,
        value: Number(promo.value),
        freeQty: promo.freeQty,
        startDate: promo.startDate?.toISOString() ?? null,
        endDate: promo.endDate?.toISOString() ?? null,
        isActive: promo.isActive,
        createdAt: promo.createdAt.toISOString()
      }))
    }
  })

  ipcMain.handle('promotions:delete', async (_, id: unknown) => {
    requireAuth()
    await requirePermission('promotion.delete')
    const schema = z.string()
    const parsed = parseIpc(schema, id)
    if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message }

    const p = getPrisma()
    await p.promotion.delete({ where: { id: parsed.data } })
    return { ok: true }
  })

  ipcMain.handle('promotions:toggle', async (_, id: unknown) => {
    requireAuth()
    await requirePermission('promotion.edit')
    const schema = z.string()
    const parsed = parseIpc(schema, id)
    if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message }

    const p = getPrisma()
    const promo = await p.promotion.findUnique({ where: { id: parsed.data } })
    if (!promo) return { ok: false, error: 'NOT_FOUND' }

    await p.promotion.update({
      where: { id: parsed.data },
      data: { isActive: !promo.isActive }
    })
    return { ok: true }
  })

  ipcMain.handle('promotions:getActive', async (_, productIds: unknown) => {
    requireAuth()
    const schema = z.array(z.string())
    const parsed = parseIpc(schema, productIds)
    if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message }

    const p = getPrisma()
    const now = new Date()
    
    const promotions = await p.promotion.findMany({
      where: {
        productId: { in: parsed.data },
        isActive: true,
        OR: [
          { startDate: null, endDate: null },
          { startDate: { lte: now }, endDate: null },
          { startDate: null, endDate: { gte: now } },
          { startDate: { lte: now }, endDate: { gte: now } }
        ]
      }
    })

    return {
      ok: true,
      promotions: promotions.map((promo) => ({
        id: promo.id,
        productId: promo.productId,
        type: promo.type,
        value: Number(promo.value),
        freeQty: promo.freeQty
      }))
    }
  })

  registerHardwareAndAuxIpc({ requireAuth, requirePermission })

  registerEnterpriseIpc({
    requireAuth,
    requireSession,
    requirePermission,
    getSessionId: () => auth.sessionId
  })
}
