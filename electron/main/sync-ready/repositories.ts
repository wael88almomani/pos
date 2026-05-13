/**
 * حدود وصول للبيانات — تمهيد لمزامنة لاحقة (LAN / سحابة) دون تغيير واجهات النطاق.
 * التنفيذ الحالي يعتمد على Prisma محليًا؛ لاحقًا يمكن استبداله بعميل يوجّه لخادم مركزي.
 */
import type { Prisma } from '@prisma/client'
import { getOrCreateDeviceId } from '../device-id'

export type StockMutation = {
  productId: string
  quantityDelta: number
  type: string
  refType?: string | null
  refId?: string | null
  note?: string | null
}

export interface IInventoryWriteRepository {
  applyStockDelta(tx: Prisma.TransactionClient, m: StockMutation): Promise<void>
}

export class PrismaInventoryWriteRepository implements IInventoryWriteRepository {
  async applyStockDelta(tx: Prisma.TransactionClient, m: StockMutation): Promise<void> {
    await tx.product.update({
      where: { id: m.productId },
      data: { quantity: { increment: m.quantityDelta } }
    })
    await tx.inventoryMovement.create({
      data: {
        productId: m.productId,
        type: m.type,
        quantity: m.quantityDelta,
        refType: m.refType ?? null,
        refId: m.refId ?? null,
        note: m.note ?? null
      }
    })
  }
}

export interface IDeviceRegistry {
  getOrCreateLocalDeviceId(): Promise<string>
}

/** يبقى رقيقًا — المنطق الكامل في device-id.ts */
export class PrismaBackedDeviceRegistry implements IDeviceRegistry {
  async getOrCreateLocalDeviceId(): Promise<string> {
    return getOrCreateDeviceId()
  }
}
