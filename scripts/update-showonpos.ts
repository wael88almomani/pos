import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('تحديث showOnPos لكل التصنيفات والمنتجات...')
  
  const catResult = await prisma.category.updateMany({
    data: {
      showOnPos: false
    }
  })
  
  const prodResult = await prisma.product.updateMany({
    data: {
      showOnPos: false
    }
  })
  
  console.log(`✅ تم تحديث ${catResult.count} تصنيف و ${prodResult.count} منتج`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
