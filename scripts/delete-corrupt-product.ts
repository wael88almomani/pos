import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔍 حذف المنتج الفاسد باستخدام SQL مباشر...')
  
  // استخدام SQL خام لحذف المنتج
  const result = await prisma.$executeRaw`
    DELETE FROM Product 
    WHERE barcode = '4033100089299'
  `
  
  console.log(`✅ تم حذف ${result} صف`)
  
  // التحقق من عدد المنتجات المتبقية
  const count = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM Product WHERE deletedAt IS NULL
  ` as any[]
  
  console.log(`📊 عدد المنتجات المتبقية: ${count[0].count}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
