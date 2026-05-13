import { describe, expect, it } from 'vitest'
import { validateSalesCreatePayload } from '../../electron/main/ipc-security'

describe('validateSalesCreatePayload', () => {
  it('accepts valid sale payload', () => {
    const r = validateSalesCreatePayload({
      items: [{ productId: 'p1', quantity: 2, unitPrice: 10.5, discount: 0 }],
      discount: 1,
      paymentMethod: 'cash',
      taxRate: 5,
      cashReceived: 25
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.items).toHaveLength(1)
  })

  it('rejects empty items', () => {
    const r = validateSalesCreatePayload({
      items: [],
      discount: 0,
      paymentMethod: 'cash'
    })
    expect(r.ok).toBe(false)
  })

  it('rejects invalid quantity', () => {
    const r = validateSalesCreatePayload({
      items: [{ productId: 'p1', quantity: 0, unitPrice: 1 }],
      discount: 0,
      paymentMethod: 'card'
    })
    expect(r.ok).toBe(false)
  })
})
