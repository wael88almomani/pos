import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fix() {
  console.log('🔍 البحث عن المنتجات بكميات خاطئة...\n');
  
  // استخدام SQL مباشر لتحديث الكميات الخاطئة
  const MAX_QUANTITY = 999999;
  
  try {
    // تصفير أي كمية أكبر من الحد الأقصى
    const result1 = await prisma.$executeRaw`
      UPDATE Product 
      SET quantity = 0 
      WHERE quantity > ${MAX_QUANTITY} OR quantity < ${-MAX_QUANTITY}
    `;
    
    console.log(`✅ تم إصلاح ${result1} منتج بكميات خاطئة (تم تصفيرها)\n`);
    
    // التحقق النهائي
    const total = await prisma.product.count();
    console.log(`📊 إجمالي المنتجات: ${total}`);
    console.log(`✅ جميع المنتجات الآن بكميات صحيحة!`);
    
  } catch (error) {
    console.error('❌ خطأ في الإصلاح:', error);
    throw error;
  }
}

fix()
  .catch((error) => {
    console.error('❌ خطأ:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
