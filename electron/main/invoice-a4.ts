import { getPrisma } from './database'
import { renderHtmlToPdfBuffer } from './printing/silent-print'

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function buildSaleInvoiceA4Html(saleId: string): Promise<string> {
  const p = getPrisma()
  const [sale, storeName, vatId, footer] = await Promise.all([
    p.sale.findFirst({
      where: { id: saleId, deletedAt: null },
      include: { items: { include: { product: true } }, user: true, customer: true }
    }),
    p.setting.findUnique({ where: { key: 'store.name' } }),
    p.setting.findUnique({ where: { key: 'store.vatId' } }),
    p.setting.findUnique({ where: { key: 'store.invoiceFooter' } })
  ])
  if (!sale) throw new Error('NOT_FOUND')
  const name = storeName?.value?.trim() || 'المتجر'
  const vat = vatId?.value?.trim() || ''
  const foot = footer?.value?.trim() || ''

  const rows = sale.items
    .map(
      (it) => `
    <tr>
      <td>${escape(it.product.name)}</td>
      <td class="n">${it.quantity}</td>
      <td class="n">${Number(it.unitPrice).toFixed(2)}</td>
      <td class="n">${Number(it.lineTotal).toFixed(2)}</td>
    </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
<style>
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; margin: 24px; color: #111; font-size: 12px; }
  header { border-bottom: 2px solid #0d9488; padding-bottom: 12px; margin-bottom: 16px; }
  h1 { margin: 0; font-size: 22px; color: #0f766e; }
  .meta { margin-top: 8px; color: #444; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ccc; padding: 8px; text-align: right; }
  th { background: #f0fdfa; }
  td.n { text-align: left; direction: ltr; font-family: ui-monospace, monospace; }
  .tot { margin-top: 16px; width: 280px; margin-right: 0; margin-left: auto; }
  .tot div { display: flex; justify-content: space-between; padding: 4px 0; }
  .grand { font-weight: bold; font-size: 14px; border-top: 2px solid #0d9488; margin-top: 8px; padding-top: 8px; }
  footer { margin-top: 32px; font-size: 11px; color: #666; border-top: 1px solid #ddd; padding-top: 12px; }
</style></head><body>
  <header>
    <h1>${escape(name)}</h1>
    <div class="meta">
      ${vat ? `<div>الرقم الضريبي: ${escape(vat)}</div>` : ''}
      <div>فاتورة ضريبية — ${escape(sale.invoiceNumber)}</div>
      <div>التاريخ: ${sale.createdAt.toLocaleString('ar-SA')}</div>
      <div>الكاشير: ${escape(sale.user.displayName)}</div>
      ${sale.customer ? `<div>العميل: ${escape(sale.customer.name)}</div>` : ''}
    </div>
  </header>
  <table>
    <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="tot">
    <div><span>الإجمالي قبل الضريبة</span><span>${Number(sale.subtotal).toFixed(2)}</span></div>
    <div><span>الخصم</span><span>${Number(sale.discount).toFixed(2)}</span></div>
    <div><span>نسبة الضريبة</span><span>${Number(sale.taxRate).toFixed(2)}%</span></div>
    <div><span>مبلغ الضريبة</span><span>${Number(sale.taxAmount).toFixed(2)}</span></div>
    <div class="grand"><span>الإجمالي</span><span>${Number(sale.total).toFixed(2)}</span></div>
    <div><span>طريقة الدفع</span><span>${escape(sale.paymentMethod)}</span></div>
  </div>
  <footer>${escape(foot || 'شكراً لتعاملكم معنا.')}</footer>
</body></html>`
}

export async function exportSaleInvoicePdf(saleId: string): Promise<Buffer> {
  const html = await buildSaleInvoiceA4Html(saleId)
  return renderHtmlToPdfBuffer(html)
}
