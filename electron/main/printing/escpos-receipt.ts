import { ESCPOS_DRAWER_KICK_PIN2 } from './raw-transport'

export type EscposReceiptInput = {
  storeName: string
  invoiceNumber: string
  cashier: string
  lines: { name: string; qty: number; price: number; total: number }[]
  subtotal: number
  discount: number
  tax: number
  total: number
  paymentMethod: string
  /** Plain text footer (Arabic requires UTF-8 capable firmware) */
  footer?: string
}

function initUtf8(): Buffer {
  // ESC @ init; FS . C UTF-8 mode (common on Epson-compatible)
  return Buffer.concat([
    Buffer.from([0x1b, 0x40]),
    Buffer.from([0x1b, 0x74, 0x11]),
    Buffer.from([0x1c, 0x2e, 0x43, 0x01])
  ])
}

function textLine(s: string): Buffer {
  return Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0x0a])])
}

function cutPartial(): Buffer {
  return Buffer.from([0x1d, 0x56, 0x42, 0x00])
}

/** Build ESC/POS buffer (UTF-8). Test on target printer — code pages vary. */
export function buildEscposReceipt(input: EscposReceiptInput): Buffer {
  const parts: Buffer[] = [initUtf8()]
  parts.push(textLine('---'))
  parts.push(textLine(input.storeName))
  parts.push(textLine(input.invoiceNumber))
  parts.push(textLine(`Cashier: ${input.cashier}`))
  parts.push(textLine('---'))
  for (const l of input.lines) {
    const nm = l.name.slice(0, 32)
    parts.push(textLine(`${nm}`))
    parts.push(textLine(`  ${l.qty} x ${l.price.toFixed(2)} = ${l.total.toFixed(2)}`))
  }
  parts.push(textLine('---'))
  parts.push(textLine(`Subtotal: ${input.subtotal.toFixed(2)}`))
  parts.push(textLine(`Discount: ${input.discount.toFixed(2)}`))
  parts.push(textLine(`Tax: ${input.tax.toFixed(2)}`))
  parts.push(textLine(`TOTAL: ${input.total.toFixed(2)}`))
  parts.push(textLine(`Pay: ${input.paymentMethod}`))
  if (input.footer) parts.push(textLine(input.footer))
  parts.push(textLine(' '))
  parts.push(cutPartial())
  return Buffer.concat(parts)
}

export function buildDrawerKickOnly(): Buffer {
  return Buffer.concat([initUtf8(), ESCPOS_DRAWER_KICK_PIN2, textLine(' ')])
}
