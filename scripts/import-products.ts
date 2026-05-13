/**
 * سكريبت استيراد المنتجات من النظام القديم (MySQL backup)
 * يقرأ ملف backup2021-12-21_09-44-08.smartbkp ويستورد المنتجات والتصنيفات
 */

import fs from 'fs';
import readline from 'readline';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface OldProduct {
  product_id: string; // barcode
  product_name: string;
  product_quantity: number;
  cost_price: number;
  retail_price: number;
  category: string;
  expiredate: string | null;
}

// استخراج قيمة من string SQL
function extractValue(value: string): string {
  return value.replace(/^'|'$/g, '').trim();
}

// تحليل صف منتج واحد
function parseProductRow(rowText: string): OldProduct | null {
  try {
    // إزالة الأقواس الخارجية
    const values = rowText.replace(/^\(|\)$/g, '');
    
    // تقسيم القيم بحذر (مع مراعاة الأقواس والفواصل داخل النصوص)
    const parts: string[] = [];
    let current = '';
    let inQuote = false;
    let depth = 0;
    
    for (let i = 0; i < values.length; i++) {
      const char = values[i];
      const prevChar = i > 0 ? values[i - 1] : '';
      
      if (char === "'" && prevChar !== '\\') {
        inQuote = !inQuote;
        current += char;
      } else if (char === '(' && !inQuote) {
        depth++;
        current += char;
      } else if (char === ')' && !inQuote) {
        depth--;
        current += char;
      } else if (char === ',' && !inQuote && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      parts.push(current.trim());
    }
    
    if (parts.length < 19) {
      return null;
    }
    
    const product_id = extractValue(parts[0]);
    const product_name = extractValue(parts[1]);
    const product_quantity = parseFloat(parts[2]) || 0;
    const cost_price = parseFloat(parts[3]) || 0;
    const retail_price = parseFloat(parts[4]) || 0;
    const category = extractValue(parts[8]);
    const expiredate = parts[18] === 'NULL' ? null : extractValue(parts[18]);
    
    // تخطي المنتجات غير الصالحة
    if (!product_id || !product_name || product_name === '' || product_id === '0') {
      return null;
    }
    
    return {
      product_id,
      product_name,
      product_quantity,
      cost_price,
      retail_price,
      category: category || 'عام',
      expiredate
    };
  } catch (error) {
    return null;
  }
}

// قراءة المنتجات سطر بسطر
async function extractProductsFromFile(filePath: string): Promise<OldProduct[]> {
  const products: OldProduct[] = [];
  
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  let inPurchaseSection = false;
  let currentInsert = '';
  
  for await (const line of rl) {
    // بحث عن بداية قسم purchase
    if (line.includes('INSERT INTO `purchase`')) {
      inPurchaseSection = true;
      currentInsert = line;
      continue;
    }
    
    if (inPurchaseSection) {
      currentInsert += ' ' + line;
      
      // إذا انتهى الإدخال (ينتهي بـ ;)
      if (line.trim().endsWith(';')) {
        // استخراج الصفوف من VALUES
        const valuesMatch = currentInsert.match(/VALUES\s+([\s\S]*?);/i);
        
        if (valuesMatch) {
          const valuesSection = valuesMatch[1];
          
          // تقسيم الصفوف
          const rowMatches = valuesSection.match(/\([^)]*(?:\([^)]*\)[^)]*)*\)/g);
          
          if (rowMatches) {
            for (const rowMatch of rowMatches) {
              const product = parseProductRow(rowMatch);
              if (product) {
                products.push(product);
              }
            }
          }
        }
        
        inPurchaseSection = false;
        currentInsert = '';
      }
    }
  }
  
  return products;
}

async function main() {
  console.log('🚀 بدء استيراد المنتجات من النظام القديم...\n');
  
  const sqlFilePath = 'd:\\شغل\\POS\\باب الهوى\\backup2021-12-21_09-44-08.smartbkp';
  
  // التحقق من وجود الملف
  if (!fs.existsSync(sqlFilePath)) {
    throw new Error(`الملف غير موجود: ${sqlFilePath}`);
  }
  
  console.log('📖 قراءة ملف SQL...');
  console.log('🔍 استخراج المنتجات (قد يستغرق دقائق)...');
  const products = await extractProductsFromFile(sqlFilePath);
  console.log(`✅ تم العثور على ${products.length} منتج\n`);
  
  if (products.length === 0) {
    console.log('⚠️  لم يتم العثور على منتجات للاستيراد');
    return;
  }
  
  // استخراج التصنيفات الفريدة
  const categoriesSet = new Set<string>();
  products.forEach(p => {
    if (p.category && p.category.trim()) {
      categoriesSet.add(p.category.trim());
    }
  });
  
  const categories = Array.from(categoriesSet);
  console.log(`📁 تم العثور على ${categories.length} تصنيف فريد`);
  categories.forEach(cat => console.log(`   - ${cat}`));
  console.log();
  
  // إنشاء التصنيفات
  console.log('📦 إنشاء/تحديث التصنيفات...');
  const categoryMap = new Map<string, string>(); // name -> id
  
  for (const categoryName of categories) {
    try {
      // البحث عن التصنيف أولاً
      let category = await prisma.category.findFirst({
        where: { name: categoryName }
      });
      
      // إن لم يكن موجود، أنشئه
      if (!category) {
        category = await prisma.category.create({
          data: { name: categoryName }
        });
      }
      
      categoryMap.set(categoryName, category.id);
      console.log(`   ✓ ${categoryName}`);
    } catch (error) {
      console.error(`   ✗ فشل إنشاء التصنيف: ${categoryName}`, error);
    }
  }
  
  // الحصول على تصنيف افتراضي للمنتجات بدون تصنيف
  let defaultCategory = await prisma.category.findFirst({
    where: { name: 'عام' }
  });
  
  if (!defaultCategory) {
    defaultCategory = await prisma.category.create({
      data: {
        name: 'عام'
      }
    });
  }
  
  console.log(`\n📦 بدء استيراد ${products.length} منتج...`);
  
  let imported = 0;
  let updated = 0;
  let errors = 0;
  
  for (const product of products) {
    try {
      const categoryId = categoryMap.get(product.category) || defaultCategory.id;
      
      // التحقق من وجود المنتج
      const existing = await prisma.product.findFirst({
        where: { barcode: product.product_id }
      });
      
      // معالجة تاريخ الانتهاء بشكل آمن
      let expiryDate: Date | null = null;
      if (product.expiredate) {
        try {
          const date = new Date(product.expiredate);
          // التحقق من صحة التاريخ
          if (!isNaN(date.getTime())) {
            expiryDate = date;
          }
        } catch (error) {
          // تجاهل التاريخ غير الصالح
        }
      }
      
      const productData = {
        barcode: product.product_id,
        name: product.product_name,
        salePrice: product.retail_price,
        purchasePrice: product.cost_price,
        quantity: Math.floor(product.product_quantity), // تحويل لرقم صحيح
        minStock: 0,
        categoryId: categoryId,
        expiryDate: expiryDate,
        showOnPos: true,
      };
      
      if (existing) {
        // تحديث المنتج الموجود
        await prisma.product.update({
          where: { id: existing.id },
          data: productData
        });
        updated++;
      } else {
        // إضافة منتج جديد
        await prisma.product.create({
          data: productData
        });
        imported++;
      }
      
      // عرض التقدم كل 100 منتج
      if ((imported + updated) % 100 === 0) {
        console.log(`   معالجة: ${imported + updated}/${products.length} (جديد: ${imported}, محدث: ${updated})`);
      }
      
    } catch (error: any) {
      errors++;
      console.error(`   ✗ خطأ في استيراد المنتج ${product.product_id}: ${error.message}`);
    }
  }
  
  console.log(`\n✅ اكتمل الاستيراد!`);
  console.log(`   📊 الإحصائيات:`);
  console.log(`      - منتجات جديدة: ${imported}`);
  console.log(`      - منتجات محدثة: ${updated}`);
  console.log(`      - أخطاء: ${errors}`);
  console.log(`      - إجمالي: ${imported + updated} من ${products.length}`);
}

main()
  .catch((error) => {
    console.error('❌ خطأ فادح:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
