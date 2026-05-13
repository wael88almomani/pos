import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const total = await prisma.product.count();
  const withBarcode = await prisma.product.count({ where: { barcode: { not: null } } });
  const showOnPos = await prisma.product.count({ where: { showOnPos: true } });
  const notDeleted = await prisma.product.count({ where: { deletedAt: null } });
  const posReady = await prisma.product.count({ 
    where: { deletedAt: null, showOnPos: true } 
  });
  
  console.log('📊 إحصائيات المنتجات:');
  console.log(`   إجمالي المنتجات: ${total}`);
  console.log(`   منتجات لها باركود: ${withBarcode}`);
  console.log(`   منتجات showOnPos=true: ${showOnPos}`);
  console.log(`   منتجات غير محذوفة: ${notDeleted}`);
  console.log(`   منتجات جاهزة لـ POS: ${posReady}`);
  
  // عينة من أول 5 منتجات
  const sample = await prisma.product.findMany({
    take: 5,
    select: {
      id: true,
      name: true,
      barcode: true,
      showOnPos: true,
      deletedAt: true,
      categoryId: true
    }
  });
  
  console.log('\n📦 عينة من المنتجات:');
  sample.forEach(p => {
    console.log(`   - ${p.name} (${p.barcode}) | showOnPos: ${p.showOnPos} | deleted: ${p.deletedAt ? 'نعم' : 'لا'}`);
  });
  
  // التصنيفات
  const categories = await prisma.category.count();
  console.log(`\n📁 عدد التصنيفات: ${categories}`);
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
