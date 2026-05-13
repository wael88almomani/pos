import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { arSA } from 'date-fns/locale'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { formatMoney } from '../../../core/currency'
import { useAuthStore } from '../../../core/stores/auth-store'
import { registerAmiriFont } from '../utils/jspdf-arabic-font'

type Preset = 'day' | 'week' | 'month' | 'year' | 'custom'

function startOfDayIso(d: Date): string {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.toISOString()
}

function endOfDayIso(d: Date): string {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x.toISOString()
}

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

function rangeFromPreset(preset: Preset, customFromYmd: string, customToYmd: string): { from: string; to: string; label: string } {
  const now = new Date()
  if (preset === 'custom') {
    let a = parseYmd(customFromYmd)
    let b = parseYmd(customToYmd)
    if (a.getTime() > b.getTime()) [a, b] = [b, a]
    return { from: startOfDayIso(a), to: endOfDayIso(b), label: 'من تاريخ إلى تاريخ' }
  }
  if (preset === 'day') {
    return { from: startOfDayIso(now), to: endOfDayIso(now), label: 'يومي (اليوم)' }
  }
  if (preset === 'week') {
    const from = new Date(now)
    from.setDate(from.getDate() - 6)
    return { from: startOfDayIso(from), to: endOfDayIso(now), label: 'أسبوعي (آخر 7 أيام)' }
  }
  if (preset === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: startOfDayIso(from), to: endOfDayIso(to), label: 'شهري (هذا الشهر)' }
  }
  const from = new Date(now.getFullYear(), 0, 1)
  const to = new Date(now.getFullYear(), 11, 31)
  return { from: startOfDayIso(from), to: endOfDayIso(to), label: 'سنوي (هذه السنة)' }
}

type Summary = { revenue: number; invoices: number }
type TopRow = { name: string; qty: number }
type ProfitRow = { revenue: number; cost: number; profit: number }
type HourRow = { hour: number; label: string; revenue: number; count: number }

type ExpenseReportRow = {
  id: string
  amount: number
  categoryName: string
  note: string | null
  createdAt: string
  createdByName: string
  createdByUsername: string
}

type PaymentBreakRow = { paymentMethod: string; total: number; count: number }

type InvoiceListRow = {
  id: string
  invoiceNumber: string
  createdAt: string
  total: number
  paymentMethod: string
  subtotal: number
  discount: number
  taxAmount: number
  cashierName: string
  customerName: string | null
}

type SaleDetailLine = {
  productName: string
  quantity: number
  unitPrice: number
  discount: number
  lineTotal: number
}

function formatReportDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'PPp', { locale: arSA })
  } catch {
    return iso.slice(0, 19).replace('T', ' ')
  }
}

type SaleDetail = {
  id: string
  invoiceNumber: string
  createdAt: string
  paymentMethod: string
  subtotal: number
  discount: number
  taxRate: number
  taxAmount: number
  total: number
  cashReceived: number | null
  changeDue: number | null
  cashierName: string
  customerName: string | null
  lines: SaleDetailLine[]
}

export function ReportsPage() {
  const expenseReadAll = useAuthStore((s) => s.can('expense.read_all'))
  const [preset, setPreset] = useState<Preset>('day')
  const [customFrom, setCustomFrom] = useState(() => toYmd(new Date()))
  const [customTo, setCustomTo] = useState(() => toYmd(new Date()))

  const range = useMemo(
    () => rangeFromPreset(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  )

  const [summary, setSummary] = useState<Summary | null>(null)
  const [topProducts, setTopProducts] = useState<TopRow[]>([])
  const [profit, setProfit] = useState<ProfitRow | null>(null)
  const [hourly, setHourly] = useState<HourRow[]>([])
  const [invVal, setInvVal] = useState<{ value: number; skus: number } | null>(null)
  const [expenseRows, setExpenseRows] = useState<ExpenseReportRow[]>([])
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentBreakRow[]>([])
  const [invoiceRows, setInvoiceRows] = useState<InvoiceListRow[]>([])
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [debouncedInvoiceSearch, setDebouncedInvoiceSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [paymentLabels, setPaymentLabels] = useState<Record<string, string>>({})
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null)
  const [saleDetail, setSaleDetail] = useState<SaleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const r = await window.posApi.paymentMethods.list()
      if (r.ok && 'items' in r) {
        const items = r.items as { code: string; nameAr: string }[]
        setPaymentLabels(Object.fromEntries(items.map((x) => [x.code, x.nameAr])))
      }
    })()
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedInvoiceSearch(invoiceSearch.trim()), 400)
    return () => window.clearTimeout(t)
  }, [invoiceSearch])

  const paymentLabel = useCallback(
    (code: string) => paymentLabels[code] ?? code,
    [paymentLabels]
  )

  /** يُمرَّر لـ IPC بدون مفاتيح فارغة — يحدّ الملخصات وجدول وسائل الدفع مع قائمة الفواتير */
  const saleReportFilters = useMemo(() => {
    const o: { paymentMethod?: string; invoiceSearch?: string } = {}
    const pm = paymentFilter.trim()
    if (pm) o.paymentMethod = pm
    const inv = debouncedInvoiceSearch.trim()
    if (inv) o.invoiceSearch = inv
    return o
  }, [paymentFilter, debouncedInvoiceSearch])

  const filtersAffectSalesTotals = Boolean(saleReportFilters.paymentMethod || saleReportFilters.invoiceSearch)

  const hasPaymentBreakdownApi = typeof window.posApi?.reports?.paymentBreakdown === 'function'
  const hasSalesListApi = typeof window.posApi?.reports?.salesList === 'function'
  const hasSaleDetailApi = typeof window.posApi?.sales?.getDetail === 'function'

  const loadInvoiceList = useCallback(async () => {
    if (!hasSalesListApi) {
      setInvoiceRows([])
      return
    }
    const { from, to } = range
    try {
      const sl = await window.posApi.reports.salesList({
        from,
        to,
        ...saleReportFilters,
        take: 400
      })
      if (sl.ok && 'items' in sl) {
        setInvoiceRows(sl.items as InvoiceListRow[])
      } else {
        setInvoiceRows([])
      }
    } catch {
      setInvoiceRows([])
    }
  }, [range, saleReportFilters, hasSalesListApi])

  const loadRange = useCallback(async () => {
    setLoading(true)
    setErr(null)
    const { from, to } = range
    try {
      const expPromise = expenseReadAll
        ? window.posApi.expense.list({ from, to })
        : Promise.resolve({ ok: true as const, items: [] as ExpenseReportRow[], meta: { cashierTodayOnly: true } })
      const [sum, top, prof, h, exp, pb] = await Promise.all([
        window.posApi.reports.salesSummary({ from, to, ...saleReportFilters }),
        window.posApi.reports.topSelling({ from, to, limit: 25 }),
        window.posApi.reports.profit({ from, to }),
        window.posApi.reports.hourlySales({ from, to }),
        expPromise,
        hasPaymentBreakdownApi
          ? window.posApi.reports.paymentBreakdown({ from, to, ...saleReportFilters })
          : Promise.resolve({ ok: true as const, items: [] as PaymentBreakRow[] })
      ])
      if (sum.ok && 'revenue' in sum) {
        setSummary({ revenue: sum.revenue as number, invoices: sum.invoices as number })
      } else {
        setSummary(null)
        if (!sum.ok) setErr((sum as { message?: string }).message ?? 'تعذر تحميل ملخص المبيعات')
      }
      if (top.ok && 'items' in top) {
        setTopProducts(
          (top.items as { name: string; qty: number }[]).map((x) => ({ name: x.name, qty: x.qty }))
        )
      } else setTopProducts([])
      if (prof.ok && 'profit' in prof) {
        setProfit({
          revenue: prof.revenue as number,
          cost: prof.cost as number,
          profit: prof.profit as number
        })
      } else setProfit(null)
      if (h.ok && 'items' in h) {
        const items = h.items as { hour: number; revenue: number; count: number }[]
        const filled = Array.from({ length: 24 }, (_, hour) => {
          const hit = items.find((x) => x.hour === hour)
          return { hour, label: `${hour}:00`, revenue: hit?.revenue ?? 0, count: hit?.count ?? 0 }
        })
        setHourly(filled)
      } else setHourly([])
      if (exp.ok && 'items' in exp) {
        setExpenseRows(exp.items as ExpenseReportRow[])
      } else {
        setExpenseRows([])
      }
      if (pb.ok && 'items' in pb) {
        const rows = [...(pb.items as PaymentBreakRow[])].sort((a, b) => b.total - a.total)
        setPaymentBreakdown(rows)
      } else {
        setPaymentBreakdown([])
      }
    } catch (e) {
      setExpenseRows([])
      setPaymentBreakdown([])
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [range, expenseReadAll, hasPaymentBreakdownApi, saleReportFilters])

  useEffect(() => {
    void loadRange()
  }, [loadRange])

  useEffect(() => {
    void loadInvoiceList()
  }, [loadInvoiceList])

  useEffect(() => {
    if (!detailSaleId) {
      setSaleDetail(null)
      return
    }
    if (!hasSaleDetailApi) {
      setSaleDetail(null)
      setDetailLoading(false)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    void (async () => {
      const r = await window.posApi.sales.getDetail(detailSaleId)
      if (cancelled) return
      if (r.ok && 'sale' in r) {
        setSaleDetail(r.sale as SaleDetail)
      } else {
        setSaleDetail(null)
      }
      setDetailLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [detailSaleId, hasSaleDetailApi])

  async function loadInv() {
    const r = await window.posApi.reports.inventoryValue()
    if (r.ok && 'value' in r) setInvVal(r as never)
  }

  const pdfTableDefaults = {
    styles: { font: 'Amiri', halign: 'right' as const, fontSize: 10 },
    headStyles: { font: 'Amiri', halign: 'right' as const, fillColor: [30, 58, 138] as [number, number, number] },
    bodyStyles: { font: 'Amiri', halign: 'right' as const },
    margin: { left: 12, right: 12 }
  }

  const exportPdf = async () => {
    if (!summary) return
    const doc = new jsPDF({ orientation: 'landscape' })
    try {
      await registerAmiriFont(doc)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'تعذّر تجهيز خط العربية للـ PDF')
      return
    }
    const pageW = doc.internal.pageSize.getWidth()
    const margin = 14
    const titleX = pageW - margin
    doc.setFont('Amiri', 'normal')
    doc.setFontSize(14)
    doc.text(`تقارير — ${range.label}`, titleX, 16, { align: 'right' })
    doc.setFontSize(10)
    doc.text(`من ${formatReportDateTime(range.from)} إلى ${formatReportDateTime(range.to)}`, titleX, 22, {
      align: 'right'
    })
    if (filtersAffectSalesTotals) {
      doc.setFontSize(9)
      doc.setTextColor(80, 80, 80)
      doc.text('ملخص المبيعات وجدول وسائل الدفع يعكسان التصفية الحالية (وسيلة الدفع / بحث الفاتورة).', titleX, 28, {
        align: 'right'
      })
      doc.setTextColor(0, 0, 0)
    }
    const startY = filtersAffectSalesTotals ? 34 : 28
    autoTable(doc, {
      ...pdfTableDefaults,
      head: [['المؤشر', 'القيمة']],
      body: [
        ['إيراد الفترة', formatMoney(summary.revenue)],
        ['عدد الفواتير', String(summary.invoices)]
      ],
      startY
    })
    const d0 = doc as unknown as { lastAutoTable?: { finalY: number } }
    let y = (d0.lastAutoTable?.finalY ?? 48) + 8
    const payRows =
      paymentBreakdown.length > 0
        ? paymentBreakdown.map((p) => [
            paymentLabel(p.paymentMethod),
            formatMoney(p.total),
            String(p.count)
          ])
        : []
    if (payRows.length > 0) {
      autoTable(doc, {
        ...pdfTableDefaults,
        head: [['وسيلة الدفع', 'الإجمالي', 'عدد الفواتير']],
        body: payRows,
        startY: y
      })
      y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40
      y += 8
    }
    if (profit) {
      autoTable(doc, {
        ...pdfTableDefaults,
        head: [['بند الأرباح', 'المبلغ']],
        body: [
          ['إيراد', formatMoney(profit.revenue)],
          ['تكلفة', formatMoney(profit.cost)],
          ['ربح', formatMoney(profit.profit)]
        ],
        startY: y
      })
      y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40
      y += 8
    }
    if (topProducts.length > 0) {
      autoTable(doc, {
        ...pdfTableDefaults,
        head: [['المنتج', 'الكمية']],
        body: topProducts.map((p) => [p.name, String(p.qty)]),
        startY: y
      })
      y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40
      y += 8
    }
    if (invoiceRows.length > 0) {
      autoTable(doc, {
        ...pdfTableDefaults,
        head: [['رقم الفاتورة', 'التاريخ', 'وسيلة الدفع', 'الكاشير', 'الإجمالي']],
        body: invoiceRows.map((r) => [
          r.invoiceNumber,
          formatReportDateTime(r.createdAt),
          paymentLabel(r.paymentMethod),
          r.cashierName,
          formatMoney(r.total)
        ]),
        startY: y,
        styles: { ...pdfTableDefaults.styles, fontSize: 8 },
        headStyles: { ...pdfTableDefaults.headStyles, fontSize: 8 }
      })
      y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40
      y += 8
    }
    if (expenseRows.length > 0) {
      autoTable(doc, {
        ...pdfTableDefaults,
        head: [['التصنيف', 'المبلغ', 'ملاحظة', 'التاريخ', 'المسجّل']],
        body: expenseRows.map((e) => [
          e.categoryName,
          formatMoney(e.amount),
          e.note ?? '',
          formatReportDateTime(e.createdAt),
          `${e.createdByName} (${e.createdByUsername})`
        ]),
        startY: y,
        styles: { ...pdfTableDefaults.styles, fontSize: 8 },
        headStyles: { ...pdfTableDefaults.headStyles, fontSize: 8 }
      })
    }
    doc.save(`pos-report-${range.from.slice(0, 10)}.pdf`)
  }

  const exportExcel = () => {
    if (!summary) return
    const wb = XLSX.utils.book_new()
    wb.Workbook = { Views: [{ RTL: true }], Sheets: [] }

    const filterNote = filtersAffectSalesTotals ? 'نعم (وسيلة الدفع أو بحث الفاتورة)' : 'لا'

    const wsSummary = XLSX.utils.aoa_to_sheet([
      ['تقرير نقاط البيع — ملخص الفترة'],
      [''],
      ['نوع الفترة', range.label],
      ['من', formatReportDateTime(range.from)],
      ['إلى', formatReportDateTime(range.to)],
      ['تصفية على المبيعات', filterNote],
      [''],
      ['ملخص المبيعات'],
      ['الإيراد (JD)', summary.revenue],
      ['عدد الفواتير', summary.invoices]
    ])
    wsSummary['!cols'] = [{ wch: 36 }, { wch: 22 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'ملخص')

    if (paymentBreakdown.length > 0) {
      const wsPay = XLSX.utils.aoa_to_sheet([
        ['وسيلة الدفع', 'الإجمالي (JD)', 'عدد الفواتير'],
        ...paymentBreakdown.map((p) => [paymentLabel(p.paymentMethod), p.total, p.count])
      ])
      wsPay['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, wsPay, 'وسائل الدفع')
    }

    if (topProducts.length > 0) {
      const wsTop = XLSX.utils.aoa_to_sheet([
        ['المادة', 'الكمية'],
        ...topProducts.map((p) => [p.name, p.qty])
      ])
      wsTop['!cols'] = [{ wch: 40 }, { wch: 10 }]
      XLSX.utils.book_append_sheet(wb, wsTop, 'الأكثر مبيعاً')
    }

    if (profit) {
      const wsProfit = XLSX.utils.aoa_to_sheet([
        ['البند', 'المبلغ (JD)'],
        ['إيراد', profit.revenue],
        ['تكلفة', profit.cost],
        ['ربح', profit.profit]
      ])
      wsProfit['!cols'] = [{ wch: 18 }, { wch: 16 }]
      XLSX.utils.book_append_sheet(wb, wsProfit, 'الأرباح')
    }

    if (expenseRows.length > 0) {
      const wsExp = XLSX.utils.aoa_to_sheet([
        ['التصنيف', 'المبلغ (JD)', 'ملاحظة', 'التاريخ', 'المسجّل'],
        ...expenseRows.map((e) => [
          e.categoryName,
          e.amount,
          e.note ?? '',
          formatReportDateTime(e.createdAt),
          `${e.createdByName} (${e.createdByUsername})`
        ])
      ])
      wsExp['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 28 }, { wch: 22 }, { wch: 24 }]
      XLSX.utils.book_append_sheet(wb, wsExp, 'مصروفات')
    }

    if (invoiceRows.length > 0) {
      const wsInv = XLSX.utils.aoa_to_sheet([
        ['رقم الفاتورة', 'التاريخ', 'وسيلة الدفع', 'الزبون', 'الكاشير', 'الإجمالي (JD)'],
        ...invoiceRows.map((r) => [
          r.invoiceNumber,
          formatReportDateTime(r.createdAt),
          paymentLabel(r.paymentMethod),
          r.customerName ?? '',
          r.cashierName,
          r.total
        ])
      ])
      wsInv['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, wsInv, 'فواتير')
    }

    XLSX.writeFile(wb, `pos-report-${range.from.slice(0, 10)}.xlsx`)
  }

  const doPrint = () => {
    window.print()
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#d0d0d0] print:bg-white">
      {/* شريط العنوان */}
      <div className="flex items-center justify-between border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2 shadow print:hidden">
        <h1 className="text-lg font-black text-[#1a1a1a]">التقارير</h1>
        <div className="flex gap-2">
          <button
            type="button"
            className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-3 py-1 text-sm font-bold shadow"
            onClick={() => void loadInv()}
          >
            قيمة المخزون
          </button>
          <button
            type="button"
            className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-3 py-1 text-sm font-bold shadow"
            onClick={() => void exportPdf()}
          >
            تصدير PDF
          </button>
          <button
            type="button"
            className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-3 py-1 text-sm font-bold shadow"
            onClick={exportExcel}
          >
            تصدير Excel
          </button>
          <button
            type="button"
            className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-3 py-1 text-sm font-black text-black shadow"
            onClick={doPrint}
          >
            طباعة
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-6 print:p-4">
      {loading && !summary && !err && (
        <div className="py-16 text-center text-slate-500">جاري التحميل…</div>
      )}

      <div className="rounded-xl border-2 border-[#808080] p-4 space-y-3 bg-[#d0d0d0] shadow-md print:border-0 print:p-0">
        <div className="font-semibold text-sm text-slate-800">الفترة</div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {(
            [
              ['day', 'يومي'],
              ['week', 'أسبوعي'],
              ['month', 'شهري'],
              ['year', 'سنوي'],
              ['custom', 'من — إلى']
            ] as const
          ).map(([k, lab]) => (
            <button
              key={k}
              type="button"
              onClick={() => setPreset(k)}
              className={`rounded-lg px-4 py-2 text-sm font-medium border ${
                preset === k
                  ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {lab}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex flex-wrap gap-3 items-end print:hidden">
            <label className="text-sm space-y-1">
              من
              <input
                type="date"
                className="block rounded-lg border px-3 py-2 bg-transparent"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className="text-sm space-y-1">
              إلى
              <input
                type="date"
                className="block rounded-lg border px-3 py-2 bg-transparent"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </div>
        )}
        <div className="text-xs text-slate-500 print:text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">{range.label}</span>
          {' — '}
          {range.from.slice(0, 10)} → {range.to.slice(0, 10)}
        </div>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <div className="rounded-xl border-2 border-[#808080] p-4 space-y-3 bg-[#d0d0d0] shadow-md print:border-0 print:p-0">
        <div className="font-semibold text-sm text-slate-800">تصفية المبيعات والفواتير</div>
        <p className="text-xs text-slate-500">
          بطاقتا «الإيراد» و«عدد الفواتير» وجدول «وسيلة الدفع» أدناه تعكسان نفس التصفية والفترة.
        </p>
        <div className="flex flex-wrap gap-3 items-end print:hidden">
          <label className="text-sm space-y-1">
            وسيلة الدفع
            <select
              className="block rounded-lg border px-3 py-2 bg-transparent min-w-[10rem]"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
            >
              <option value="">الكل</option>
              {Object.entries(paymentLabels).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1 flex-1 min-w-[12rem]">
            بحث برقم الفاتورة
            <input
              type="search"
              dir="ltr"
              className="block w-full rounded-lg border px-3 py-2 bg-transparent font-mono"
              placeholder="مثال INV- أو جزء من الرقم"
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
            />
          </label>
        </div>
      </div>

      {invVal && (
        <div className="rounded-xl border-2 border-[#808080] p-4 text-sm bg-[#d0d0d0] shadow-md print:border print:p-3">
          قيمة المخزون (متوسط التكلفة × الكمية):{' '}
          <span className="font-mono font-bold">{invVal.value.toFixed(2)}</span> — SKUs: {invVal.skus}
        </div>
      )}

      {/* Inventory Count Section */}
      <div className="rounded-xl border-2 border-[#808080] p-4 bg-[#d0d0d0] shadow-md print:border print:p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">جرد المخزون</div>
            <div className="text-xs text-slate-500">لعرض وإدارة جلسات الجرد والتحقق من الكميات</div>
          </div>
          <Link
            to="/inventory-count"
            className="rounded-lg border-2 border-[#808080] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-4 py-2 text-sm font-bold text-black shadow-sm hover:from-[#90c0e8] hover:to-[#2870b4]"
          >
            عرض الجرد
          </Link>
        </div>
      </div>

      {summary && (
        <div className="space-y-2">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border-2 border-[#808080] p-5 bg-[#d0d0d0] shadow-md print:border print:p-4">
              <div className="text-sm text-slate-700 font-semibold">
                إيراد {filtersAffectSalesTotals ? '(ضمن التصفية)' : '(الفترة كاملة)'}
              </div>
              <div className="text-3xl font-bold font-mono mt-2">{summary.revenue.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border-2 border-[#808080] p-5 bg-[#d0d0d0] shadow-md print:border print:p-4">
              <div className="text-sm text-slate-700 font-semibold">
                عدد الفواتير {filtersAffectSalesTotals ? '(ضمن التصفية)' : '(الفترة كاملة)'}
              </div>
              <div className="text-3xl font-bold font-mono mt-2">{summary.invoices}</div>
            </div>
          </div>
        </div>
      )}

      {paymentBreakdown.length > 0 && (
        <div className="rounded-xl border-2 border-[#808080] p-4 bg-[#d0d0d0] shadow-md print:border space-y-2">
          <div className="font-semibold text-slate-800">المبيعات حسب وسيلة الدفع</div>
          <p className="text-xs text-slate-500">
            {filtersAffectSalesTotals
              ? 'ضمن التصفية الحالية والفترة؛ غالباً صف واحد عند اختيار وسيلة دفع محددة.'
              : 'يفرّق النقد والبطاقة وأي وسائل أخرى معرّفة في الإعدادات ضمن الفترة المختارة.'}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right min-w-[480px]">
              <thead className="border-b border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="p-2">وسيلة الدفع</th>
                  <th className="p-2">عدد الفواتير</th>
                  <th className="p-2">إجمالي المبيعات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paymentBreakdown.map((row) => (
                  <tr key={row.paymentMethod}>
                    <td className="p-2 font-medium">{paymentLabel(row.paymentMethod)}</td>
                    <td className="p-2 font-mono tabular-nums">{row.count}</td>
                    <td className="p-2 font-mono font-semibold tabular-nums">{row.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl border-2 border-[#808080] p-4 bg-[#d0d0d0] shadow-md print:border space-y-3">
        <div className="font-semibold text-slate-800">فواتير المبيعات (تفصيل)</div>
        <p className="text-xs text-slate-500">
          نفس التصفية أعلاه. انقر صفّاً لعرض الأسطر وإعادة طباعة الإيصال (إن وُجدت صلاحية الطباعة).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right min-w-[720px]">
            <thead className="border-b border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="p-2">رقم الفاتورة</th>
                <th className="p-2">التاريخ</th>
                <th className="p-2">وسيلة الدفع</th>
                <th className="p-2">الزبون</th>
                <th className="p-2">الكاشير</th>
                <th className="p-2">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {invoiceRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500">
                    لا توجد فواتير ضمن الفلاتر والفترة الحالية.
                  </td>
                </tr>
              ) : (
                invoiceRows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/80 print:cursor-default"
                    onClick={() => setDetailSaleId(row.id)}
                  >
                    <td className="p-2 font-mono font-semibold">{row.invoiceNumber}</td>
                    <td className="p-2 whitespace-nowrap text-xs text-slate-600">
                      {row.createdAt.slice(0, 19).replace('T', ' ')}
                    </td>
                    <td className="p-2">{paymentLabel(row.paymentMethod)}</td>
                    <td className="p-2 max-w-[140px] truncate">{row.customerName ?? '—'}</td>
                    <td className="p-2">{row.cashierName}</td>
                    <td className="p-2 font-mono font-semibold tabular-nums">{row.total.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {profit && (
        <div className="rounded-xl border-2 border-[#808080] p-4 grid md:grid-cols-3 gap-3 text-sm bg-[#d0d0d0] shadow-md print:border">
          <div>
            إيراد: <span className="font-mono font-bold">{profit.revenue.toFixed(2)}</span>
          </div>
          <div>
            تكلفة: <span className="font-mono font-bold">{profit.cost.toFixed(2)}</span>
          </div>
          <div>
            ربح: <span className="font-mono font-bold text-[#1e40af]">{profit.profit.toFixed(2)}</span>
          </div>
        </div>
      )}

      {expenseRows.length > 0 && (
        <div className="rounded-xl border-2 border-[#808080] p-4 bg-[#d0d0d0] shadow-md print:border space-y-2">
          <div className="font-semibold text-slate-800">مصروفات الفترة</div>
          <p className="text-xs text-slate-500">كل سطر يوضح من سجّل المصروف (لمراجعة المدير).</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right min-w-[560px]">
              <thead className="border-b border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                <tr>
                  <th className="p-2">التصنيف</th>
                  <th className="p-2">المبلغ</th>
                  <th className="p-2">ملاحظة</th>
                  <th className="p-2">التاريخ</th>
                  <th className="p-2">المسجّل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {expenseRows.map((e) => (
                  <tr key={e.id}>
                    <td className="p-2">{e.categoryName}</td>
                    <td className="p-2 font-mono">{e.amount.toFixed(2)}</td>
                    <td className="p-2 text-slate-600 dark:text-slate-400 max-w-[180px] truncate">{e.note ?? '—'}</td>
                    <td className="p-2 text-xs text-slate-500 whitespace-nowrap">{e.createdAt.slice(0, 19).replace('T', ' ')}</td>
                    <td className="p-2">
                      <div className="font-medium">{e.createdByName}</div>
                      <div className="text-xs font-mono text-slate-500">{e.createdByUsername}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {topProducts.length > 0 && (
        <div className="rounded-xl border-2 border-[#808080] p-4 bg-[#d0d0d0] shadow-md h-[360px] print:h-auto print:border print:min-h-0">
          <div className="font-semibold text-slate-800 mb-3">المواد الأكثر مبيعاً</div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={topProducts}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={70} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="qty" fill="#1e40af" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {hourly.length > 0 && (
        <div className="rounded-xl border-2 border-[#808080] p-4 bg-[#d0d0d0] shadow-md h-[360px] print:h-auto print:border print:min-h-0">
          <div className="font-semibold text-slate-800 mb-3">المبيعات بالساعة (ضمن الفترة)</div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={hourly}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip formatter={(v: number) => [v.toFixed(2), 'إيراد']} />
              <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {detailSaleId && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailSaleId(null)
          }}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div>
                <div className="text-lg font-bold">
                  فاتورة {saleDetail?.invoiceNumber ?? '…'}
                </div>
                {saleDetail && (
                  <div className="mt-1 font-mono text-xs text-slate-500 dir-ltr text-end">
                    {saleDetail.createdAt.slice(0, 19).replace('T', ' ')}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-sm dark:border-slate-600"
                onClick={() => setDetailSaleId(null)}
              >
                إغلاق
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-auto p-4">
              {detailLoading && <div className="py-8 text-center text-slate-500">جاري التحميل…</div>}
              {!detailLoading && !saleDetail && (
                <div className="py-8 text-center text-red-600">تعذر تحميل الفاتورة.</div>
              )}
              {!detailLoading && saleDetail && (
                <>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      وسيلة الدفع:{' '}
                      <span className="font-semibold">{paymentLabel(saleDetail.paymentMethod)}</span>
                    </div>
                    <div>
                      الكاشير: <span className="font-semibold">{saleDetail.cashierName}</span>
                    </div>
                    {saleDetail.customerName ? (
                      <div className="sm:col-span-2">
                        الزبون: <span className="font-semibold">{saleDetail.customerName}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800">
                        <tr>
                          <th className="p-2 text-right">المادة</th>
                          <th className="p-2 text-center">الكمية</th>
                          <th className="p-2 text-end">السعر</th>
                          <th className="p-2 text-end">خصم</th>
                          <th className="p-2 text-end">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {saleDetail.lines.map((ln, i) => (
                          <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="p-2">{ln.productName}</td>
                            <td className="p-2 text-center font-mono">{ln.quantity}</td>
                            <td className="p-2 text-end font-mono">{ln.unitPrice.toFixed(2)}</td>
                            <td className="p-2 text-end font-mono">{ln.discount.toFixed(2)}</td>
                            <td className="p-2 text-end font-mono font-semibold">{ln.lineTotal.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap justify-end gap-4 border-t pt-3 font-mono text-sm">
                    <span>قبل الضريبة {saleDetail.subtotal.toFixed(2)}</span>
                    <span>خصم {saleDetail.discount.toFixed(2)}</span>
                    <span>
                      ضريبة ({saleDetail.taxRate}%) {saleDetail.taxAmount.toFixed(2)}
                    </span>
                    <span className="text-base font-bold">الإجمالي {saleDetail.total.toFixed(2)}</span>
                  </div>
                  {saleDetail.cashReceived != null ? (
                    <div className="font-mono text-xs text-slate-600">
                      المستلم: {saleDetail.cashReceived.toFixed(2)} — الباقي:{' '}
                      {(saleDetail.changeDue ?? 0).toFixed(2)}
                    </div>
                  ) : null}
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      className="rounded-lg bg-[#1e3a8a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#172554]"
                      onClick={() => void window.posApi.print.saleReceipt(saleDetail.id)}
                    >
                      إعادة طباعة الإيصال
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
