import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔄 تحديث الكميات لجميع المنتجات إلى 30...')
  
  const result = await prisma.product.updateMany({
    where: {
      deletedAt: null
    },
    data: {
      quantity: 30
    }
  })
  
  console.log(`✅ تم تحديث ${result.count} منتج - الكمية = 30`)
  console.log('📝 يمكن للمستخدم تغيير الكميات لاحقاً من صفحة المنتجات')
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
