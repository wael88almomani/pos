import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function reset() {
  console.log('🔄 بدء تصفير الكميات وحذف تواريخ الصلاحية...\n');
  
  try {
    // تصفير جميع الكميات وحذف تواريخ الصلاحية
    const result = await prisma.product.updateMany({
      data: {
        quantity: 0,
        expiryDate: null
      }
    });
    
    console.log(`✅ تم تحديث ${result.count} منتج`);
    console.log(`   - تم تصفير جميع الكميات`);
    console.log(`   - تم حذف جميع تواريخ الصلاحية`);
    
    // التحقق
    const withQuantity = await prisma.product.count({
      where: { quantity: { gt: 0 } }
    });
    
    const withExpiry = await prisma.product.count({
      where: { expiryDate: { not: null } }
    });
    
    console.log(`\n📊 التحقق:`);
    console.log(`   - منتجات بكمية > 0: ${withQuantity}`);
    console.log(`   - منتجات بتاريخ صلاحية: ${withExpiry}`);
    
    if (withQuantity === 0 && withExpiry === 0) {
      console.log(`\n✅ تم التصفير بنجاح! جميع المنتجات الآن بكمية 0 وبدون تاريخ صلاحية`);
    }
    
  } catch (error) {
    console.error('❌ خطأ:', error);
    throw error;
  }
}

reset()
  .catch((error) => {
    console.error('❌ خطأ فادح:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
