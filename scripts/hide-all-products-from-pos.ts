import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔄 إخفاء جميع المنتجات من شاشة البيع...')
  
  const result = await prisma.product.updateMany({
    where: {
      deletedAt: null
    },
    data: {
      showOnPos: false
    }
  })
  
  console.log(`✅ تم تحديث ${result.count} منتج - showOnPos = false`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
