import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const count = await prisma.product.count({ where: { deletedAt: null } })
  console.log('عدد المنتجات:', count)
  
  // عرض أول 10 منتجات للتأكد
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    take: 10,
    select: { id: true, name: true, quantity: true }
  })
  
  console.log('\nأول 10 منتجات:')
  products.forEach((p, i) => {
    console.log(`${i + 1}. ${p.name} - الكمية: ${p.quantity}`)
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('خطأ:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
