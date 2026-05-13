import type { HardwareConfig } from '../hardware-settings'

const JD = (n: number) => `${n.toFixed(2)} JD`

export type HtmlReceiptInput = {
  storeName: string
  invoiceNumber: string
  cashier: string
  lines: { name: string; qty: number; price: number; total: number }[]
  subtotal: number
  discount: number
  tax: number
  total: number
  paymentMethod: string
  /** data:image/png;base64,... */
  qrDataUrl?: string | null
  logoDataUrl?: string | null
  /** Code128 للفاتورة */
  barcode128DataUrl?: string | null
  paperMm: 58 | 80
  template: HardwareConfig['receiptTemplate']
}

function tplDefault(body: string, widthPx: number): string {
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; margin: 0; padding: 8px; width: ${widthPx}px; font-size: 12px; color: #111; }
  h1 { font-size: 15px; margin: 0 0 6px; text-align: center; }
  .muted { color: #555; font-size: 11px; text-align: center; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { text-align: right; padding: 3px 0; border-bottom: 1px solid #ddd; font-size: 11px; }
  th { font-weight: 600; }
  .num { font-family: ui-monospace, monospace; text-align: left; direction: ltr; }
  .tot { font-size: 14px; font-weight: bold; margin-top: 8px; display: flex; justify-content: space-between; }
  .qr { text-align: center; margin-top: 10px; }
  .qr img { width: 120px; height: 120px; }
</style></head><body>${body}</body></html>`
}

export function buildThermalReceiptHtml(input: HtmlReceiptInput): string {
  const widthPx = input.paperMm === 58 ? 220 : 280
  const logo = input.logoDataUrl
    ? `<div style="text-align:center;margin-bottom:6px"><img src="${input.logoDataUrl}" style="max-width:120px;max-height:48px;object-fit:contain" alt=""/></div>`
    : ''
  const qr = input.qrDataUrl ? `<div class="qr"><img src="${input.qrDataUrl}" alt="QR"/></div>` : ''
  const bc = input.barcode128DataUrl
    ? `<div style="text-align:center;margin-top:8px"><img src="${input.barcode128DataUrl}" style="max-width:95%;height:auto" alt="barcode"/></div>`
    : ''

  const rows = input.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.name)}</td><td class="num">${l.qty}</td><td class="num">${JD(l.price)}</td><td class="num">${JD(l.total)}</td></tr>`
    )
    .join('')

  const compact = input.template === 'compact'
  const body = `
${logo}
<h1>${escapeHtml(input.storeName)}</h1>
<div class="muted">${escapeHtml(input.invoiceNumber)}</div>
${bc}
<div class="muted">كاشير: ${escapeHtml(input.cashier)}</div>
${compact ? '' : '<hr style="border:none;border-top:1px dashed #ccc;margin:8px 0"/>'}
<table><thead><tr><th>صنف</th><th>عدد</th><th>سعر</th><th>إجمالي</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot"><span>الإجمالي</span><span class="num">${JD(input.total)}</span></div>
${input.template === 'detailed' ? `<div class="muted" style="margin-top:6px">فرعي ${JD(input.subtotal)} — خصم ${JD(input.discount)} — ضريبة ${JD(input.tax)}</div>` : ''}
<div class="muted" style="margin-top:4px">الدفع: ${escapeHtml(input.paymentMethod)}</div>
${qr}
<div class="muted" style="margin-top:12px">شكراً لزيارتكم</div>
`
  return tplDefault(body, widthPx)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
