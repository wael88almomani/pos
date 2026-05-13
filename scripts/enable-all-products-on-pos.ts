import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔄 تفعيل ظهور جميع المنتجات على شاشة البيع...')
  
  const result = await prisma.product.updateMany({
    where: {
      deletedAt: null
    },
    data: {
      showOnPos: true
    }
  })
  
  console.log(`✅ تم تحديث ${result.count} منتج - showOnPos = true`)
  console.log('📱 جميع المنتجات ستظهر الآن على شاشة البيع')
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
