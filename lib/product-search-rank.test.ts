import { describe, expect, it } from 'vitest'
import { rankProduct, sortProductsByQuery } from './product-search-rank'

describe('rankProduct', () => {
  const p = {
    id: '1',
    name: 'حليب كامل الدسم',
    shortName: 'حليب',
    barcode: '6281234567890',
    variantBarcodes: ['200111']
  }

  it('prefers exact main barcode', () => {
    expect(rankProduct('6281234567890', p)).toBe(0)
  })

  it('prefers exact variant barcode', () => {
    expect(rankProduct('200111', p)).toBe(1)
  })

  it('prefix name ranks before fuzzy', () => {
    const s = rankProduct('حليب', p)
    expect(s).not.toBeNull()
    expect(s!).toBeLessThan(20)
  })
})

describe('sortProductsByQuery', () => {
  it('orders by rank', () => {
    const items = [
      { id: 'a', name: 'تفاح', shortName: null, barcode: '111', variantBarcodes: [] as string[] },
      { id: 'b', name: 'تفاح أحمر', shortName: null, barcode: '222', variantBarcodes: [] as string[] }
    ]
    const out = sortProductsByQuery('222', items)
    expect(out[0]?.id).toBe('b')
  })
})
