import { describe, expect, it } from 'vitest'
import {
  authLoginSchema,
  formatValidationForClient,
  hardwareConfigSchema,
  recoveryCartSchema,
  sessionOpenSchema
} from './schemas'

describe('ipc schemas', () => {
  it('rejects invalid auth login', () => {
    const r = authLoginSchema.safeParse({ username: '', pin: '1' })
    expect(r.success).toBe(false)
  })

  it('accepts session open', () => {
    const r = sessionOpenSchema.safeParse({ openingCash: 100, deviceId: 'dev-1' })
    expect(r.success).toBe(true)
  })

  it('validates recovery cart', () => {
    const bad = recoveryCartSchema.safeParse({ lines: [], cartDiscount: 0 })
    expect(bad.success).toBe(false)
    const ok = recoveryCartSchema.safeParse({
      lines: [{ productId: 'p1', name: 'X', quantity: 1, unitPrice: 1, discount: 0 }],
      cartDiscount: 0
    })
    expect(ok.success).toBe(true)
  })

  it('parses hardware config', () => {
    const r = hardwareConfigSchema.safeParse({
      receiptMode: 'html-silent',
      printerName: 'P',
      paperMm: 80,
      autoPrintAfterSale: false,
      openDrawerAfterSale: false,
      receiptTemplate: 'default',
      rawTransport: { type: 'none' },
      scaleTcp: null,
      scaleSimulatedKg: null,
      mockHardwareMode: true
    })
    expect(r.success).toBe(true)
  })

  it('formatValidationForClient is non-empty', () => {
    const r = authLoginSchema.safeParse({})
    expect(r.success).toBe(false)
    if (!r.success) expect(formatValidationForClient(r.error.issues).length).toBeGreaterThan(0)
  })
})
