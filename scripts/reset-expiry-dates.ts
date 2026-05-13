import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔄 تصفير تواريخ الصلاحية لجميع المنتجات...')
  
  const result = await prisma.product.updateMany({
    where: {
      deletedAt: null
    },
    data: {
      expiryDate: null
    }
  })
  
  console.log(`✅ تم تحديث ${result.count} منتج - تاريخ الانتهاء = فارغ`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ خطأ:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
