import { ipcMain } from 'electron'
import { Decimal } from '@prisma/client/runtime/library'
import { getPrisma } from './database'
import { mapProduct } from './mappers'
import { hashPin } from './pin'
import { printSaleReceipt } from './hardware'
import { parseIpc } from './ipc-middleware'
import { getEffectivePermissionCodesForUser } from './user-permissions'
import {
  customerReceivePaymentSchema,
  ipcSaleIdSchema,
  reportsSalesFilterQuerySchema,
  reportsSalesListQuerySchema,
  reportsTopSellingQuerySchema,
  usersSetPermissionStateSchema
} from '../../lib/ipc/schemas'

export type EnterpriseDeps = {
  requireAuth: () => string
  requireSession: () => string
  requirePermission: (code: string) => Promise<void>
  getSessionId: () => string | null
}

function ok<T extends object>(data: T): { ok: true } & T {
  return { ok: true, ...data }
}

function fail(code: string, extra?: Record<string, unknown>): { ok: false; code: string } & Record<string, unknown> {
  return { ok: false, code, ...extra }
}

async function writeAudit(
  userId: string | null,
  action: string,
  entity?: string,
  entityId?: string,
  meta?: unknown
): Promise<void> {
  await getPrisma().auditLog.create({
    data: {
      userId: userId ?? undefined,
      action,
      entity,
      entityId,
      meta: meta === undefined ? undefined : JSON.stringify(meta)
    }
  })
}

async function nextPurchaseNumber(): Promise<string> {
  const n = await getPrisma().purchaseInvoice.count()
  return `PUR-${String(n + 1).padStart(6, '0')}`
}

/** يكفي امتلاك إحدى الصلاحيات (مثلاً users.edit أو users.manage للتوافق مع الأدوار القديمة) */
async function requireAnyOf(requirePermission: (code: string) => Promise<void>, codes: string[]): Promise<void> {
  for (const code of codes) {
    try {
      await requirePermission(code)
      return
    } catch {
      /* جرّب التالية */
    }
  }
  throw new Error(`FORBIDDEN:${codes.join('|')}`)
}

/** بداية/نهاية اليوم الحالي بتوقيت الجهاز (لعرض الكاشير) */
function localTodayBounds(): { from: Date; to: Date } {
  const n = new Date()
  return {
    from: new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0),
    to: new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999)
  }
}

function saleReportWhere(
  from: Date,
  to: Date,
  opts: { paymentMethod?: string; invoiceSearch?: string }
): {
  deletedAt: null
  status: 'completed'
  createdAt: { gte: Date; lte: Date }
  paymentMethod?: string
  invoiceNumber?: { contains: string }
} {
  const where: {
    deletedAt: null
    status: 'completed'
    createdAt: { gte: Date; lte: Date }
    paymentMethod?: string
    invoiceNumber?: { contains: string }
  } = {
    deletedAt: null,
    status: 'completed',
    createdAt: { gte: from, lte: to }
  }
  const pm = opts.paymentMethod?.trim()
  if (pm) where.paymentMethod = pm
  const inv = opts.invoiceSearch?.trim()
  if (inv) where.invoiceNumber = { contains: inv }
  return where
}

function wrap(fn: (...args: any[]) => Promise<unknown>) {
  return async (...args: any[]) => {
    try {
      return await fn(...args)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.startsWith('FORBIDDEN:')) return fail('FORBIDDEN', { permission: msg.slice('FORBIDDEN:'.length) })
      if (msg === 'UNAUTHORIZED') return fail('UNAUTHORIZED')
      if (msg === 'NO_SHIFT') return fail('NO_SHIFT')
      if (msg === 'NOT_FOUND') return fail('NOT_FOUND')
      if (msg === 'NEGATIVE_STOCK') return fail('NEGATIVE_STOCK')
      console.error(e)
      return fail('ERROR', { message: msg })
    }
  }
}

export function registerEnterpriseIpc(deps: EnterpriseDeps): void {
  const { requireAuth, requirePermission, getSessionId } = deps

  ipcMain.handle(
    'inventory:lowStock',
    wrap(async () => {
      await requirePermission('inventory.read')
      const all = await getPrisma().product.findMany({
        where: { deletedAt: null },
        include: { category: true, barcodes: true }
      })
      const low = all.filter((x) => x.quantity <= x.minStock)
      return ok({ items: low.map((x) => mapProduct(x)) })
    })
  )

  ipcMain.handle(
    'inventory:movements',
    wrap(async (_, q: { productId?: string; take?: number }) => {
      await requirePermission('inventory.read')
      const rows = await getPrisma().inventoryMovement.findMany({
        where: q.productId ? { productId: q.productId } : undefined,
        orderBy: { createdAt: 'desc' },
        take: Math.min(q.take ?? 200, 2000),
        include: { product: true }
      })
      return ok({
        items: rows.map((r) => ({
          id: r.id,
          productId: r.productId,
          productName: r.product.name,
          type: r.type,
          quantity: r.quantity,
          refType: r.refType,
          refId: r.refId,
          note: r.note,
          unitCost: r.unitCost ? Number(r.unitCost) : null,
          createdAt: r.createdAt.toISOString()
        }))
      })
    })
  )

  ipcMain.handle(
    'inventory:applyMove',
    wrap(async (_, payload: { type: string; productId: string; quantity: number; note?: string; unitCost?: number }) => {
      await requirePermission('inventory.write')
      const uid = requireAuth()
      const qty = Math.floor(payload.quantity)
      if (!qty) return fail('BAD_INPUT')
      await getPrisma().$transaction(async (tx) => {
        const prod = await tx.product.findUnique({ where: { id: payload.productId } })
        if (!prod || prod.deletedAt) throw new Error('NOT_FOUND')
        const nextQty = prod.quantity + qty
        if (nextQty < 0) throw new Error('NEGATIVE_STOCK')
        let avg = Number(prod.averageCost)
        if (['stock_in', 'purchase'].includes(payload.type) && payload.unitCost != null && qty > 0) {
          const oldQ = prod.quantity
          const uc = payload.unitCost
          avg = oldQ + qty <= 0 ? uc : (oldQ * avg + uc * qty) / (oldQ + qty)
        }
        await tx.product.update({
          where: { id: prod.id },
          data: { quantity: nextQty, averageCost: new Decimal(avg) }
        })
        await tx.inventoryMovement.create({
          data: {
            productId: prod.id,
            type: payload.type,
            quantity: qty,
            note: payload.note ?? null,
            unitCost: payload.unitCost != null ? new Decimal(payload.unitCost) : null,
            refType: 'manual',
            refId: uid
          }
        })
      })
      await writeAudit(uid, 'inventory_move', 'Product', payload.productId, payload)
      return ok({})
    })
  )

  ipcMain.handle(
    'inventory:count:create',
    wrap(async (_, note?: string) => {
      await requirePermission('inventory.write')
      const uid = requireAuth()
      const s = await getPrisma().inventoryCountSession.create({
        data: { userId: uid, note: note ?? null, status: 'draft' }
      })
      await writeAudit(uid, 'count_open', 'InventoryCountSession', s.id)
      return ok({ id: s.id })
    })
  )

  ipcMain.handle(
    'inventory:count:setLine',
    wrap(async (_, payload: { sessionId: string; productId: string; countedQty: number }) => {
      await requirePermission('inventory.write')
      const p = getPrisma()
      const sess = await p.inventoryCountSession.findFirst({
        where: { id: payload.sessionId, status: 'draft' }
      })
      if (!sess) return fail('NOT_FOUND')
      const prod = await p.product.findUnique({ where: { id: payload.productId } })
      if (!prod || prod.deletedAt) return fail('NOT_FOUND')
      const systemQty = prod.quantity
      const counted = Math.floor(payload.countedQty)
      const variance = counted - systemQty
      await p.inventoryCountLine.upsert({
        where: {
          sessionId_productId: { sessionId: payload.sessionId, productId: payload.productId }
        },
        create: {
          sessionId: payload.sessionId,
          productId: payload.productId,
          systemQty,
          countedQty: counted,
          variance
        },
        update: { systemQty, countedQty: counted, variance }
      })
      return ok({})
    })
  )

  ipcMain.handle(
    'inventory:count:post',
    wrap(async (_, sessionId: string) => {
      await requirePermission('inventory.write')
      const uid = requireAuth()
      const p = getPrisma()
      const sess = await p.inventoryCountSession.findFirst({
        where: { id: sessionId, status: 'draft' },
        include: { lines: true }
      })
      if (!sess) return fail('NOT_FOUND')
      await p.$transaction(async (tx) => {
        for (const line of sess.lines) {
          if (line.variance === 0) continue
          await tx.product.update({
            where: { id: line.productId },
            data: { quantity: line.countedQty }
          })
          await tx.inventoryMovement.create({
            data: {
              productId: line.productId,
              type: 'inventory_count',
              quantity: line.variance,
              refType: 'count_session',
              refId: sessionId,
              note: `جرد #${sessionId}`
            }
          })
        }
        await tx.inventoryCountSession.update({
          where: { id: sessionId },
          data: { status: 'posted', postedAt: new Date() }
        })
      })
      await writeAudit(uid, 'count_post', 'InventoryCountSession', sessionId)
      return ok({})
    })
  )

  ipcMain.handle(
    'inventory:count:list',
    wrap(async () => {
      await requirePermission('inventory.read')
      const p = getPrisma()
      const sessions = await p.inventoryCountSession.findMany({
        orderBy: { startedAt: 'desc' },
        include: {
          user: { select: { displayName: true, username: true } },
          _count: { select: { lines: true } }
        }
      })
      return ok({
        items: sessions.map((s) => ({
          id: s.id,
          status: s.status,
          note: s.note,
          startedAt: s.startedAt.toISOString(),
          postedAt: s.postedAt?.toISOString() ?? null,
          userName: s.user.displayName,
          linesCount: s._count.lines
        }))
      })
    })
  )

  ipcMain.handle(
    'inventory:count:details',
    wrap(async (_, sessionId: string) => {
      await requirePermission('inventory.read')
      const p = getPrisma()
      const sess = await p.inventoryCountSession.findUnique({
        where: { id: sessionId },
        include: {
          user: { select: { displayName: true, username: true } },
          lines: {
            include: { product: { select: { name: true, barcode: true } } },
            orderBy: { product: { name: 'asc' } }
          }
        }
      })
      if (!sess) return fail('NOT_FOUND')
      return ok({
        session: {
          id: sess.id,
          status: sess.status,
          note: sess.note,
          startedAt: sess.startedAt.toISOString(),
          postedAt: sess.postedAt?.toISOString() ?? null,
          userName: sess.user.displayName
        },
        lines: sess.lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          productName: l.product.name,
          productBarcode: l.product.barcode,
          systemQty: l.systemQty,
          countedQty: l.countedQty,
          variance: l.variance
        }))
      })
    })
  )

  ipcMain.handle(
    'supplier:list',
    wrap(async () => {
      await requirePermission('supplier.read')
      const rows = await getPrisma().supplier.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' }
      })
      return ok({ items: rows })
    })
  )

  ipcMain.handle(
    'supplier:save',
    wrap(async (_, row: { id?: string; name: string; phone?: string; email?: string; address?: string; notes?: string }) => {
      await requirePermission('supplier.write')
      const uid = requireAuth()
      const p = getPrisma()
      if (row.id) {
        const u = await p.supplier.update({
          where: { id: row.id },
          data: {
            name: row.name,
            phone: row.phone ?? null,
            email: row.email ?? null,
            address: row.address ?? null,
            notes: row.notes ?? null
          }
        })
        await writeAudit(uid, 'supplier_update', 'Supplier', u.id, row)
        return ok({ supplier: u })
      }
      const c = await p.supplier.create({
        data: {
          name: row.name,
          phone: row.phone ?? null,
          email: row.email ?? null,
          address: row.address ?? null,
          notes: row.notes ?? null
        }
      })
      await writeAudit(uid, 'supplier_create', 'Supplier', c.id)
      return ok({ supplier: c })
    })
  )

  ipcMain.handle(
    'supplier:delete',
    wrap(async (_, id: string) => {
      await requirePermission('supplier.write')
      const uid = requireAuth()
      await getPrisma().supplier.update({ where: { id }, data: { deletedAt: new Date() } })
      await writeAudit(uid, 'supplier_delete', 'Supplier', id)
      return ok({})
    })
  )

  ipcMain.handle(
    'supplier:payment',
    wrap(async (_, payload: { supplierId: string; amount: number; method: string; note?: string }) => {
      await requirePermission('supplier.write')
      const uid = requireAuth()
      await getPrisma().supplierPayment.create({
        data: {
          supplierId: payload.supplierId,
          amount: new Decimal(payload.amount),
          method: payload.method,
          note: payload.note ?? null,
          userId: uid
        }
      })
      await writeAudit(uid, 'supplier_payment', 'Supplier', payload.supplierId, payload)
      return ok({})
    })
  )

  ipcMain.handle(
    'supplier:balance',
    wrap(async (_, supplierId: string) => {
      await requirePermission('supplier.read')
      const p = getPrisma()
      const purchases = await p.purchaseInvoice.aggregate({
        where: { supplierId, deletedAt: null, status: 'completed' },
        _sum: { total: true }
      })
      const payments = await p.supplierPayment.aggregate({
        where: { supplierId, deletedAt: null },
        _sum: { amount: true }
      })
      const ret = await p.purchaseReturn.aggregate({
        where: { supplierId, deletedAt: null },
        _sum: { total: true }
      })
      const owed =
        Number(purchases._sum.total ?? 0) - Number(payments._sum.amount ?? 0) - Number(ret._sum.total ?? 0)
      return ok({ balance: owed })
    })
  )

  ipcMain.handle(
    'purchase:list',
    wrap(async (_, q: { supplierId?: string; status?: string }) => {
      await requirePermission('purchase.read')
      const where: Record<string, unknown> = { deletedAt: null }
      if (q.supplierId) where.supplierId = q.supplierId
      if (q.status) where.status = q.status
      const rows = await getPrisma().purchaseInvoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { supplier: true }
      })
      return ok({
        items: rows.map((r) => ({
          id: r.id,
          invoiceNumber: r.invoiceNumber,
          status: r.status,
          supplierName: r.supplier.name,
          total: Number(r.total),
          createdAt: r.createdAt.toISOString()
        }))
      })
    })
  )

  ipcMain.handle(
    'purchase:get',
    wrap(async (_, id: string) => {
      await requirePermission('purchase.read')
      const r = await getPrisma().purchaseInvoice.findFirst({
        where: { id, deletedAt: null },
        include: { items: { include: { product: true } }, supplier: true }
      })
      if (!r) return fail('NOT_FOUND')
      return ok({
        purchase: {
          id: r.id,
          supplierId: r.supplierId,
          supplierName: r.supplier.name,
          invoiceNumber: r.invoiceNumber,
          status: r.status,
          subtotal: Number(r.subtotal),
          taxRate: Number(r.taxRate),
          taxAmount: Number(r.taxAmount),
          discount: Number(r.discount),
          total: Number(r.total),
          notes: r.notes,
          items: r.items.map((i) => ({
            id: i.id,
            productId: i.productId,
            name: i.product.name,
            quantity: i.quantity,
            unitCost: Number(i.unitCost),
            lineDiscount: Number(i.lineDiscount),
            lineTotal: Number(i.lineTotal)
          }))
        }
      })
    })
  )

  ipcMain.handle(
    'purchase:saveDraft',
    wrap(
      async (
        _,
        payload: {
          id?: string
          supplierId: string
          items: { productId: string; quantity: number; unitCost: number; lineDiscount?: number }[]
          taxRate?: number
          discount?: number
          notes?: string
        }
      ) => {
        await requirePermission('purchase.write')
        const uid = requireAuth()
        const sid = getSessionId()
        const p = getPrisma()
        let subtotal = 0
        const lines = payload.items.map((it) => {
          const ld = it.lineDiscount ?? 0
          const lt = it.quantity * it.unitCost - ld
          subtotal += lt
          return { ...it, lineDiscount: ld, lineTotal: lt }
        })
        const taxRate = payload.taxRate ?? 0
        const disc = payload.discount ?? 0
        const taxAmount = ((Math.max(0, subtotal - disc)) * taxRate) / 100
        const total = Math.max(0, subtotal - disc) + taxAmount

        if (payload.id) {
          await p.purchaseItem.deleteMany({ where: { purchaseId: payload.id } })
          const inv = await p.purchaseInvoice.update({
            where: { id: payload.id },
            data: {
              supplierId: payload.supplierId,
              subtotal: new Decimal(subtotal),
              taxRate: new Decimal(taxRate),
              taxAmount: new Decimal(taxAmount),
              discount: new Decimal(disc),
              total: new Decimal(total),
              notes: payload.notes ?? null,
              status: 'draft',
              items: {
                create: lines.map((l) => ({
                  productId: l.productId,
                  quantity: l.quantity,
                  unitCost: new Decimal(l.unitCost),
                  lineDiscount: new Decimal(l.lineDiscount),
                  lineTotal: new Decimal(l.lineTotal)
                }))
              }
            }
          })
          return ok({ id: inv.id })
        }
        const invNo = await nextPurchaseNumber()
        const inv = await p.purchaseInvoice.create({
          data: {
            supplierId: payload.supplierId,
            invoiceNumber: invNo,
            status: 'draft',
            subtotal: new Decimal(subtotal),
            taxRate: new Decimal(taxRate),
            taxAmount: new Decimal(taxAmount),
            discount: new Decimal(disc),
            total: new Decimal(total),
            notes: payload.notes ?? null,
            userId: uid,
            cashierSessionId: sid,
            items: {
              create: lines.map((l) => ({
                productId: l.productId,
                quantity: l.quantity,
                unitCost: new Decimal(l.unitCost),
                lineDiscount: new Decimal(l.lineDiscount),
                lineTotal: new Decimal(l.lineTotal)
              }))
            }
          }
        })
        await writeAudit(uid, 'purchase_draft', 'PurchaseInvoice', inv.id)
        return ok({ id: inv.id })
      }
    )
  )

  ipcMain.handle(
    'purchase:complete',
    wrap(async (_, id: string) => {
      await requirePermission('purchase.complete')
      const uid = requireAuth()
      const p = getPrisma()
      const inv = await p.purchaseInvoice.findFirst({
        where: { id, deletedAt: null, status: 'draft' },
        include: { items: true }
      })
      if (!inv) return fail('NOT_FOUND')
      await p.$transaction(async (tx) => {
        for (const it of inv.items) {
          const prod = await tx.product.findUnique({ where: { id: it.productId } })
          if (!prod) continue
          const q = it.quantity
          const uc = Number(it.unitCost)
          const oldQ = prod.quantity
          const oldAvg = Number(prod.averageCost)
          const newQ = oldQ + q
          const newAvg = newQ <= 0 ? uc : (oldQ * oldAvg + uc * q) / newQ
          await tx.product.update({
            where: { id: prod.id },
            data: { quantity: newQ, averageCost: new Decimal(newAvg), purchasePrice: new Decimal(uc) }
          })
          await tx.inventoryMovement.create({
            data: {
              productId: prod.id,
              type: 'purchase',
              quantity: q,
              unitCost: new Decimal(uc),
              refType: 'purchase',
              refId: inv.id
            }
          })
        }
        await tx.purchaseInvoice.update({
          where: { id: inv.id },
          data: { status: 'completed' }
        })
      })
      await writeAudit(uid, 'purchase_complete', 'PurchaseInvoice', id)
      return ok({})
    })
  )

  ipcMain.handle(
    'returns:sale',
    wrap(
      async (
        _,
        payload: {
          saleId: string
          items: { productId: string; quantity: number; unitPrice: number }[]
          reason?: string
          paymentMethod: string
        }
      ) => {
        await requirePermission('returns.sales')
        const uid = requireAuth()
        const sid = getSessionId()
        const p = getPrisma()
        let refund = 0
        const lines = payload.items.map((l) => {
          const lt = l.quantity * l.unitPrice
          refund += lt
          return { ...l, lineTotal: lt }
        })
        await p.$transaction(async (tx) => {
          const r = await tx.return.create({
            data: {
              saleId: payload.saleId,
              returnType: 'sale',
              refundTotal: new Decimal(refund),
              paymentMethod: payload.paymentMethod,
              reason: payload.reason ?? null,
              userId: uid,
              cashierSessionId: sid,
              items: {
                create: lines.map((l) => ({
                  productId: l.productId,
                  quantity: l.quantity,
                  unitPrice: new Decimal(l.unitPrice),
                  lineTotal: new Decimal(l.lineTotal)
                }))
              }
            }
          })
          for (const l of lines) {
            await tx.product.update({
              where: { id: l.productId },
              data: { quantity: { increment: l.quantity } }
            })
            await tx.inventoryMovement.create({
              data: {
                productId: l.productId,
                type: 'sales_return',
                quantity: l.quantity,
                refType: 'return',
                refId: r.id
              }
            })
          }
        })
        await writeAudit(uid, 'return_sale', 'Return', payload.saleId, payload)
        return ok({ refundTotal: refund })
      }
    )
  )

  ipcMain.handle(
    'returns:purchase',
    wrap(
      async (
        _,
        payload: {
          supplierId: string
          purchaseInvoiceId?: string
          items: { productId: string; quantity: number; unitCost: number }[]
          reason?: string
        }
      ) => {
        await requirePermission('returns.purchase')
        const uid = requireAuth()
        const p = getPrisma()
        let total = 0
        const lines = payload.items.map((l) => {
          const lt = l.quantity * l.unitCost
          total += lt
          return { ...l, lineTotal: lt }
        })
        await p.$transaction(async (tx) => {
          const r = await tx.purchaseReturn.create({
            data: {
              supplierId: payload.supplierId,
              purchaseInvoiceId: payload.purchaseInvoiceId ?? null,
              reason: payload.reason ?? null,
              total: new Decimal(total),
              userId: uid,
              items: {
                create: lines.map((l) => ({
                  productId: l.productId,
                  quantity: l.quantity,
                  unitCost: new Decimal(l.unitCost),
                  lineTotal: new Decimal(l.lineTotal)
                }))
              }
            }
          })
          for (const l of lines) {
            await tx.product.update({
              where: { id: l.productId },
              data: { quantity: { decrement: l.quantity } }
            })
            await tx.inventoryMovement.create({
              data: {
                productId: l.productId,
                type: 'purchase_return',
                quantity: -l.quantity,
                unitCost: new Decimal(l.unitCost),
                refType: 'purchase_return',
                refId: r.id
              }
            })
          }
        })
        await writeAudit(uid, 'return_purchase', 'PurchaseReturn', payload.supplierId, payload)
        return ok({ total })
      }
    )
  )

  ipcMain.handle(
    'expense:categories',
    wrap(async () => {
      await requirePermission('expense.read')
      const rows = await getPrisma().expenseCategory.findMany({
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' }
      })
      return ok({ items: rows })
    })
  )

  ipcMain.handle(
    'expense:categorySave',
    wrap(async (_, row: { id?: string; name: string }) => {
      await requirePermission('expense.write')
      const uid = requireAuth()
      const p = getPrisma()
      if (row.id) {
        const u = await p.expenseCategory.update({ where: { id: row.id }, data: { name: row.name } })
        await writeAudit(uid, 'expense_cat_update', 'ExpenseCategory', u.id)
        return ok({ item: u })
      }
      const c = await p.expenseCategory.create({ data: { name: row.name } })
      await writeAudit(uid, 'expense_cat_create', 'ExpenseCategory', c.id)
      return ok({ item: c })
    })
  )

  ipcMain.handle(
    'expense:listRegistrars',
    wrap(async () => {
      await requirePermission('expense.read_all')
      const users = await getPrisma().user.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, displayName: true, username: true },
        orderBy: { displayName: 'asc' }
      })
      return ok({ items: users })
    })
  )

  ipcMain.handle(
    'expense:list',
    wrap(async (_, q: { from?: string; to?: string; createdById?: string | null }) => {
      await requirePermission('expense.read')
      const uid = requireAuth()
      const codes = await getEffectivePermissionCodesForUser(uid)
      const readAll = codes.includes('expense.read_all')

      const where: Record<string, unknown> = { deletedAt: null }

      if (!readAll) {
        where.createdById = uid
        const { from: t0, to: t1 } = localTodayBounds()
        where.createdAt = { gte: t0, lte: t1 }
      } else {
        if (q.from || q.to) {
          where.createdAt = {}
          if (q.from) (where.createdAt as Record<string, Date>).gte = new Date(q.from)
          if (q.to) (where.createdAt as Record<string, Date>).lte = new Date(q.to)
        }
        const reg = typeof q.createdById === 'string' ? q.createdById.trim() : ''
        if (reg) {
          where.createdById = reg
        }
      }

      const rows = await getPrisma().expense.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: { categoryRef: true }
      })
      const userIds = [...new Set(rows.map((r) => r.createdById))]
      const users = await getPrisma().user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, username: true }
      })
      const userById = new Map(users.map((u) => [u.id, u]))

      const registrar = (createdById: string) => {
        const u = userById.get(createdById)
        const username = (u?.username ?? '').trim()
        const display = (u?.displayName ?? '').trim()
        const createdByName = display || username || 'غير معروف'
        const createdByUsername = username || '—'
        return { createdByName, createdByUsername }
      }

      return ok({
        meta: { cashierTodayOnly: !readAll },
        items: rows.map((e) => {
          const { createdByName, createdByUsername } = registrar(e.createdById)
          return {
            id: e.id,
            amount: Number(e.amount),
            category: e.category,
            categoryName: e.categoryRef?.name ?? e.category,
            note: e.note,
            receiptImagePath: e.receiptImagePath,
            createdAt: e.createdAt.toISOString(),
            createdByName,
            createdByUsername
          }
        })
      })
    })
  )

  ipcMain.handle(
    'expense:create',
    wrap(
      async (
        _,
        payload: {
          amount: number
          category: string
          categoryId?: string | null
          note?: string
          receiptImagePath?: string | null
        }
      ) => {
        await requirePermission('expense.write')
        const uid = requireAuth()
        const sid = getSessionId()
        const ex = await getPrisma().expense.create({
          data: {
            amount: new Decimal(payload.amount),
            category: payload.category,
            categoryId: payload.categoryId ?? null,
            note: payload.note ?? null,
            receiptImagePath: payload.receiptImagePath ?? null,
            cashierSessionId: sid,
            createdById: uid
          }
        })
        await writeAudit(uid, 'expense_create', 'Expense', ex.id, payload)
        return ok({})
      }
    )
  )

  ipcMain.handle(
    'sales:heldList',
    wrap(async () => {
      await requirePermission('pos.sell')
      const uid = requireAuth()
      const rows = await getPrisma().sale.findMany({
        where: { status: 'held', deletedAt: null, userId: uid },
        orderBy: { createdAt: 'desc' },
        take: 100
      })
      return ok({
        items: rows.map((s) => ({
          id: s.id,
          invoiceNumber: s.invoiceNumber,
          heldName: s.heldName,
          total: Number(s.total),
          createdAt: s.createdAt.toISOString()
        }))
      })
    })
  )

  ipcMain.handle(
    'sales:heldGet',
    wrap(async (_, id: string) => {
      await requirePermission('pos.sell')
      const uid = requireAuth()
      const s = await getPrisma().sale.findFirst({
        where: { id, userId: uid, status: 'held', deletedAt: null },
        include: { items: { include: { product: true } } }
      })
      if (!s) return fail('NOT_FOUND')
      return ok({
        sale: {
          id: s.id,
          heldName: s.heldName,
          discount: Number(s.discount),
          items: s.items.map((i) => ({
            productId: i.productId,
            name: i.product.name,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            discount: Number(i.discount)
          }))
        }
      })
    })
  )

  ipcMain.handle(
    'sales:heldDelete',
    wrap(async (_, id: string) => {
      await requirePermission('pos.sell')
      const uid = requireAuth()
      const r = await getPrisma().sale.updateMany({
        where: { id, userId: uid, status: 'held', deletedAt: null },
        data: { deletedAt: new Date() }
      })
      if (!r.count) return fail('NOT_FOUND')
      await writeAudit(uid, 'held_delete', 'Sale', id)
      return ok({})
    })
  )

  /** استرجاع فاتورة معلقة: إرجاع البيانات وإخفاؤها من القائمة فورًا (منع الاسترجاع المتكرر والبيع المزدوج) */
  ipcMain.handle(
    'sales:heldConsume',
    wrap(async (_, id: string) => {
      await requirePermission('pos.sell')
      const uid = requireAuth()
      const p = getPrisma()
      const snapshot = await p.$transaction(async (tx) => {
        const s = await tx.sale.findFirst({
          where: { id, userId: uid, status: 'held', deletedAt: null },
          include: { items: { include: { product: true } } }
        })
        if (!s) return null
        await tx.sale.update({
          where: { id: s.id },
          data: { deletedAt: new Date() }
        })
        return s
      })
      if (!snapshot) return fail('NOT_FOUND')
      await writeAudit(uid, 'held_restore', 'Sale', id)
      return ok({
        sale: {
          id: snapshot.id,
          heldName: snapshot.heldName,
          discount: Number(snapshot.discount),
          items: snapshot.items.map((i) => ({
            productId: i.productId,
            name: i.product.name,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            discount: Number(i.discount)
          }))
        }
      })
    })
  )

  ipcMain.handle(
    'customers:list',
    wrap(async (_, q: { search?: string }) => {
      await requirePermission('customer.read')
      const where: Record<string, unknown> = { deletedAt: null }
      if (q.search?.trim()) {
        const s = q.search.trim()
        where.OR = [
          { name: { contains: s } },
          { phone: { contains: s } },
          { barcode: { contains: s } }
        ]
      }
      const rows = await getPrisma().customer.findMany({
        where,
        orderBy: { name: 'asc' },
        take: 500
      })
      return ok({
        items: rows.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          barcode: c.barcode,
          balance: Number(c.balance),
          loyaltyPoints: c.loyaltyPoints,
          notes: c.notes
        }))
      })
    })
  )

  ipcMain.handle(
    'customers:save',
    wrap(
      async (
        _,
        row: {
          id?: string
          name: string
          phone?: string
          email?: string
          barcode?: string
          notes?: string
        }
      ) => {
        console.log('🔵 [IPC] customers:save بدء:', { id: row.id, name: row.name })
        
        // التحقق من الصلاحية المناسبة حسب نوع العملية
        if (row.id) {
          console.log('🔵 [IPC] التحقق من صلاحية customer.edit')
          await requirePermission('customer.edit')
        } else {
          console.log('🔵 [IPC] التحقق من صلاحية customer.create')
          await requirePermission('customer.create')
        }
        
        const uid = requireAuth()
        const p = getPrisma()
        
        if (row.id) {
          console.log('🔵 [IPC] تحديث عميل موجود')
          const u = await p.customer.update({
            where: { id: row.id },
            data: {
              name: row.name,
              phone: row.phone ?? null,
              email: row.email ?? null,
              barcode: row.barcode ?? null,
              notes: row.notes ?? null
            }
          })
          await writeAudit(uid, 'customer_update', 'Customer', u.id)
          console.log('✅ [IPC] تم التحديث بنجاح')
          return ok({})
        }
        
        console.log('🔵 [IPC] إنشاء عميل جديد')
        const c = await p.customer.create({
          data: {
            name: row.name,
            phone: row.phone ?? null,
            email: row.email ?? null,
            barcode: row.barcode ?? null,
            notes: row.notes ?? null
          }
        })
        await writeAudit(uid, 'customer_create', 'Customer', c.id)
        console.log('✅ [IPC] تم الإنشاء بنجاح')
        return ok({})
      }
    )
  )

  ipcMain.handle(
    'customers:loyalty',
    wrap(async (_, payload: { customerId: string; delta: number; reason: string }) => {
      await requirePermission('customer.loyalty')
      const uid = requireAuth()
      const p = getPrisma()
      await p.$transaction(async (tx) => {
        await tx.customer.update({
          where: { id: payload.customerId },
          data: { loyaltyPoints: { increment: payload.delta } }
        })
        await tx.loyaltyLedger.create({
          data: {
            customerId: payload.customerId,
            delta: payload.delta,
            reason: payload.reason
          }
        })
      })
      await writeAudit(uid, 'loyalty', 'Customer', payload.customerId, payload)
      return ok({})
    })
  )

  ipcMain.handle(
    'customers:delete',
    wrap(async (_, payload: { id: string }) => {
      await requirePermission('customer.delete')
      const uid = requireAuth()
      const p = getPrisma()
      
      // التحقق من وجود فواتير للعميل
      const salesCount = await p.sale.count({
        where: { customerId: payload.id }
      })
      
      if (salesCount > 0) {
        return { ok: false, error: `لا يمكن حذف العميل لأن لديه ${salesCount} فاتورة` }
      }
      
      // حذف سجلات الولاء أولاً
      await p.loyaltyLedger.deleteMany({
        where: { customerId: payload.id }
      })
      
      // ثم حذف العميل
      await p.customer.delete({
        where: { id: payload.id }
      })
      
      await writeAudit(uid, 'customer_delete', 'Customer', payload.id)
      return ok({})
    })
  )

  ipcMain.handle(
    'customers:receivePayment',
    wrap(async (_, raw: unknown) => {
      await requirePermission('customer.receive_payment')
      const uid = requireAuth()
      const parsed = parseIpc(customerReceivePaymentSchema, raw ?? {})
      if (!parsed.ok) return fail('VALIDATION', { message: parsed.message })
      const { customerId, amount, note } = parsed.data
      const p = getPrisma()
      const c = await p.customer.findFirst({ where: { id: customerId, deletedAt: null } })
      if (!c) return fail('NOT_FOUND', { message: 'الزبون غير موجود' })
      const bal = Number(c.balance)
      if (!(bal > 0)) return fail('NO_DEBT', { message: 'لا توجد ذمة على هذا الزبون' })
      if (amount > bal + 1e-9) return fail('AMOUNT_EXCEEDS_BALANCE', { message: 'المبلغ أكبر من رصيد الذمة' })
      await p.customer.update({
        where: { id: customerId },
        data: { balance: { decrement: new Decimal(amount) } }
      })
      const nextBal = bal - amount
      await writeAudit(uid, 'customer_receive_payment', 'Customer', customerId, { amount, note, balanceAfter: nextBal })
      return ok({ balance: nextBal })
    })
  )

  ipcMain.handle(
    'customers:invoices',
    wrap(async (_, payload: { customerId: string }) => {
      await requirePermission('customer.read')
      const p = getPrisma()
      const sales = await p.sale.findMany({
        where: {
          customerId: payload.customerId,
          deletedAt: null,
          status: 'completed'
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      })
      return ok({
        items: sales.map((s) => ({
          id: s.id,
          invoiceNumber: s.invoiceNumber || s.id.slice(-8).toUpperCase(),
          createdAt: s.createdAt.toISOString(),
          total: Number(s.total),
          paid: Number(s.paid),
          balance: Number(s.balance),
          paymentMethod: s.paymentMethod
        }))
      })
    })
  )

  ipcMain.handle(
    'customers:invoiceDetails',
    wrap(async (_, payload: { saleId: string }) => {
      await requirePermission('customer.read')
      const p = getPrisma()
      const sale = await p.sale.findUnique({
        where: { id: payload.saleId },
        include: {
          items: {
            include: { product: true }
          },
          customer: true,
          user: true
        }
      })
      if (!sale) return fail('NOT_FOUND', { message: 'الفاتورة غير موجودة' })
      return ok({
        invoice: {
          id: sale.id,
          invoiceNumber: sale.invoiceNumber || sale.id.slice(-8).toUpperCase(),
          createdAt: sale.createdAt.toISOString(),
          subtotal: Number(sale.subtotal),
          discount: Number(sale.discount),
          taxRate: Number(sale.taxRate),
          taxAmount: Number(sale.taxAmount),
          total: Number(sale.total),
          paid: Number(sale.paid),
          balance: Number(sale.balance),
          paymentMethod: sale.paymentMethod,
          cashReceived: sale.cashReceived ? Number(sale.cashReceived) : null,
          changeDue: sale.changeDue ? Number(sale.changeDue) : null,
          customerName: sale.customer?.name || null,
          userName: sale.user?.displayName || null,
          items: sale.items.map((item) => ({
            productName: item.product.name,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            discount: Number(item.discount),
            lineTotal: Number(item.lineTotal)
          }))
        }
      })
    })
  )

  ipcMain.handle(
    'users:list',
    wrap(async () => {
      await requireAnyOf(requirePermission, [
        'users.read',
        'users.create',
        'users.edit',
        'users.delete',
        'users.manage'
      ])
      const rows = await getPrisma().user.findMany({
        where: { deletedAt: null },
        include: { role: true }
      })
      return ok({
        items: rows.map((u) => ({
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          roleId: u.roleId,
          roleName: u.role.name,
          isActive: u.isActive,
          useCustomPermissions: u.useCustomPermissions
        }))
      })
    })
  )

  ipcMain.handle(
    'users:roles',
    wrap(async () => {
      await requireAnyOf(requirePermission, ['users.read', 'users.create', 'users.edit', 'users.manage'])
      const roles = await getPrisma().role.findMany({
        where: { deletedAt: null },
        include: { permissions: { include: { permission: true } } }
      })
      return ok({
        items: roles.map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
          permissions: r.permissions.map((x) => x.permission.code)
        }))
      })
    })
  )

  ipcMain.handle(
    'users:save',
    wrap(
      async (
        _,
        row: {
          id?: string
          username: string
          displayName: string
          pin?: string
          roleId: string
          isActive?: boolean
        }
      ) => {
        const uid = requireAuth()
        const p = getPrisma()
        if (row.id) {
          await requireAnyOf(requirePermission, ['users.edit', 'users.manage'])
          const data: Record<string, unknown> = {
            username: row.username,
            displayName: row.displayName,
            roleId: row.roleId,
            isActive: row.isActive ?? true
          }
          if (row.pin) data.pinHash = hashPin(row.pin)
          const u = await p.user.update({ where: { id: row.id }, data: data as never })
          await writeAudit(uid, 'user_update', 'User', u.id)
          return ok({ user: { id: u.id } })
        }
        await requireAnyOf(requirePermission, ['users.create', 'users.manage'])
        if (!row.pin) return fail('BAD_INPUT', { message: 'pin required' })
        const u = await p.user.create({
          data: {
            username: row.username,
            displayName: row.displayName,
            pinHash: hashPin(row.pin),
            roleId: row.roleId,
            isActive: row.isActive ?? true
          }
        })
        await writeAudit(uid, 'user_create', 'User', u.id)
        return ok({ user: { id: u.id } })
      }
    )
  )

  ipcMain.handle(
    'users:delete',
    wrap(async (_, id: string) => {
      await requireAnyOf(requirePermission, ['users.delete', 'users.manage'])
      const uid = requireAuth()
      if (id === uid) return fail('BAD_INPUT', { message: 'لا يمكن حذف المستخدم الحالي' })
      await getPrisma().user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
      await writeAudit(uid, 'user_delete', 'User', id)
      return ok({})
    })
  )

  ipcMain.handle(
    'users:permissionState',
    wrap(async (_, userId: unknown) => {
      await requireAnyOf(requirePermission, ['users.edit', 'users.manage'])
      if (typeof userId !== 'string' || !userId.trim()) return fail('BAD_INPUT', { message: 'معرّف مستخدم غير صالح' })
      const p = getPrisma()
      const u = await p.user.findFirst({
        where: { id: userId, deletedAt: null },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          userPermissions: { include: { permission: true } }
        }
      })
      if (!u) return fail('NOT_FOUND')
      const all = await p.permission.findMany({ where: { deletedAt: null }, orderBy: { code: 'asc' } })
      const roleCodes = u.role.permissions.map((rp) => rp.permission.code)
      const customCodes = u.userPermissions.map((up) => up.permission.code)
      return ok({
        username: u.username,
        displayName: u.displayName,
        roleName: u.role.name,
        useCustomPermissions: u.useCustomPermissions,
        rolePermissionCodes: roleCodes,
        customPermissionCodes: customCodes,
        allPermissions: all.map((x) => ({ id: x.id, code: x.code, description: x.description }))
      })
    })
  )

  ipcMain.handle(
    'users:setPermissionState',
    wrap(async (_, raw: unknown) => {
      await requireAnyOf(requirePermission, ['users.edit', 'users.manage'])
      const parsed = parseIpc(usersSetPermissionStateSchema, raw ?? {})
      if (!parsed.ok) return fail('VALIDATION', { message: parsed.message })
      const { userId, useCustomPermissions, permissionCodes } = parsed.data
      const uid = requireAuth()
      const p = getPrisma()
      const target = await p.user.findFirst({ where: { id: userId, deletedAt: null } })
      if (!target) return fail('NOT_FOUND')
      const perms = await p.permission.findMany({
        where: { code: { in: permissionCodes }, deletedAt: null }
      })
      await p.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { useCustomPermissions }
        })
        await tx.userPermission.deleteMany({ where: { userId } })
        if (useCustomPermissions && perms.length > 0) {
          await tx.userPermission.createMany({
            data: perms.map((pr) => ({ userId, permissionId: pr.id }))
          })
        }
      })
      await writeAudit(uid, 'user_permissions', 'User', userId, { useCustomPermissions, count: perms.length })
      return ok({})
    })
  )

  ipcMain.handle(
    'audit:list',
    wrap(async (_, q: { take?: number; action?: string } | undefined) => {
      await requirePermission('audit.read')
      const query = q && typeof q === 'object' ? q : {}
      const where: Record<string, unknown> = {}
      if (query.action) where.action = query.action
      const rows = await getPrisma().auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(query.take ?? 200, 2000),
        include: { user: true }
      })
      return ok({
        items: rows.map((a) => ({
          id: a.id,
          action: a.action,
          entity: a.entity,
          entityId: a.entityId ?? null,
          meta: a.meta,
          createdAt: a.createdAt.toISOString(),
          userName: a.user?.displayName ?? null
        }))
      })
    })
  )

  ipcMain.handle(
    'reports:profit',
    wrap(async (_, q: { from: string; to: string }) => {
      await requirePermission('reports.read')
      const p = getPrisma()
      const from = new Date(q.from)
      const to = new Date(q.to)
      const items = await p.saleItem.findMany({
        where: {
          sale: { status: 'completed', deletedAt: null, createdAt: { gte: from, lte: to } }
        },
        include: { product: true }
      })
      let revenue = 0
      let cost = 0
      for (const it of items) {
        const line = Number(it.lineTotal)
        revenue += line
        cost += Number(it.product.averageCost) * it.quantity
      }
      return ok({ revenue, cost, profit: revenue - cost })
    })
  )

  ipcMain.handle(
    'reports:salesSummary',
    wrap(async (_, raw: unknown) => {
      await requirePermission('reports.read')
      const parsed = parseIpc(reportsSalesFilterQuerySchema, raw ?? {})
      if (!parsed.ok) return fail('VALIDATION', { message: parsed.message })
      const p = getPrisma()
      const from = new Date(parsed.data.from)
      const to = new Date(parsed.data.to)
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return fail('BAD_INPUT', { message: 'تواريخ غير صالحة' })
      }
      const where = saleReportWhere(from, to, {
        paymentMethod: parsed.data.paymentMethod,
        invoiceSearch: parsed.data.invoiceSearch
      })
      const [salesAgg, invCount] = await Promise.all([
        p.sale.aggregate({
          where,
          _sum: { total: true }
        }),
        p.sale.count({
          where
        })
      ])
      return ok({
        revenue: Number(salesAgg._sum.total ?? 0),
        invoices: invCount
      })
    })
  )

  ipcMain.handle(
    'reports:paymentBreakdown',
    wrap(async (_, raw: unknown) => {
      await requirePermission('reports.read')
      const parsed = parseIpc(reportsSalesFilterQuerySchema, raw ?? {})
      if (!parsed.ok) return fail('VALIDATION', { message: parsed.message })
      const p = getPrisma()
      const from = new Date(parsed.data.from)
      const to = new Date(parsed.data.to)
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return fail('BAD_INPUT', { message: 'تواريخ غير صالحة' })
      }
      const where = saleReportWhere(from, to, {
        paymentMethod: parsed.data.paymentMethod,
        invoiceSearch: parsed.data.invoiceSearch
      })
      const rows = await p.sale.groupBy({
        by: ['paymentMethod'],
        where,
        _sum: { total: true },
        _count: { id: true }
      })
      return ok({
        items: rows.map((r) => ({
          paymentMethod: r.paymentMethod,
          total: Number(r._sum.total ?? 0),
          count: r._count.id
        }))
      })
    })
  )

  ipcMain.handle(
    'reports:salesList',
    wrap(async (_, raw: unknown) => {
      await requirePermission('reports.read')
      const parsed = parseIpc(reportsSalesListQuerySchema, raw ?? {})
      if (!parsed.ok) return fail('VALIDATION', { message: parsed.message })
      const p = getPrisma()
      const from = new Date(parsed.data.from)
      const to = new Date(parsed.data.to)
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return fail('BAD_INPUT', { message: 'تواريخ غير صالحة' })
      }
      const take = Math.min(parsed.data.take ?? 250, 500)
      const where = saleReportWhere(from, to, {
        paymentMethod: parsed.data.paymentMethod,
        invoiceSearch: parsed.data.invoiceSearch
      })
      const sales = await p.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          invoiceNumber: true,
          createdAt: true,
          total: true,
          paymentMethod: true,
          subtotal: true,
          discount: true,
          taxAmount: true,
          user: { select: { displayName: true } },
          customer: { select: { name: true } }
        }
      })
      return ok({
        items: sales.map((s) => ({
          id: s.id,
          invoiceNumber: s.invoiceNumber,
          createdAt: s.createdAt.toISOString(),
          total: Number(s.total),
          paymentMethod: s.paymentMethod,
          subtotal: Number(s.subtotal),
          discount: Number(s.discount),
          taxAmount: Number(s.taxAmount),
          cashierName: s.user.displayName,
          customerName: s.customer?.name ?? null
        }))
      })
    })
  )

  ipcMain.handle(
    'sales:getDetail',
    wrap(async (_, raw: unknown) => {
      await requirePermission('reports.read')
      const parsed = parseIpc(ipcSaleIdSchema, raw ?? '')
      if (!parsed.ok) return fail('VALIDATION', { message: parsed.message })
      const p = getPrisma()
      const s = await p.sale.findFirst({
        where: { id: parsed.data, deletedAt: null },
        include: {
          items: { include: { product: true } },
          user: { select: { displayName: true } },
          customer: { select: { name: true } }
        }
      })
      if (!s) return fail('NOT_FOUND')
      return ok({
        sale: {
          id: s.id,
          invoiceNumber: s.invoiceNumber,
          createdAt: s.createdAt.toISOString(),
          paymentMethod: s.paymentMethod,
          subtotal: Number(s.subtotal),
          discount: Number(s.discount),
          taxRate: Number(s.taxRate),
          taxAmount: Number(s.taxAmount),
          total: Number(s.total),
          cashReceived: s.cashReceived != null ? Number(s.cashReceived) : null,
          changeDue: s.changeDue != null ? Number(s.changeDue) : null,
          cashierName: s.user.displayName,
          customerName: s.customer?.name ?? null,
          lines: s.items.map((i) => ({
            productName: i.product.name,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            discount: Number(i.discount),
            lineTotal: Number(i.lineTotal)
          }))
        }
      })
    })
  )

  ipcMain.handle(
    'reports:topSelling',
    wrap(async (_, raw: unknown) => {
      await requirePermission('reports.read')
      const parsed = parseIpc(reportsTopSellingQuerySchema, raw ?? {})
      if (!parsed.ok) return fail('VALIDATION', { message: parsed.message })
      const p = getPrisma()
      const from = new Date(parsed.data.from)
      const to = new Date(parsed.data.to)
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return fail('BAD_INPUT', { message: 'تواريخ غير صالحة' })
      }
      const take = Math.min(parsed.data.limit ?? 20, 100)
      const top = await p.saleItem.groupBy({
        by: ['productId'],
        where: { sale: { deletedAt: null, status: 'completed', createdAt: { gte: from, lte: to } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take
      })
      const products = await p.product.findMany({
        where: { id: { in: top.map((t) => t.productId) } }
      })
      const map = new Map(products.map((pr) => [pr.id, pr.name]))
      return ok({
        items: top.map((t) => ({
          productId: t.productId,
          name: map.get(t.productId) ?? t.productId,
          qty: t._sum.quantity ?? 0
        }))
      })
    })
  )

  ipcMain.handle(
    'reports:inventoryValue',
    wrap(async () => {
      await requirePermission('reports.read')
      const products = await getPrisma().product.findMany({ where: { deletedAt: null } })
      const value = products.reduce((s, pr) => s + pr.quantity * Number(pr.averageCost), 0)
      return ok({ value, skus: products.length })
    })
  )

  ipcMain.handle(
    'print:saleReceipt',
    wrap(async (_, saleId: string) => {
      await requireAnyOf(requirePermission, ['pos.sell', 'reports.read'])
      const s = await getPrisma().sale.findFirst({
        where: { id: saleId, deletedAt: null },
        include: { items: { include: { product: true } }, user: true }
      })
      if (!s) return fail('NOT_FOUND')
      const pr = await printSaleReceipt({
        saleId: s.id,
        invoiceNumber: s.invoiceNumber,
        cashier: s.user.displayName,
        lines: s.items.map((i) => ({
          name: i.product.name,
          qty: i.quantity,
          price: Number(i.unitPrice),
          total: Number(i.lineTotal)
        })),
        subtotal: Number(s.subtotal),
        discount: Number(s.discount),
        tax: Number(s.taxAmount),
        total: Number(s.total),
        paymentMethod: s.paymentMethod
      })
      if (!pr.ok) return fail('PRINT_FAILED', { message: pr.error })
      return ok({})
    })
  )

  ipcMain.handle(
    'permissions:list',
    wrap(async () => {
      await requirePermission('users.manage')
      const rows = await getPrisma().permission.findMany({
        where: { deletedAt: null },
        orderBy: { code: 'asc' }
      })
      return ok({ items: rows.map((x) => ({ id: x.id, code: x.code, description: x.description })) })
    })
  )

  ipcMain.handle(
    'roles:create',
    wrap(async (_, payload: { name: string; code?: string }) => {
      await requirePermission('users.manage')
      const uid = requireAuth()
      const base = (payload.code ?? payload.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
      const code = `${base || 'role'}_${Math.random().toString(36).slice(2, 6)}`
      const r = await getPrisma().role.create({ data: { name: payload.name, code } })
      await writeAudit(uid, 'role_create', 'Role', r.id, { name: payload.name })
      return ok({ role: { id: r.id, code: r.code, name: r.name } })
    })
  )

  ipcMain.handle(
    'roles:setPermissions',
    wrap(async (_, payload: { roleId: string; permissionCodes: string[] }) => {
      await requirePermission('users.manage')
      const uid = requireAuth()
      const p = getPrisma()
      const role = await p.role.findFirst({ where: { id: payload.roleId, deletedAt: null } })
      if (!role) return fail('NOT_FOUND')
      const perms = await p.permission.findMany({
        where: { code: { in: payload.permissionCodes }, deletedAt: null }
      })
      await p.$transaction([
        p.rolePermission.deleteMany({ where: { roleId: role.id } }),
        p.rolePermission.createMany({
          data: perms.map((perm) => ({ roleId: role.id, permissionId: perm.id }))
        })
      ])
      await writeAudit(uid, 'role_permissions', 'Role', role.id, payload.permissionCodes)
      return ok({})
    })
  )

  ipcMain.handle(
    'expense:setReceipt',
    wrap(async (_, payload: { expenseId: string; relativePath: string | null }) => {
      await requirePermission('expense.write')
      const uid = requireAuth()
      const ex = await getPrisma().expense.findFirst({ where: { id: payload.expenseId, deletedAt: null } })
      if (!ex) return fail('NOT_FOUND')
      await getPrisma().expense.update({
        where: { id: ex.id },
        data: { receiptImagePath: payload.relativePath }
      })
      await writeAudit(uid, 'expense_receipt', 'Expense', ex.id)
      return ok({})
    })
  )

  ipcMain.handle(
    'reports:hourlySales',
    wrap(async (_, q: { from: string; to: string }) => {
      await requirePermission('reports.read')
      const p = getPrisma()
      const from = new Date(q.from)
      const to = new Date(q.to)
      const sales = await p.sale.findMany({
        where: { deletedAt: null, status: 'completed', createdAt: { gte: from, lte: to } },
        select: { createdAt: true, total: true }
      })
      const buckets = new Map<number, { hour: number; revenue: number; count: number }>()
      for (const s of sales) {
        const h = s.createdAt.getHours()
        const cur = buckets.get(h) ?? { hour: h, revenue: 0, count: 0 }
        cur.revenue += Number(s.total)
        cur.count += 1
        buckets.set(h, cur)
      }
      const items = [...buckets.values()].sort((a, b) => a.hour - b.hour)
      return ok({ items })
    })
  )

  ipcMain.handle(
    'reports:cashierStats',
    wrap(async (_, q: { from: string; to: string }) => {
      await requirePermission('reports.read')
      const p = getPrisma()
      const from = new Date(q.from)
      const to = new Date(q.to)
      const rows = await p.sale.groupBy({
        by: ['userId'],
        where: { deletedAt: null, status: 'completed', createdAt: { gte: from, lte: to } },
        _sum: { total: true },
        _count: true
      })
      const users = await p.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } } })
      const map = new Map(users.map((u) => [u.id, u.displayName]))
      return ok({
        items: rows.map((r) => ({
          userId: r.userId,
          name: map.get(r.userId) ?? r.userId,
          revenue: Number(r._sum.total ?? 0),
          invoices: r._count
        }))
      })
    })
  )

  ipcMain.handle(
    'barcode:parseWeight',
    wrap(async (_, code: string) => {
      await requirePermission('pos.sell')
      const trimmed = code.trim()
      const products = await getPrisma().product.findMany({
        where: { deletedAt: null, isWeighted: true, weightPrefix: { not: null } }
      })
      for (const pr of products) {
        const pref = pr.weightPrefix ?? ''
        if (pref && trimmed.startsWith(pref)) {
          const rest = trimmed.slice(pref.length)
          const grams = parseInt(rest.slice(0, 5), 10)
          if (!Number.isNaN(grams) && grams > 0) {
            const kg = grams / 1000
            const price = Number(pr.salePrice) * kg
            return ok({ productId: pr.id, weightKg: kg, lineTotal: price, name: pr.name })
          }
        }
      }
      return ok({ match: false as const })
    })
  )
}
