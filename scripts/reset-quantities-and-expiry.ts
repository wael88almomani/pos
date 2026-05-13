import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔄 تصفير الكميات وتواريخ الانتهاء لجميع المنتجات...')
  
  const result = await prisma.product.updateMany({
    where: {
      deletedAt: null
    },
    data: {
      quantity: 0,
      expiryDate: null
    }
  })
  
  console.log(`✅ تم تحديث ${result.count} منتج`)
  console.log('   - الكمية = 0')
  console.log('   - تاريخ الانتهاء = فارغ')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
