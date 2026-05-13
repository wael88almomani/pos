import { PrismaClient } from '../node_modules/.prisma/client/index.js'
import { randomBytes, scryptSync } from 'node:crypto'

const prisma = new PrismaClient()

function hashPin(pin: string, salt = randomBytes(16).toString('hex')) {
  const key = scryptSync(pin, salt, 64)
  return `${salt}:${key.toString('hex')}`
}

const PERMISSION_CODES = [
  { code: 'pos.sell', description: 'شاشة البيع' },
  { code: 'pos.discount', description: 'تطبيق خصم' },
  { code: 'pos.price_override', description: 'تعديل سعر السطر' },
  { code: 'pos.void', description: 'إلغاء فاتورة' },
  { code: 'product.read', description: 'عرض المنتجات' },
  { code: 'product.write', description: 'إدارة المنتجات' },
  { code: 'inventory.read', description: 'عرض المخزون' },
  { code: 'inventory.write', description: 'تعديل المخزون والجرد' },
  { code: 'supplier.read', description: 'عرض الموردين' },
  { code: 'supplier.write', description: 'إدارة الموردين والدفعات' },
  { code: 'purchase.read', description: 'عرض المشتريات' },
  { code: 'purchase.write', description: 'إنشاء مسودة مشتراة' },
  { code: 'purchase.complete', description: 'إتمام مشتراة وتحديث المخزون' },
  { code: 'returns.sales', description: 'مرتجع مبيعات' },
  { code: 'returns.purchase', description: 'مرتجع مشتريات' },
  { code: 'expense.read', description: 'عرض المصروفات' },
  { code: 'expense.read_all', description: 'عرض كل مصروفات المتجر وفلترتها (مدير)' },
  { code: 'expense.write', description: 'إضافة مصروفات' },
  { code: 'customer.read', description: 'عرض العملاء' },
  { code: 'customer.create', description: 'إضافة عميل جديد' },
  { code: 'customer.edit', description: 'تعديل بيانات عميل' },
  { code: 'customer.delete', description: 'حذف عميل' },
  { code: 'customer.receive_payment', description: 'استلام دفعة من عميل' },
  { code: 'customer.loyalty', description: 'إدارة نقاط الولاء' },
  { code: 'promotion.create', description: 'إنشاء عرض ترويجي' },
  { code: 'promotion.edit', description: 'تعديل عرض ترويجي' },
  { code: 'promotion.delete', description: 'حذف عرض ترويجي' },
  { code: 'reports.read', description: 'التقارير الأساسية' },
  { code: 'reports.advanced', description: 'تقارير متقدمة' },
  { code: 'settings.write', description: 'الإعدادات' },
  { code: 'shift.open', description: 'فتح شفت' },
  { code: 'shift.close', description: 'إغلاق شفت' },
  { code: 'shift.variance_approve', description: 'اعتماد فرق كاش كبير' },
  { code: 'backup.restore', description: 'استعادة نسخة' },
  { code: 'users.manage', description: 'إدارة المستخدمين والأدوار (كامل)' },
  { code: 'users.read', description: 'عرض قائمة المستخدمين' },
  { code: 'users.create', description: 'إضافة مستخدم جديد' },
  { code: 'users.edit', description: 'تعديل مستخدم' },
  { code: 'users.delete', description: 'حذف مستخدم' },
  { code: 'audit.read', description: 'عرض سجل التدقيق' }
] as const

const CASHIER_CODES: (typeof PERMISSION_CODES)[number]['code'][] = [
  'pos.sell',
  'product.read',
  'inventory.read',
  'shift.open',
  'shift.close',
  'returns.sales',
  'expense.read',
  'expense.write',
  'customer.read',
  'customer.create',
  'customer.receive_payment'
]

async function main() {
  await prisma.shortcutBinding.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.returnItem.deleteMany()
  await prisma.return.deleteMany()
  await prisma.purchaseReturnItem.deleteMany()
  await prisma.purchaseReturn.deleteMany()
  await prisma.purchaseItem.deleteMany()
  await prisma.purchaseInvoice.deleteMany()
  await prisma.supplierPayment.deleteMany()
  await prisma.inventoryCountLine.deleteMany()
  await prisma.inventoryCountSession.deleteMany()
  await prisma.saleItem.deleteMany()
  await prisma.sale.deleteMany()
  await prisma.loyaltyLedger.deleteMany()
  await prisma.expense.deleteMany()
  await prisma.expenseCategory.deleteMany()
  await prisma.inventoryMovement.deleteMany()
  await prisma.productBarcode.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
  await prisma.cashierSession.deleteMany()
  await prisma.user.deleteMany()
  await prisma.rolePermission.deleteMany()
  await prisma.permission.deleteMany()
  await prisma.role.deleteMany()
  await prisma.paymentMethod.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.supplier.deleteMany()
  await prisma.setting.deleteMany()

  await prisma.permission.createMany({ data: [...PERMISSION_CODES] })

  const allPerms = await prisma.permission.findMany()
  type PermissionRow = (typeof allPerms)[number]
  const byCode = (c: string) => allPerms.find((p: PermissionRow) => p.code === c)!.id

  const adminRole = await prisma.role.create({
    data: {
      name: 'مدير',
      code: 'admin',
      permissions: {
        create: allPerms.map((p: PermissionRow) => ({ permissionId: p.id }))
      }
    }
  })

  const cashierRole = await prisma.role.create({
    data: {
      name: 'كاشير',
      code: 'cashier',
      permissions: {
        create: CASHIER_CODES.map((c) => ({ permissionId: byCode(c) }))
      }
    }
  })

  await prisma.user.create({
    data: {
      username: 'admin',
      displayName: 'مدير النظام',
      pinHash: hashPin('1234'),
      roleId: adminRole.id
    }
  })

  await prisma.user.create({
    data: {
      username: 'cashier1',
      displayName: 'أحمد الكاشير',
      pinHash: hashPin('0000'),
      roleId: cashierRole.id
    }
  })

  await prisma.paymentMethod.createMany({
    data: [
      { code: 'cash', nameAr: 'نقدي', sortOrder: 1 },
      { code: 'card', nameAr: 'بطاقة', sortOrder: 2 },
      { code: 'mixed', nameAr: 'متعدد', sortOrder: 3 },
      { code: 'visa', nameAr: 'فيزا', sortOrder: 4 },
      { code: 'mada', nameAr: 'مدى', sortOrder: 5 },
      { code: 'click', nameAr: 'كليك', sortOrder: 6 },
      { code: 'check', nameAr: 'شيك', sortOrder: 7 },
      { code: 'credit', nameAr: 'آجل / ذمة', sortOrder: 8 }
    ]
  })

  await prisma.setting.createMany({
    data: [
      { key: 'store.name', value: 'سوبرماركت النخيل' },
      { key: 'backup.path', value: 'D:/backup' },
      { key: 'shift.variance_pin_threshold', value: '100' },
      { key: 'session.timeout_minutes', value: '30' }
    ]
  })

  await prisma.expenseCategory.createMany({
    data: [
      { name: 'عام', sortOrder: 1 },
      { name: 'نقل', sortOrder: 2 },
      { name: 'صيانة', sortOrder: 3 },
      { name: 'رواتب', sortOrder: 4 }
    ]
  })

  const beverages = await prisma.category.create({ data: { name: 'مشروبات', sortOrder: 1 } })
  const snacks = await prisma.category.create({ data: { name: 'وجبات خفيفة', sortOrder: 2 } })
  const dairy = await prisma.category.create({ data: { name: 'ألبان', sortOrder: 3 } })

  const winston = await prisma.product.create({
    data: {
      name: 'Winston سجائر',
      shortName: 'Winston',
      categoryId: snacks.id,
      barcode: null,
      purchasePrice: 18,
      salePrice: 22,
      averageCost: 18,
      quantity: 500,
      minStock: 50,
      showOnPos: true,
      barcodes: {
        create: [
          { barcode: '6281000000001', variantName: 'افتراضي', isDefault: true },
          { barcode: '123456789001', variantName: 'أحمر', isDefault: false },
          { barcode: '123456789002', variantName: 'أزرق', isDefault: false },
          { barcode: '123456789003', variantName: 'أسود', isDefault: false }
        ]
      }
    }
  })

  await prisma.product.createMany({
    data: [
      {
        name: 'مياه معدنية 600مل',
        shortName: 'مياه 600',
        categoryId: beverages.id,
        barcode: '6281000000100',
        purchasePrice: 0.35,
        salePrice: 0.5,
        averageCost: 0.35,
        quantity: 2000,
        minStock: 200,
        showOnPos: true
      },
      {
        name: 'حليب كامل الدسم 1ل',
        shortName: 'حليب 1ل',
        categoryId: dairy.id,
        barcode: '6281000000200',
        purchasePrice: 2.1,
        salePrice: 2.8,
        averageCost: 2.1,
        quantity: 120,
        minStock: 20,
        showOnPos: true
      },
      {
        name: 'شوكولاتة مخفية (باركود فقط)',
        shortName: 'شوكولاتة',
        categoryId: snacks.id,
        barcode: '6281000000999',
        purchasePrice: 0.8,
        salePrice: 1.2,
        averageCost: 0.8,
        quantity: 300,
        minStock: 30,
        showOnPos: false
      }
    ]
  })

  await prisma.supplier.createMany({
    data: [
      { name: 'شركة الموزعين المتحدة', phone: '0500000000' },
      { name: 'مورد الألبان المحلي', phone: '0555555555' }
    ]
  })

  await prisma.customer.create({
    data: {
      name: 'عميل تجريبي',
      phone: '0501111111',
      balance: 0,
      loyaltyPoints: 0
    }
  })

  const defaultShortcuts = [
    { actionId: 'nav.pos', keys: 'F1' },
    { actionId: 'nav.products', keys: 'F2' },
    { actionId: 'nav.invoices', keys: 'F3' },
    { actionId: 'nav.returns', keys: 'F4' },
    { actionId: 'pay.cash', keys: 'F5' },
    { actionId: 'pay.card', keys: 'F6' },
    { actionId: 'pay.other', keys: 'F7' },
    { actionId: 'cart.hold', keys: 'F8' },
    { actionId: 'print.receipt', keys: 'F9' },
    { actionId: 'sale.complete', keys: 'F10' },
    { actionId: 'search.product', keys: 'Home' },
    { actionId: 'pos.held_open', keys: 'F12' },
    { actionId: 'hardware.drawer', keys: 'Shift+F9' },
    { actionId: 'cart.new', keys: 'Control+n' },
    { actionId: 'cart.discount', keys: 'Control+d' },
    { actionId: 'cart.quantity', keys: 'Control+q' },
    { actionId: 'cart.void', keys: 'Control+Delete' }
  ]

  await prisma.shortcutBinding.createMany({ data: defaultShortcuts })

  console.log('Seed OK — admin PIN: 1234, cashier PIN: 0000')
  console.log('Winston multi-barcodes:', winston.id)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
