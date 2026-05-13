import type { Decimal } from '@prisma/client/runtime/library'

export function mapProduct(product: {
  id: string
  name: string
  shortName: string | null
  categoryId: string | null
  category?: { name: string } | null
  barcode: string | null
  purchasePrice: Decimal
  salePrice: Decimal
  averageCost: Decimal
  quantity: number
  minStock: number
  expiryDate: Date | null
  imagePath: string | null
  showOnPos: boolean
  isWeighted: boolean
  weightPrefix: string | null
  barcodes?: { id: string; barcode: string; variantName: string | null; isDefault: boolean }[]
}) {
  return {
    id: product.id,
    name: product.name,
    shortName: product.shortName,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    barcode: product.barcode,
    purchasePrice: Number(product.purchasePrice),
    salePrice: Number(product.salePrice),
    averageCost: Number(product.averageCost),
    quantity: product.quantity,
    minStock: product.minStock,
    expiryDate: product.expiryDate ? product.expiryDate.toISOString() : null,
    imagePath: product.imagePath,
    showOnPos: product.showOnPos,
    isWeighted: product.isWeighted,
    weightPrefix: product.weightPrefix,
    barcodes: product.barcodes ?? []
  }
}
