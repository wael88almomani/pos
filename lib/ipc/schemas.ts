import { z } from 'zod'

/** رسالة آمنة للواجهة — بدون تفاصيل داخلية */
export function formatValidationForClient(issues: z.ZodIssue[]): string {
  const first = issues[0]
  if (!first) return 'بيانات غير صالحة'
  const path = first.path.length ? String(first.path.join('.')) : 'حقل'
  if (first.code === 'too_big') return `${path}: قيمة كبيرة جداً`
  if (first.code === 'too_small') return `${path}: قيمة صغيرة جداً`
  if (first.code === 'invalid_type') return `${path}: نوع غير صحيح`
  return `${path}: إدخال غير صالح`
}

export const authLoginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  pin: z.string().trim().min(1).max(32)
})

export const sessionOpenSchema = z.object({
  openingCash: z.number().finite().min(0).max(1e9),
  deviceId: z.string().trim().min(1).max(128)
})

export const sessionCloseSchema = z.object({
  actualCash: z.number().finite().min(0).max(1e9),
  notes: z.string().max(2000).optional(),
  managerPin: z.string().min(1).max(32).optional()
})

export const barcodeCodeSchema = z.string().trim().min(1).max(96)

export const verifyPinInputSchema = z.string().trim().min(1).max(32)

export const productsListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  categoryId: z.string().max(128).optional().nullable(),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(10).max(500).optional().default(200)
})

export const productsSearchAdvancedSchema = z.object({
  query: z.string().max(200),
  limit: z.number().int().min(1).max(200).optional(),
  recentProductIds: z.array(z.string().max(128)).max(80).optional()
})

export const productsCreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  showOnPos: z.boolean().optional().default(true)
})

export const settingsKeySchema = z.string().trim().min(1).max(200)

export const settingsSetSchema = z.object({
  key: z.string().trim().min(1).max(200),
  value: z.string().max(500_000)
})

export const saleLineSchema = z.object({
  productId: z.string().min(1).max(128),
  quantity: z.number().int().min(1).max(999999),
  unitPrice: z.number().finite().min(0).max(1e9),
  discount: z.number().finite().min(0).max(1e9).optional()
})

export const salesCreateSchema = z.object({
  items: z.array(saleLineSchema).min(1).max(500),
  discount: z.number().finite().min(0).max(1e9),
  paymentMethod: z.string().trim().min(1).max(64),
  cashReceived: z.number().finite().min(0).max(1e9).optional(),
  customerId: z.union([z.string().min(1).max(128), z.null()]).optional(),
  taxRate: z.number().finite().min(0).max(100).optional(),
  /** إن وُجد: true = طباعة بعد الحفظ، false = عدم الطباعة؛ undefined = سلوك الإعدادات (autoPrint) */
  printReceipt: z.boolean().optional()
})

export const reportsDateRangeSchema = z.object({
  from: z.string().trim().min(1).max(40),
  to: z.string().trim().min(1).max(40)
})

export const reportsTopSellingQuerySchema = reportsDateRangeSchema.extend({
  limit: z.number().int().min(1).max(100).optional()
})

/** ملخص مبيعات / تفصيل دفع / قائمة فواتير — فلاتر اختيارية بنفس منطق القائمة */
export const reportsSalesFilterQuerySchema = reportsDateRangeSchema.extend({
  paymentMethod: z.string().trim().max(64).optional(),
  invoiceSearch: z.string().trim().max(80).optional()
})

/** قائمة فواتير المبيعات ضمن فترة */
export const reportsSalesListQuerySchema = reportsSalesFilterQuerySchema.extend({
  take: z.number().int().min(1).max(500).optional()
})

export const ipcSaleIdSchema = z.string().trim().min(1).max(128)

export const usersSetPermissionStateSchema = z.object({
  userId: z.string().trim().min(1).max(128),
  useCustomPermissions: z.boolean(),
  permissionCodes: z.array(z.string().trim().min(1).max(64)).max(200)
})

export const salesHoldSchema = z.object({
  heldName: z.string().trim().min(1).max(200),
  items: z.array(saleLineSchema).min(1).max(500),
  discount: z.number().finite().min(0).max(1e9)
})

export const customerReceivePaymentSchema = z.object({
  customerId: z.string().trim().min(1).max(128),
  amount: z.number().finite().positive().max(1e9),
  note: z.string().trim().max(500).optional()
})

export const recoveryCartSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().min(1).max(128),
        name: z.string().min(1).max(500),
        quantity: z.number().int().min(1).max(999999),
        unitPrice: z.number().finite().min(0).max(1e9),
        discount: z.number().finite().min(0).max(1e9)
      })
    )
    .min(1)
    .max(500),
  cartDiscount: z.number().finite().min(0).max(1e9)
})

const rawTransportSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('com'), port: z.string().max(32) }),
  z.object({
    type: z.literal('tcp'),
    host: z.string().max(200),
    port: z.number().int().min(1).max(65535)
  })
])

export const hardwareConfigSchema = z.object({
  receiptMode: z.enum(['html-silent', 'escpos-raw']),
  printerName: z.string().max(400),
  paperMm: z.union([z.literal(58), z.literal(80)]),
  autoPrintAfterSale: z.boolean(),
  openDrawerAfterSale: z.boolean(),
  receiptTemplate: z.enum(['default', 'compact', 'detailed']),
  rawTransport: rawTransportSchema,
  scaleTcp: z
    .object({
      host: z.string().max(200),
      port: z.number().int().min(1).max(65535),
      timeoutMs: z.number().int().min(100).max(120_000)
    })
    .nullable(),
  scaleSimulatedKg: z.number().finite().min(0).max(1e4).nullable(),
  receiptLogoPath: z.string().max(2000).nullable().optional(),
  printCode128OnReceipt: z.boolean().optional(),
  arabicEncodingProfile: z.enum(['utf8', 'cp864']).optional(),
  activePrinterProfile: z.string().max(120).optional(),
  mockHardwareMode: z.boolean().optional()
})

export type AuthLoginInput = z.infer<typeof authLoginSchema>
export type SessionOpenInput = z.infer<typeof sessionOpenSchema>
export type SessionCloseInput = z.infer<typeof sessionCloseSchema>
export type SalesCreateInput = z.infer<typeof salesCreateSchema>
export type SalesHoldInput = z.infer<typeof salesHoldSchema>
export type HardwareConfigInput = z.infer<typeof hardwareConfigSchema>
