import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🗑️  حذف جميع العملاء...')
  
  const result = await prisma.customer.deleteMany({})
  
  console.log(`✅ تم حذف ${result.count} عميل بنجاح!`)
}

main()
  .catch((e) => {
    console.error('❌ خطأ:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
