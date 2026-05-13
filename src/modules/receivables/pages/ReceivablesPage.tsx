import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { arSA } from 'date-fns/locale'
import { CURRENCY_LABEL, CURRENCY_SUFFIX } from '../../../core/currency'
import { Can } from '../../../core/Can'
import { useToastStore } from '../../../core/toast-store'

type CustomerRow = {
  id: string
  name: string
  phone: string | null
  balance: number
}

type InvoiceDetail = {
  id: string
  invoiceNumber: string
  date: string
  total: number
  paid: number
  balance: number
}

type InvoiceFullDetails = {
  id: string
  invoiceNumber: string
  createdAt: string
  subtotal: number
  discount: number
  taxRate: number
  taxAmount: number
  total: number
  paid: number
  balance: number
  paymentMethod: string
  cashReceived: number | null
  changeDue: number | null
  customerName: string | null
  userName: string | null
  items: {
    productName: string
    quantity: number
    unitPrice: number
    discount: number
    lineTotal: number
  }[]
}

export function ReceivablesPage() {
  const toast = useToastStore((s) => s.push)
  const [items, setItems] = useState<CustomerRow[]>([])
  const [search, setSearch] = useState('')
  const [payOpen, setPayOpen] = useState<CustomerRow | null>(null)
  const [detailsOpen, setDetailsOpen] = useState<CustomerRow | null>(null)
  const [invoices, setInvoices] = useState<InvoiceDetail[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [invoiceDetailsOpen, setInvoiceDetailsOpen] = useState<string | null>(null)
  const [invoiceFullDetails, setInvoiceFullDetails] = useState<InvoiceFullDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payBusy, setPayBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await window.posApi.customers.list({ search })
    if (r.ok && 'items' in r) setItems(r.items as CustomerRow[])
  }, [search])

  useEffect(() => {
    const t = setTimeout(() => void load(), 200)
    return () => clearTimeout(t)
  }, [load])

  const debtors = useMemo(() => items.filter((c) => c.balance > 0.0001).sort((a, b) => b.balance - a.balance), [items])
  const totalDebt = useMemo(() => debtors.reduce((s, c) => s + c.balance, 0), [debtors])

  async function loadCustomerInvoices(customerId: string) {
    setLoadingInvoices(true)
    try {
      const r = await window.posApi.customers.invoices({ customerId })
      console.log('Invoices response:', r)
      if (r.ok && 'items' in r) {
        const sales = (r.items as any[])
        console.log('Sales items:', sales)
        setInvoices(
          sales.map((s) => ({
            id: s.id,
            invoiceNumber: s.invoiceNumber,
            date: s.createdAt,
            total: s.total,
            paid: s.paid || 0,
            balance: s.balance
          }))
        )
      }
    } finally {
      setLoadingInvoices(false)
    }
  }

  async function loadInvoiceDetails(saleId: string) {
    setLoadingDetails(true)
    try {
      const r = await window.posApi.customers.invoiceDetails({ saleId })
      if (r.ok && 'invoice' in r) {
        setInvoiceFullDetails(r.invoice as InvoiceFullDetails)
      } else {
        toast('تعذر تحميل تفاصيل الفاتورة', 'err')
      }
    } finally {
      setLoadingDetails(false)
    }
  }

  async function submitPayment() {
    if (!payOpen) return
    const amt = Number(payAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast('أدخل مبلغاً صالحاً', 'err')
      return
    }
    setPayBusy(true)
    try {
      const r = await window.posApi.customers.receivePayment({
        customerId: payOpen.id,
        amount: amt,
        note: payNote.trim() || undefined
      })
      if (!r.ok) {
        const code = (r as { code?: string }).code
        const msg =
          'message' in r && typeof (r as { message?: string }).message === 'string'
            ? (r as { message: string }).message
            : code === 'NO_DEBT'
              ? 'لا توجد ذمة على هذا الزبون'
              : code === 'AMOUNT_EXCEEDS_BALANCE'
                ? 'المبلغ أكبر من رصيد الذمة'
                : 'تعذّر تسجيل الدفعة'
        toast(msg, 'err')
        return
      }
      toast('تم تسجيل الدفعة وتحديث الذمة')
      setPayOpen(null)
      setPayAmount('')
      setPayNote('')
      void load()
    } finally {
      setPayBusy(false)
    }
  }

  useEffect(() => {
    if (payOpen) setPayAmount(String(Math.round(payOpen.balance * 100) / 100))
  }, [payOpen])

  useEffect(() => {
    if (detailsOpen) {
      void loadCustomerInvoices(detailsOpen.id)
    } else {
      setInvoices([])
    }
  }, [detailsOpen])

  useEffect(() => {
    if (invoiceDetailsOpen) {
      void loadInvoiceDetails(invoiceDetailsOpen)
    } else {
      setInvoiceFullDetails(null)
    }
  }, [invoiceDetailsOpen])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#d0d0d0]">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 shadow">
        <h1 className="text-lg font-black text-[#1a1a1a]">ذمم الزبائن</h1>
        <div className="flex items-center gap-2">
          <input
            className="border border-slate-400 bg-white px-2 py-1 text-sm min-w-[180px] shadow-inner"
            placeholder="بحث بالاسم أو الهاتف…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="text-xs font-bold text-[#1a1a1a] whitespace-nowrap">
            إجمالي الذمم:{' '}
            <span className="font-mono tabular-nums" dir="ltr">
              {totalDebt.toFixed(2)}
              {CURRENCY_SUFFIX}
            </span>
          </span>
        </div>
      </div>

      {/* المحتوى */}
      <div className="flex-1 overflow-auto p-3">
        <div className="border-2 border-[#808080] bg-white shadow">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d8d8d8]">
                <th className="border-l border-[#c0c0c0] px-3 py-2 text-right font-black">الزبون</th>
                <th className="border-l border-[#c0c0c0] px-3 py-2 text-right font-black">الهاتف</th>
                <th className="border-l border-[#c0c0c0] px-3 py-2 text-right font-black">الذمة ({CURRENCY_LABEL})</th>
                <th className="px-3 py-2 text-center font-black w-36">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {debtors.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                    لا توجد ذمم مستحقة حالياً
                  </td>
                </tr>
              ) : (
                debtors.map((c) => (
                  <tr key={c.id} className="border-b border-[#e0e0e0] hover:bg-[#f5f5f5]">
                    <td className="border-l border-[#e0e0e0] px-3 py-2 font-medium">{c.name}</td>
                    <td className="border-l border-[#e0e0e0] px-3 py-2 font-mono text-xs text-slate-600">{c.phone ?? '—'}</td>
                    <td className="border-l border-[#e0e0e0] px-3 py-2 font-mono font-semibold tabular-nums text-amber-800" dir="ltr">
                      {c.balance.toFixed(2)}
                      {CURRENCY_SUFFIX}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-2 py-1 text-xs font-black text-black shadow"
                          onClick={() => setDetailsOpen(c)}
                        >
                          تفاصيل
                        </button>
                        <Can perm="customer.receive_payment">
                          <button
                            type="button"
                            className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-2 py-1 text-xs font-black text-black shadow"
                            onClick={() => setPayOpen(c)}
                          >
                            استلام دفعة
                          </button>
                        </Can>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-600 mt-2">
          آخر تحديث: {format(new Date(), 'd MMM yyyy HH:mm', { locale: arSA })}
        </p>
      </div>

      {/* مودال التفاصيل */}
      {detailsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="border-2 border-[#808080] bg-[#d0d0d0] shadow-xl w-[720px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-64px)] flex flex-col">
            <div className="border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-sm font-black">تفاصيل الذمم — {detailsOpen.name}</h2>
                <div className="text-xs text-slate-600 mt-0.5">
                  الهاتف: {detailsOpen.phone ?? 'غير متوفر'} | الذمة الإجمالية:{' '}
                  <span className="font-mono font-bold" dir="ltr">
                    {detailsOpen.balance.toFixed(2)}
                    {CURRENCY_SUFFIX}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-2 py-0.5 text-xs font-bold shadow"
                onClick={() => setDetailsOpen(null)}
              >
                ✕
              </button>
            </div>
            <div className="overflow-auto flex-1 p-3">
              {loadingInvoices ? (
                <div className="flex items-center justify-center py-8 text-sm text-slate-600">جاري التحميل...</div>
              ) : invoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-sm text-slate-600">
                  <p>لا توجد فواتير مسجلة لهذا الزبون</p>
                  <p className="text-xs mt-1 text-slate-500">تأكد من أن الفواتير مربوطة بحساب الزبون</p>
                </div>
              ) : (
                <div className="border-2 border-[#808080] bg-white shadow">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b-2 border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d8d8d8]">
                        <th className="border-l border-[#c0c0c0] px-2 py-1.5 text-right font-black">رقم الفاتورة</th>
                        <th className="border-l border-[#c0c0c0] px-2 py-1.5 text-right font-black">التاريخ</th>
                        <th className="border-l border-[#c0c0c0] px-2 py-1.5 text-right font-black">المبلغ</th>
                        <th className="border-l border-[#c0c0c0] px-2 py-1.5 text-right font-black">المدفوع</th>
                        <th className="border-l border-[#c0c0c0] px-2 py-1.5 text-right font-black">الباقي</th>
                        <th className="px-2 py-1.5 text-center font-black w-24">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr 
                          key={inv.id} 
                          className="border-b border-[#e0e0e0] hover:bg-[#e8f4fd] cursor-pointer"
                          onClick={() => setInvoiceDetailsOpen(inv.id)}
                        >
                          <td className="border-l border-[#e0e0e0] px-2 py-1.5 font-mono font-semibold">
                            {inv.invoiceNumber}
                          </td>
                          <td className="border-l border-[#e0e0e0] px-2 py-1.5 font-mono text-slate-600">
                            {format(new Date(inv.date), 'dd/MM/yyyy', { locale: arSA })}
                          </td>
                          <td className="border-l border-[#e0e0e0] px-2 py-1.5 font-mono tabular-nums" dir="ltr">
                            {inv.total.toFixed(2)}
                          </td>
                          <td className="border-l border-[#e0e0e0] px-2 py-1.5 font-mono tabular-nums text-green-700" dir="ltr">
                            {inv.paid.toFixed(2)}
                          </td>
                          <td className="border-l border-[#e0e0e0] px-2 py-1.5 font-mono font-bold tabular-nums text-amber-800" dir="ltr">
                            {inv.balance.toFixed(2)}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <Can perm="customer.receive_payment">
                              <button
                                type="button"
                                className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-2 py-0.5 text-[10px] font-black text-black shadow"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDetailsOpen(null)
                                  setPayOpen(detailsOpen)
                                  setPayAmount(String(Math.round(inv.balance * 100) / 100))
                                }}
                              >
                                سداد
                              </button>
                            </Can>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="border-t-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">عدد الفواتير: {invoices.length}</span>
                <Can perm="customer.receive_payment">
                  <button
                    type="button"
                    className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-3 py-1.5 text-xs font-black text-black shadow"
                    onClick={() => {
                      setDetailsOpen(null)
                      setPayOpen(detailsOpen)
                    }}
                  >
                    استلام دفعة إجمالية
                  </button>
                </Can>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* مودال تفاصيل الفاتورة الكاملة */}
      {invoiceDetailsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="border-2 border-[#808080] bg-[#d0d0d0] shadow-xl w-[680px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-64px)] flex flex-col">
            <div className="border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 flex items-center justify-between shrink-0">
              <h2 className="text-sm font-black">
                تفاصيل الفاتورة — {invoiceFullDetails?.invoiceNumber || '...'}
              </h2>
              <button
                type="button"
                className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-2 py-0.5 text-xs font-bold shadow"
                onClick={() => setInvoiceDetailsOpen(null)}
              >
                ✕
              </button>
            </div>
            <div className="overflow-auto flex-1 p-3">
              {loadingDetails ? (
                <div className="flex items-center justify-center py-8 text-sm text-slate-600">جاري التحميل...</div>
              ) : !invoiceFullDetails ? (
                <div className="flex items-center justify-center py-8 text-sm text-slate-600">لا توجد بيانات</div>
              ) : (
                <div className="space-y-3">
                  {/* معلومات الفاتورة */}
                  <div className="border-2 border-[#808080] bg-white p-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600">رقم الفاتورة:</span>
                        <span className="font-mono font-bold">{invoiceFullDetails.invoiceNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">التاريخ:</span>
                        <span className="font-mono">
                          {format(new Date(invoiceFullDetails.createdAt), 'dd/MM/yyyy HH:mm', { locale: arSA })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">الزبون:</span>
                        <span className="font-semibold">{invoiceFullDetails.customerName || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">الكاشير:</span>
                        <span className="font-semibold">{invoiceFullDetails.userName || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">طريقة الدفع:</span>
                        <span className="font-semibold">{invoiceFullDetails.paymentMethod}</span>
                      </div>
                    </div>
                  </div>

                  {/* البنود */}
                  <div className="border-2 border-[#808080] bg-white shadow">
                    <div className="border-b-2 border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d8d8d8] px-2 py-1">
                      <span className="text-xs font-black">بنود الفاتورة</span>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#808080] bg-[#f5f5f5]">
                          <th className="border-l border-[#c0c0c0] px-2 py-1 text-right font-black">المنتج</th>
                          <th className="border-l border-[#c0c0c0] px-2 py-1 text-right font-black w-16">الكمية</th>
                          <th className="border-l border-[#c0c0c0] px-2 py-1 text-right font-black w-20">السعر</th>
                          <th className="border-l border-[#c0c0c0] px-2 py-1 text-right font-black w-20">الخصم</th>
                          <th className="px-2 py-1 text-right font-black w-24">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceFullDetails.items.map((item, idx) => (
                          <tr key={idx} className="border-b border-[#e0e0e0]">
                            <td className="border-l border-[#e0e0e0] px-2 py-1">{item.productName}</td>
                            <td className="border-l border-[#e0e0e0] px-2 py-1 font-mono text-center">
                              {item.quantity}
                            </td>
                            <td className="border-l border-[#e0e0e0] px-2 py-1 font-mono" dir="ltr">
                              {item.unitPrice.toFixed(2)}
                            </td>
                            <td className="border-l border-[#e0e0e0] px-2 py-1 font-mono" dir="ltr">
                              {item.discount.toFixed(2)}
                            </td>
                            <td className="px-2 py-1 font-mono font-semibold" dir="ltr">
                              {item.lineTotal.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* الملخص المالي */}
                  <div className="border-2 border-[#808080] bg-white p-3">
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600">المجموع الفرعي:</span>
                        <span className="font-mono" dir="ltr">
                          {invoiceFullDetails.subtotal.toFixed(2)} {CURRENCY_SUFFIX}
                        </span>
                      </div>
                      {invoiceFullDetails.discount > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">الخصم:</span>
                          <span className="font-mono text-red-600" dir="ltr">
                            -{invoiceFullDetails.discount.toFixed(2)} {CURRENCY_SUFFIX}
                          </span>
                        </div>
                      )}
                      {invoiceFullDetails.taxRate > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">الضريبة ({invoiceFullDetails.taxRate}%):</span>
                          <span className="font-mono" dir="ltr">
                            {invoiceFullDetails.taxAmount.toFixed(2)} {CURRENCY_SUFFIX}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-slate-300 pt-1">
                        <span className="font-bold">الإجمالي:</span>
                        <span className="font-mono font-black" dir="ltr">
                          {invoiceFullDetails.total.toFixed(2)} {CURRENCY_SUFFIX}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">المدفوع:</span>
                        <span className="font-mono text-green-700 font-semibold" dir="ltr">
                          {invoiceFullDetails.paid.toFixed(2)} {CURRENCY_SUFFIX}
                        </span>
                      </div>
                      {invoiceFullDetails.balance > 0 && (
                        <div className="flex justify-between">
                          <span className="font-bold text-amber-800">الباقي:</span>
                          <span className="font-mono font-black text-amber-800" dir="ltr">
                            {invoiceFullDetails.balance.toFixed(2)} {CURRENCY_SUFFIX}
                          </span>
                        </div>
                      )}
                      {invoiceFullDetails.cashReceived && (
                        <>
                          <div className="flex justify-between border-t border-slate-300 pt-1">
                            <span className="text-slate-600">النقد المستلم:</span>
                            <span className="font-mono" dir="ltr">
                              {invoiceFullDetails.cashReceived.toFixed(2)} {CURRENCY_SUFFIX}
                            </span>
                          </div>
                          {invoiceFullDetails.changeDue && invoiceFullDetails.changeDue > 0 && (
                            <div className="flex justify-between">
                              <span className="text-slate-600">الباقي المرتجع:</span>
                              <span className="font-mono" dir="ltr">
                                {invoiceFullDetails.changeDue.toFixed(2)} {CURRENCY_SUFFIX}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="border-t-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 shrink-0 flex justify-end">
              <button
                type="button"
                className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-4 py-1.5 text-xs font-bold shadow"
                onClick={() => setInvoiceDetailsOpen(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال الدفعة */}
      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="border-2 border-[#808080] bg-[#d0d0d0] shadow-xl w-[480px] max-w-[calc(100vw-32px)]">
            <div className="border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 flex items-center justify-between">
              <h2 className="text-sm font-black">دفعة — {payOpen.name}</h2>
              <button
                type="button"
                className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-2 py-0.5 text-xs font-bold shadow"
                onClick={() => setPayOpen(null)}
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="border border-slate-400 bg-white p-2 shadow-inner">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">الذمة الحالية</span>
                  <span className="font-mono font-bold tabular-nums" dir="ltr">
                    {payOpen.balance.toFixed(2)}
                    {CURRENCY_SUFFIX}
                  </span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold">المبلغ المستلم</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full border border-slate-400 bg-white px-2 py-1.5 font-mono shadow-inner"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold">ملاحظة (اختياري)</label>
                <input
                  className="w-full border border-slate-400 bg-white px-2 py-1.5 shadow-inner"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                />
              </div>
              <button
                type="button"
                disabled={payBusy}
                className="w-full border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] py-2 text-sm font-black text-black shadow disabled:opacity-50"
                onClick={() => void submitPayment()}
              >
                {payBusy ? 'جاري الحفظ…' : 'تأكيد الدفعة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
