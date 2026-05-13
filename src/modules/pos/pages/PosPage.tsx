import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Minus,
  Plus,
  Printer,
  X,
  Save,
  Pause,
  ListOrdered,
  Undo2,
  Eraser,
  Power,
  DollarSign,
  Package,
  UserCircle,
  Settings,
  User,
  LogOut,
  Grid2x2,
  CupSoda,
  Candy,
  Apple,
  SprayCan,
  MoreHorizontal
} from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { arSA } from 'date-fns/locale'
import { CURRENCY_SUFFIX } from '../../../core/currency'
import { useCartStore, type CartLine } from '../../../core/stores/cart-store'
import { useAuthStore } from '../../../core/stores/auth-store'
import { useToastStore } from '../../../core/toast-store'
import { playErrorSound, playPaymentSound, playScanSound } from '../../../core/sound-feedback'
import { CloseShiftModal } from '../../shifts/CloseShiftModal'
import { ProductSearchModal, type PickedProduct } from '../../../components/product-picker/ProductSearchModal'
import { EnterpriseModalFrame } from '../../shared/EnterpriseToolbar'
import { ProductEditorModal, type InventoryProduct } from '../../inventory/components/ProductEditorModal'

type Product = {
  id: string
  name: string
  salePrice: number
  quantity: number
  expiryDate?: string | null
  imagePath: string | null
  categoryName: string | null
  categoryId: string | null
}

type CategoryRow = { id: string; name: string; showOnPos?: boolean }

type PosProductUi =
  | null
  | { type: 'unknown_barcode'; code: string }
  | { type: 'editor_loading'; id: string }
  | { type: 'editor'; initial: InventoryProduct | null; prefillBarcode?: string }
  | { type: 'readonly'; product: InventoryProduct }

type PosDailyStats = {
  openingCash: number
  openedAt: string
  deviceId: string
  revenue: number
  invoices: number
  cashSales: number
  cardSales: number
  mixedSales: number
  heldInvoices: number
  topItems: { name: string; qty: number }[]
}

const COLS = 3

/** هوية العرض — رقم الدعم الثابت */
const POS_BRAND_PHONE = '0787624300'

function lineTotal(l: CartLine): number {
  return l.unitPrice * l.quantity - l.discount
}

type ExpiryState = 'ok' | 'near' | 'expired' | 'none'

function expiryStateFromIso(iso: string | null | undefined): ExpiryState {
  if (!iso) return 'none'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'none'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in30 = new Date(today)
  in30.setDate(in30.getDate() + 30)
  if (d.getTime() < today.getTime()) return 'expired'
  if (d.getTime() <= in30.getTime()) return 'near'
  return 'ok'
}

/** عرض مفتاح الاختصار كما خُزّن (مع تسمية Ctrl) */
function formatShortcutKeys(keys: string): string {
  return keys
    .split('+')
    .map((p) => {
      const s = p.trim()
      const low = s.toLowerCase()
      if (low === 'control' || low === 'ctrl') return 'Ctrl'
      return s
    })
    .join('+')
}

/** اختصارات الدفع تختار الكود في القائمة فقط — لا تُكمِل البيع (ذلك لزر الإتمام / sale.complete). */
function paymentCodeForShortcut(
  action: string,
  visible: { code: string; nameAr: string }[]
): string | null {
  const has = (c: string) => visible.some((m) => m.code === c)
  if (action === 'pay.cash') return has('cash') ? 'cash' : null
  if (action === 'pay.card') return has('card') ? 'card' : null
  if (action === 'pay.mixed') return has('mixed') ? 'mixed' : null
  if (action === 'pay.other') {
    if (has('mixed')) return 'mixed'
    const alt = visible.find((m) => !['cash', 'card', 'credit'].includes(m.code))
    return alt?.code ?? null
  }
  return null
}

function StatRowPay({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-slate-600">{label}</span>
      <span className="font-mono font-semibold tabular-nums" dir="ltr">
        {value.toFixed(2)}
        {CURRENCY_SUFFIX}
      </span>
    </div>
  )
}

export function PosPage() {
  const toast = useToastStore((s) => s.push)
  const navi = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const setSession = useAuthStore((s) => s.setSession)
  const can = useAuthStore((s) => s.can)
  const canAny = useAuthStore((s) => s.canAny)

  const lines = useCartStore((s) => s.lines)
  const addProduct = useCartStore((s) => s.addProduct)
  const removeLine = useCartStore((s) => s.removeLine)
  const incQty = useCartStore((s) => s.incQty)
  const setQty = useCartStore((s) => s.setQty)
  const cartDiscount = useCartStore((s) => s.cartDiscount)
  const setCartDiscount = useCartStore((s) => s.setCartDiscount)
  const clear = useCartStore((s) => s.clear)
  const replaceCart = useCartStore((s) => s.replaceCart)
  const subtotal = useCartStore((s) => s.subtotal)

  const [products, setProducts] = useState<Product[]>([])
  const [expiryByProductId, setExpiryByProductId] = useState<Record<string, string | null>>({})
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [ranked, setRanked] = useState<Product[]>([])
  const [cashReceived, setCashReceived] = useState('')
  const [taxRate, setTaxRate] = useState('0')
  const [paymentMethods, setPaymentMethods] = useState<{ code: string; nameAr: string }[]>([
    { code: 'cash', nameAr: 'نقدي' },
    { code: 'card', nameAr: 'بطاقة' },
    { code: 'click', nameAr: 'كليك' },
    { code: 'mixed', nameAr: 'متعدد' },
    { code: 'credit', nameAr: 'ذمم' }
  ])
  const [paymentCode, setPaymentCode] = useState('cash')
  const [saleCustomerId, setSaleCustomerId] = useState('')
  const [saleCustomers, setSaleCustomers] = useState<{ id: string; name: string }[]>([])
  const [heldOpen, setHeldOpen] = useState(false)
  const [heldList, setHeldList] = useState<{ id: string; heldName: string | null; total: number }[]>([])
  const [heldName, setHeldName] = useState('')
  const [storeName, setStoreName] = useState('المتجر')
  const [footerNow, setFooterNow] = useState(new Date())
  const [shiftCloseOpen, setShiftCloseOpen] = useState(false)
  const [posToolModal, setPosToolModal] = useState<null | 'daily' | 'print' | 'shiftInfo'>(null)
  const [dailyStats, setDailyStats] = useState<PosDailyStats | null>(null)
  const [dailyLoading, setDailyLoading] = useState(false)
  const [printSaleId, setPrintSaleId] = useState('')
  const [printBusy, setPrintBusy] = useState(false)
  const [shiftInfo, setShiftInfo] = useState<{
    id: string
    openedAt: string
    openingCash: number
    deviceId: string
  } | null>(null)
  const [shiftInfoLoading, setShiftInfoLoading] = useState(false)
  const [lastSaleId, setLastSaleId] = useState('')
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState('')
  /** تفاصيل آخر فاتورة مكتملة للوحة «السابقة» (يتطلب تقارير) */
  const [prevCompletedSale, setPrevCompletedSale] = useState<{
    total: number
    paid: number
    change: number
    tax: number
  } | null>(null)
  const [posProductUi, setPosProductUi] = useState<PosProductUi>(null)
  const [quickProductPickOpen, setQuickProductPickOpen] = useState(false)
  /** اختصارات لوحة المفاتيح من الإعدادات (actionId → keys) */
  const [keyboardShortcuts, setKeyboardShortcuts] = useState<Record<string, string>>({})
  /** سطر السلة المفعّل لاختصار ± وبطاقة المنتج */
  const [selectedCartProductId, setSelectedCartProductId] = useState<string | null>(null)
  const selectedCartProductIdRef = useRef<string | null>(null)
  selectedCartProductIdRef.current = selectedCartProductId

  const cashRef = useRef('')
  const taxRef = useRef('0')
  useEffect(() => {
    taxRef.current = taxRate
  }, [taxRate])
  const parentRef = useRef<HTMLDivElement>(null)
  const posSearchRef = useRef<HTMLInputElement>(null)
  const escModalsRef = useRef({
    shiftCloseOpen: false,
    posToolModal: null as null | 'daily' | 'print' | 'shiftInfo',
    heldOpen: false,
    posProductModal: false,
    quickPickOpen: false,
    anyModalBlocking: false
  })
  escModalsRef.current = {
    shiftCloseOpen,
    posToolModal,
    heldOpen,
    posProductModal: posProductUi !== null,
    quickPickOpen: quickProductPickOpen,
    anyModalBlocking:
      shiftCloseOpen ||
      posToolModal !== null ||
      heldOpen ||
      posProductUi !== null ||
      quickProductPickOpen
  }

  useEffect(() => {
    cashRef.current = cashReceived
  }, [cashReceived])

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 180)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    const t = setInterval(() => setFooterNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(async () => {
    const [grid, cats] = await Promise.all([
      window.posApi.products.posGrid(),
      window.posApi.products.categories()
    ])
    if (grid.ok && 'items' in grid) {
      const items = grid.items as Product[]
      setProducts(items)
      setExpiryByProductId(Object.fromEntries(items.map((x) => [x.id, x.expiryDate ?? null])))
    }
    if (cats.ok && 'items' in cats) {
      const allCats = cats.items as CategoryRow[]
      // فلترة التصنيفات لعرض فقط التي showOnPos = true
      const posCats = allCats.filter((c) => c.showOnPos === true)
      setCategories(posCats)
    }
  }, [])

  const reloadCategoriesForPos = useCallback(async () => {
    const cats = await window.posApi.products.categories()
    if (cats.ok && 'items' in cats) {
      const allCats = cats.items as CategoryRow[]
      // فلترة التصنيفات لعرض فقط التي showOnPos = true
      const posCats = allCats.filter((c) => c.showOnPos === true)
      setCategories(posCats)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!user) return
    void (async () => {
      const r = await window.posApi.shortcuts.list()
      if (r.ok && 'items' in r) {
        const m: Record<string, string> = {}
        for (const row of r.items as { actionId: string; keys: string }[]) {
          m[row.actionId] = row.keys
        }
        setKeyboardShortcuts(m)
      }
    })()
  }, [user?.id])

  const focusPosSearch = useCallback(() => {
    window.requestAnimationFrame(() => posSearchRef.current?.focus())
  }, [])

  /** أول فتح لشاشة البيع أو بعد إغلاق أي نافذة — التركيز على البحث/الباركود */
  useEffect(() => {
    const blocked =
      quickProductPickOpen ||
      posProductUi !== null ||
      heldOpen ||
      shiftCloseOpen ||
      posToolModal !== null
    if (blocked) return
    const t = window.setTimeout(() => focusPosSearch(), 120)
    return () => window.clearTimeout(t)
  }, [focusPosSearch, quickProductPickOpen, posProductUi, heldOpen, shiftCloseOpen, posToolModal])

  useEffect(() => {
    try {
      const id = sessionStorage.getItem('pos.lastSaleId') ?? ''
      const inv = sessionStorage.getItem('pos.lastInvoice') ?? ''
      if (id) setLastSaleId(id)
      if (inv) setLastInvoiceNumber(inv)
    } catch {
      /* ignore */
    }
  }, [])

  const canSaleDetail = canAny(['reports.read', 'reports.advanced'])
  useEffect(() => {
    if (!lastSaleId || !canSaleDetail) {
      setPrevCompletedSale(null)
      return
    }
    let cancelled = false
    void (async () => {
      const r = await window.posApi.sales.getDetail(lastSaleId)
      if (cancelled) return
      if (r.ok && 'sale' in r) {
        const s = r.sale as {
          total: number
          cashReceived: number | null
          changeDue: number | null
          taxAmount: number
        }
        const paid = s.cashReceived != null ? s.cashReceived : s.total
        const ch = s.changeDue != null ? s.changeDue : 0
        setPrevCompletedSale({
          total: s.total,
          paid,
          change: ch,
          tax: s.taxAmount
        })
      } else setPrevCompletedSale(null)
    })()
    return () => {
      cancelled = true
    }
  }, [lastSaleId, canSaleDetail])

  useEffect(() => {
    void (async () => {
      const r = await window.posApi.settings.get('store.name')
      if (r.ok && r.value) setStoreName(String(r.value))
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      const r = await window.posApi.paymentMethods.list()
      if (r.ok && 'items' in r) {
        const items = r.items as { code: string; nameAr: string }[]
        // دمج الطرق الافتراضية مع الطرق المحملة من الـ API
        const defaultMethods = [
          { code: 'cash', nameAr: 'نقدي' },
          { code: 'card', nameAr: 'بطاقة' },
          { code: 'click', nameAr: 'كليك' },
          { code: 'mixed', nameAr: 'متعدد' },
          { code: 'credit', nameAr: 'ذمم' }
        ]
        
        // استخدم الطرق من الـ API إذا كانت موجودة، وإلا استخدم الافتراضية
        const mergedMethods = defaultMethods.map(def => {
          const fromApi = items.find(x => x.code === def.code)
          return fromApi || def
        })
        
        // أضف أي طرق إضافية من الـ API غير موجودة في القائمة الافتراضية
        items.forEach(apiMethod => {
          if (!mergedMethods.some(m => m.code === apiMethod.code)) {
            mergedMethods.push(apiMethod)
          }
        })
        
        setPaymentMethods(mergedMethods)
        setPaymentCode((prev) => (mergedMethods.some((x) => x.code === prev) ? prev : 'cash'))
      }
    })()
  }, [])

  const creditAllowed = canAny(['customer.read'])
  const visiblePaymentMethods = useMemo(() => {
    if (creditAllowed) return paymentMethods
    return paymentMethods.filter((m) => m.code !== 'credit')
  }, [paymentMethods, creditAllowed])

  useEffect(() => {
    if (paymentCode !== 'credit') {
      setSaleCustomerId('')
      return
    }
    if (!creditAllowed) return
    let cancelled = false
    void (async () => {
      const r = await window.posApi.customers.list({ search: '' })
      if (!cancelled && r.ok && 'items' in r) {
        const arr = r.items as { id: string; name: string }[]
        setSaleCustomers(arr.map((x) => ({ id: x.id, name: x.name })))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [paymentCode, creditAllowed])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await window.posApi.recovery.loadCart()
        if (cancelled || !r.ok || !('snapshot' in r)) return
        const snap = r.snapshot as {
          lines: { productId: string; name: string; quantity: number; unitPrice: number; discount: number }[]
          cartDiscount: number
        } | null
        if (!snap?.lines?.length) return
        const ok = window.confirm('تم العثور على سلة غير مكتملة. هل تريد استرجاعها؟')
        if (ok) {
          replaceCart(snap.lines, snap.cartDiscount ?? 0)
          void window.posApi.recovery.clearCart()
        }
      } finally {
        if (!cancelled) focusPosSearch()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [replaceCart, focusPosSearch])

  const recoverySaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return useCartStore.subscribe((st) => {
      if (recoverySaveTimer.current) clearTimeout(recoverySaveTimer.current)
      recoverySaveTimer.current = setTimeout(() => {
        if (!st.lines.length) {
          void window.posApi.recovery.clearCart()
          return
        }
        void window.posApi.recovery.saveCart({
          lines: st.lines.map((l) => ({
            productId: l.productId,
            name: l.name,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discount: l.discount
          })),
          cartDiscount: st.cartDiscount
        })
      }, 700)
    })
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      const q = debounced.trim()
      if (!q) {
        setRanked([])
        return
      }
      const res = await window.posApi.products.searchAdvanced({ query: q, limit: 24 })
      if (!alive) return
      if (res.ok && 'items' in res) setRanked(res.items as Product[])
    })()
    return () => {
      alive = false
    }
  }, [debounced])

  useEffect(() => {
    if (!heldOpen) return
    void (async () => {
      const r = await window.posApi.sales.heldList()
      if (r.ok && 'items' in r) setHeldList(r.items as { id: string; heldName: string | null; total: number }[])
    })()
  }, [heldOpen])

  useEffect(() => {
    if (posToolModal !== 'daily') {
      setDailyStats(null)
      return
    }
    setDailyLoading(true)
    void (async () => {
      const r = await window.posApi.session.salesStats()
      setDailyLoading(false)
      if (r.ok && 'stats' in r) {
        setDailyStats(r.stats as PosDailyStats)
      } else {
        setDailyStats(null)
        if ((r as { error?: string }).error === 'NO_SHIFT') toast('افتح الشفت أولاً لعرض اليومية', 'err')
        else if ((r as { error?: string }).error === 'FORBIDDEN') toast('لا تملك صلاحية عرض اليومية', 'err')
      }
    })()
  }, [posToolModal, toast])

  useEffect(() => {
    if (posToolModal !== 'shiftInfo') {
      setShiftInfo(null)
      return
    }
    setShiftInfoLoading(true)
    void (async () => {
      const r = await window.posApi.session.current()
      setShiftInfoLoading(false)
      if (r.ok && r.session) {
        setShiftInfo({
          id: r.session.id,
          openedAt: r.session.openedAt,
          openingCash: r.session.openingCash,
          deviceId: r.session.deviceId
        })
      } else {
        setShiftInfo(null)
      }
    })()
  }, [posToolModal])

  useEffect(() => {
    if (posToolModal === 'print' && lastSaleId) setPrintSaleId(lastSaleId)
  }, [posToolModal, lastSaleId])

  const searchFiltered = useMemo(() => {
    const s = debounced.trim().toLowerCase()
    if (!s) return products
    if (ranked.length) return ranked
    return products.filter((p) => p.name.toLowerCase().includes(s))
  }, [products, debounced, ranked])

  const filtered = useMemo(() => {
    if (!selectedCategoryId) return searchFiltered
    return searchFiltered.filter((p) => p.categoryId === selectedCategoryId)
  }, [searchFiltered, selectedCategoryId])

  const afterDisc = Math.max(0, subtotal() - cartDiscount)
  const taxPreview = (afterDisc * (Number(taxRate) || 0)) / 100
  const grandTotal = afterDisc + taxPreview

  const rows = Math.ceil(filtered.length / COLS)
  const rowVirtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 220,
    overscan: 8
  })

  const completeSale = useCallback(
    async (opts: { printReceipt: boolean; methodOverride?: string }) => {
      const { lines: L, cartDiscount: d, clear: clr, total: tot } = useCartStore.getState()
      if (!L.length) return
      const method = opts.methodOverride ?? paymentCode
      const t = tot()
      const cashVal = method === 'cash' ? Number(cashRef.current) || t : t
      const res = await window.posApi.sales.create({
        items: L.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount
        })),
        discount: d,
        taxRate: Number(taxRef.current) || 0,
        paymentMethod: method,
        cashReceived: method === 'cash' ? cashVal : undefined,
        customerId: method === 'credit' ? saleCustomerId || null : undefined,
        printReceipt: opts.printReceipt
      })
      if (res.ok) {
        playPaymentSound()
        const body = res as { sale?: { id: string; invoiceNumber?: string } }
        if (body.sale?.id) {
          setLastSaleId(body.sale.id)
          try {
            sessionStorage.setItem('pos.lastSaleId', body.sale.id)
            if (body.sale.invoiceNumber) {
              setLastInvoiceNumber(body.sale.invoiceNumber)
              sessionStorage.setItem('pos.lastInvoice', body.sale.invoiceNumber)
            }
          } catch {
            /* ignore */
          }
        }
        clr()
        setCashReceived('')
        setPaymentCode('cash') // إرجاع طريقة الدفع إلى نقدي تلقائياً بعد إتمام البيع
        void load()
      } else {
        playErrorSound()
        const err = (res as { error?: string }).error
        if (err === 'INVALID_PAYMENT_METHOD') toast('طريقة الدفع غير معرّفة في النظام — اختر أخرى من القائمة', 'err')
        else if (err === 'CREDIT_REQUIRES_CUSTOMER') toast('اختر الزبون لبيع آجل / ذمة', 'err')
        else if (err === 'CUSTOMER_NOT_FOUND') toast('الزبون غير موجود', 'err')
        else if (err === 'EXPIRED_PRODUCT') {
          const bad = (res as { products?: string[] }).products ?? []
          toast(`لا يمكن إتمام البيع: توجد مواد منتهية الصلاحية (${bad.join('، ')})`, 'err')
        }
        else if (err) toast(String(err), 'err')
      }
    },
    [load, paymentCode, toast, saleCustomerId]
  )

  useEffect(() => {
    const onShortcut = (ev: Event) => {
      const action = (ev as CustomEvent<string>).detail
      const st = useCartStore.getState()
      if (action === 'cart.new') st.clear()
      if (action === 'sale.complete') void completeSale({ printReceipt: false })
      if (action === 'pay.cash' || action === 'pay.card' || action === 'pay.other' || action === 'pay.mixed') {
        const next = paymentCodeForShortcut(action, visiblePaymentMethods)
        if (next) setPaymentCode(next)
        else toast('لا توجد طريقة دفع مطابقة لهذا الاختصار في القائمة.', 'err')
      }
      if (action === 'search.product') posSearchRef.current?.focus()
      if (action === 'nav.products') setQuickProductPickOpen(true)
      if (action === 'print.receipt') {
        try {
          const id = sessionStorage.getItem('pos.lastSaleId') ?? ''
          if (id) void window.posApi.print.saleReceipt(id)
          else void window.posApi.hardware.cashDrawer()
        } catch {
          void window.posApi.hardware.cashDrawer()
        }
      }
      if (action === 'cart.hold') document.getElementById('btn-hold')?.click()
      if (action === 'pos.held_open') setHeldOpen(true)
      if (action === 'hardware.drawer') void window.posApi.hardware.cashDrawer()
      if (action === 'cart.discount') document.getElementById('pos-cart-discount')?.focus()
      if (action === 'cart.quantity') {
        const nodes = document.querySelectorAll<HTMLInputElement>('[data-pos-cart-qty]')
        nodes[nodes.length - 1]?.focus()
      }
      if (action === 'cart.void') {
        const cs = useCartStore.getState()
        if (!cs.lines.length) return
        if (window.confirm('إلغاء البيع وتفريغ السلة؟')) cs.clear()
      }
    }
    window.addEventListener('pos-shortcut', onShortcut as EventListener)
    return () => window.removeEventListener('pos-shortcut', onShortcut as EventListener)
  }, [completeSale, visiblePaymentMethods, toast])

  /**
   * اختصارات شاشة البيع بنمط «سمارت» — التقاط مبكر (قبل ShortcutProvider) حتى تطابق F5–F12 مع الأزرار
   * وليس مع اختصارات الـ seed القديمة (دفع/إلخ).
   */
  useEffect(() => {
    const inTypingField = (el: HTMLElement | null) => {
      const tag = el?.tagName
      if (tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return true
      if (tag === 'INPUT') {
        const inp = el as HTMLInputElement
        if (inp.id === 'pos-search') return false
        return true
      }
      return false
    }

    const onPosClassicKeys = (e: KeyboardEvent) => {
      if (escModalsRef.current.anyModalBlocking) return

      const target = e.target as HTMLElement | null
      const typing = inTypingField(target)

      const isHome = e.key === 'Home' || e.code === 'Home'
      if (isHome) {
        if (target?.id === 'pos-search') return
        e.preventDefault()
        e.stopPropagation()
        posSearchRef.current?.focus()
        return
      }

      const stop = () => {
        e.preventDefault()
        e.stopPropagation()
      }

      if (e.key === 'F10' || e.code === 'F10') {
        if (typing) {
          stop()
          return
        }
        stop()
        void completeSale({ printReceipt: false })
        return
      }
      if (e.key === 'F11' || e.code === 'F11') {
        if (typing) {
          stop()
          return
        }
        stop()
        void completeSale({ printReceipt: true })
        return
      }
      if (e.key === 'F5' || e.code === 'F5') {
        stop()
        document.getElementById('btn-hold')?.click()
        return
      }
      if (e.key === 'F6' || e.code === 'F6') {
        stop()
        setHeldOpen(true)
        return
      }
      if (e.key === 'F7' || e.code === 'F7') {
        stop()
        navi('/returns')
        return
      }
      if (e.key === 'F9' || e.code === 'F9') {
        stop()
        setPosToolModal('print')
        return
      }
      if (e.key === 'F12' || e.code === 'F12') {
        stop()
        void window.posApi.hardware.cashDrawer()
        return
      }
      if (e.key === 'F2' || e.code === 'F2') {
        stop()
        if (visiblePaymentMethods.some((m) => m.code === 'cash')) {
          setPaymentCode('cash')
          setSaleCustomerId('')
          toast('بيع نقد — تم اختيار النقدي', 'ok')
        } else toast('طريقة النقدي غير متاحة في القائمة', 'err')
        return
      }
      if (e.key === 'F4' || e.code === 'F4') {
        stop()
        setQuickProductPickOpen(true)
        return
      }

      if (e.code === 'PageUp' || e.key === 'PageUp') {
        if (typing) return
        const L = useCartStore.getState().lines
        if (!L.length) return
        let pid = selectedCartProductIdRef.current
        if (!pid || !L.some((l) => l.productId === pid)) pid = L[L.length - 1]!.productId
        stop()
        setSelectedCartProductId(pid)
        setPosProductUi({ type: 'editor_loading', id: pid })
        return
      }
      if (e.code === 'PageDown' || e.key === 'PageDown') {
        if (typing) return
        const nodes = document.querySelectorAll<HTMLInputElement>('[data-pos-cart-qty]')
        if (!nodes.length) return
        stop()
        nodes[nodes.length - 1]?.focus()
        return
      }
      if (e.ctrlKey && (e.key === 'F1' || e.code === 'F1')) {
        stop()
        if (can('settings.write')) navi('/settings/hardware')
        else toast('متفرق: لا صلاحية للأجهزة', 'err')
        return
      }
    }
    window.addEventListener('keydown', onPosClassicKeys, true)
    return () => window.removeEventListener('keydown', onPosClassicKeys, true)
  }, [completeSale, navi, toast, visiblePaymentMethods])

  const buf = useRef('')
  const bufTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commitBarcodeFromPos = useCallback(
    async (code: string) => {
      const trimmed = code.trim()
      if (trimmed.length < 3) return
      const hit = await window.posApi.barcode.lookup(trimmed)
      if (hit.ok && 'product' in hit) {
        const pr = hit.product as Product
        setExpiryByProductId((prev) => ({ ...prev, [pr.id]: pr.expiryDate ?? null }))
        playScanSound()
        addProduct({
          id: pr.id,
          name: pr.name,
          salePrice: pr.salePrice,
          quantityAvailable: pr.quantity
        })
        setSearch('')
        buf.current = ''
        return
      }
      const w = await window.posApi.barcode.parseWeight(trimmed)
      if (w.ok && 'productId' in w && (w as { productId?: string }).productId) {
        const x = w as { productId: string; lineTotal: number; name: string; weightKg: number }
        playScanSound()
        addProduct({
          id: x.productId,
          name: `${x.name} (${x.weightKg.toFixed(3)} كغ)`,
          salePrice: x.lineTotal,
          quantityAvailable: 999999
        })
        setSearch('')
        buf.current = ''
        return
      }
      playErrorSound()
      setPosProductUi({ type: 'unknown_barcode', code: trimmed })
      setSearch('')
      buf.current = ''
    },
    [addProduct]
  )

  useEffect(() => {
    if (!posProductUi || posProductUi.type !== 'editor_loading') return
    const id = posProductUi.id
    let cancelled = false
    void (async () => {
      const r = await window.posApi.products.get(id)
      if (cancelled) return
      if (r.ok && 'product' in r) {
        const full = r.product as InventoryProduct
        const canWrite = useAuthStore.getState().can('product.write')
        if (canWrite) setPosProductUi({ type: 'editor', initial: full })
        else setPosProductUi({ type: 'readonly', product: full })
      } else {
        toast('تعذّر تحميل المنتج', 'err')
        setPosProductUi(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [posProductUi, toast])

  useEffect(() => {
    setSelectedCartProductId((prev) => {
      if (!prev) return prev
      return lines.some((l) => l.productId === prev) ? prev : null
    })
  }, [lines])

  useEffect(() => {
    const onQtyShortcut = (e: KeyboardEvent) => {
      if (escModalsRef.current.anyModalBlocking) return

      const isPlus = e.key === '+' || e.code === 'NumpadAdd' || (e.key === '=' && e.shiftKey)
      const isMinus = e.key === '-' || e.code === 'NumpadSubtract'
      if (!isPlus && !isMinus) return

      const el = e.target as HTMLElement
      const tag = el.tagName
      if (tag === 'TEXTAREA' || tag === 'SELECT') return
      if (tag === 'INPUT') {
        const inp = el as HTMLInputElement
        if (inp.id === 'pos-search') return
        if (!inp.closest('[data-pos-cart-qty-wrap]')) return
      }

      const L = useCartStore.getState().lines
      if (!L.length) return

      let pid = selectedCartProductIdRef.current
      if (!pid || !L.some((l) => l.productId === pid)) pid = L[L.length - 1]!.productId

      e.preventDefault()
      incQty(pid, isPlus ? 1 : -1)
    }
    window.addEventListener('keydown', onQtyShortcut)
    return () => window.removeEventListener('keydown', onQtyShortcut)
  }, [incQty])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* لا تسرق لوحة البيع أحداث الكتابة أثناء أي نافذة */
      if (escModalsRef.current.anyModalBlocking) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Enter' && buf.current.length >= 3) {
        const code = buf.current
        buf.current = ''
        void commitBarcodeFromPos(code)
        return
      }
      if (/^[0-9]$/.test(e.key)) {
        buf.current += e.key
        if (bufTimer.current) clearTimeout(bufTimer.current)
        bufTimer.current = setTimeout(() => {
          buf.current = ''
        }, 600)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commitBarcodeFromPos])

  async function logout() {
    await window.posApi.auth.logout()
    setUser(null)
    setSession(null)
    navi('/login', { replace: true })
  }

  const cancelSale = useCallback(() => {
    const st = useCartStore.getState()
    if (!st.lines.length) return
    if (window.confirm('إلغاء البيع وتفريغ السلة؟')) st.clear()
  }, [])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const { shiftCloseOpen: sc, posToolModal: pt, heldOpen: ho, posProductModal: pm, quickPickOpen: qp } =
        escModalsRef.current
      if (sc) {
        e.preventDefault()
        setShiftCloseOpen(false)
        return
      }
      if (pt) {
        e.preventDefault()
        setPosToolModal(null)
        return
      }
      if (ho) {
        e.preventDefault()
        setHeldOpen(false)
        return
      }
      if (qp) {
        e.preventDefault()
        e.stopPropagation()
        setQuickProductPickOpen(false)
        return
      }
      if (pm) {
        e.preventDefault()
        e.stopPropagation()
        setPosProductUi(null)
        return
      }
      const t = e.target as HTMLElement
      const tag = t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      cancelSale()
    }
    window.addEventListener('keydown', onEsc, true)
    return () => window.removeEventListener('keydown', onEsc, true)
  }, [cancelSale])

  const cartCount = lines.reduce((n, l) => n + l.quantity, 0)
  /** سطر المادة النشطة في الرأس (آخر سطر أو المحدد بالنقر) — مثل شاشات البيع الكلاسيكية */
  const headerLineCtx = useMemo(() => {
    let pid = selectedCartProductId
    if (!pid || !lines.some((l) => l.productId === pid)) {
      pid = lines.length ? lines[lines.length - 1]!.productId : null
    }
    if (!pid) return { idShort: '', stockLabel: '—' }
    const pr = products.find((p) => p.id === pid)
    const idShort = pid.length > 10 ? pid.slice(-8) : pid
    const stockLabel = pr != null ? pr.quantity.toFixed(3) : '—'
    return { idShort, stockLabel }
  }, [selectedCartProductId, lines, products])

  const cashPaidNum = paymentCode === 'cash' ? Number(cashReceived) || 0 : grandTotal
  const changeDue = paymentCode === 'cash' ? Math.max(0, cashPaidNum - grandTotal) : 0
  const cartExpirySummary = useMemo(() => {
    let near = 0
    let expired = 0
    const states = new Map<string, ExpiryState>()
    for (const l of lines) {
      const st = expiryStateFromIso(expiryByProductId[l.productId])
      states.set(l.productId, st)
      if (st === 'near') near += 1
      if (st === 'expired') expired += 1
    }
    return { near, expired, states }
  }, [lines, expiryByProductId])

  return (
    <div className="page-microtype pos-microtype h-full flex flex-col min-h-0 bg-gradient-to-br from-gray-50 to-gray-100 text-slate-900" dir="rtl">
      {/* شريط علوي — بسيط: بحث + قيمة الضريبة + المجموع */}
      <header className="shrink-0 z-20 border-b border-gray-200 bg-white px-2 py-1.5 shadow-sm">
        <div className="mx-auto flex max-w-[1900px] flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-[20rem]">
            <label htmlFor="pos-search" className="shrink-0 text-[13px] font-bold text-slate-900">
              البحث بواسطة رقم المادة / اسم المادة
            </label>
            <input
              id="pos-search"
              ref={posSearchRef}
              dir="rtl"
              title={
                'بحث / باركود — Enter' +
                (keyboardShortcuts['search.product']?.trim()
                  ? ` · اختصار: ${formatShortcutKeys(keyboardShortcuts['search.product'])}`
                  : '')
              }
              className="w-full flex-1 rounded-lg border-2 border-gray-300 bg-white py-1.5 px-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              placeholder="رقم / اسم / باركود — Enter"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                const q = search.trim()
                if (!q) return
                const numeric = /^[0-9]+$/.test(q)
                const alnum = /^[0-9A-Za-z._-]+$/.test(q)
                const looksLikeBarcode =
                  (numeric && q.length >= 3 && q.length <= 18) || (!numeric && alnum && q.length >= 4 && q.length <= 48)
                if (looksLikeBarcode) {
                  e.preventDefault()
                  void commitBarcodeFromPos(q)
                  return
                }
                e.preventDefault()
                void (async () => {
                  const res = await window.posApi.products.searchAdvanced({ query: q, limit: 24 })
                  if (!res.ok || !('items' in res)) {
                    toast('تعذّر البحث', 'err')
                    return
                  }
                  const items = res.items as Product[]
                  if (items.length === 0) {
                    toast('لا توجد مادة مطابقة — جرّب اسماً آخر أو اختر من الشبكة', 'err')
                    return
                  }
                  const qn = q.toLowerCase()
                  const exact = items.find((p) => p.name.trim().toLowerCase() === qn)
                  const pick = exact ?? (items.length === 1 ? items[0]! : null)
                  if (!pick) {
                    toast('عدة نتائج — اضغط المنتج من الشبكة أو دقّق الاسم', 'err')
                    return
                  }
                  playScanSound()
                  addProduct({
                    id: pick.id,
                    name: pick.name,
                    salePrice: pick.salePrice,
                    quantityAvailable: pick.quantity
                  })
                  setSearch('')
                })()
              }}
            />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-lg bg-green-50 border border-green-200 px-2 py-1 shadow-sm">
              <span className="text-xs font-semibold text-gray-700">قيمة الضريبة</span>
              <input
                className="h-7 w-14 rounded-md border border-gray-300 bg-white text-center font-mono text-xs font-semibold shadow-sm focus:border-green-500 focus:ring-1 focus:ring-green-200 transition-all"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
              <span className="text-xs font-semibold text-gray-700">%</span>
              <div className="rounded-md bg-green-600 px-2 py-1 shadow-sm">
                <span className="font-mono text-sm font-bold tabular-nums text-white">{taxPreview.toFixed(2)}</span>
              </div>
            </div>
            <div
              className="flex min-w-[9rem] flex-col items-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 px-3 py-2 shadow-lg"
              title="إجمالي الفاتورة"
            >
              <span className="text-[10px] font-semibold tracking-wide text-blue-100">المجموع</span>
              <span className="font-mono text-3xl font-bold tabular-nums leading-none text-white">
                {grandTotal.toFixed(2)}
              </span>
            </div>
            <div className="flex shrink-0 items-end gap-3" dir="rtl">
              <div className="flex flex-col gap-1">
                <span className="text-[15px] font-black text-slate-900">رقم المادة</span>
                <input
                  readOnly
                  className="h-11 w-[8rem] rounded border-2 border-amber-700 bg-[#fff9c4] text-center font-mono text-[17px] font-bold text-amber-950"
                  value={headerLineCtx.idShort}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[15px] font-black text-slate-900">رصيد المادة</span>
                <div
                  className="flex h-11 w-[8rem] items-center justify-center rounded border-2 border-black bg-black font-mono text-[17px] font-black text-[#00ff00]"
                  dir="ltr"
                >
                  {headerLineCtx.stockLabel}
                </div>
              </div>
              <div className="hidden items-center gap-2 lg:flex">
                <button
                  type="button"
                  onClick={() => navi('/settings')}
                  className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 text-[10px] font-bold text-slate-600 shadow-sm transition-all hover:shadow-md"
                >
                  <Settings className="h-5 w-5" />
                  <span>إعدادات</span>
                </button>
                <button
                  type="button"
                  onClick={() => navi('/users')}
                  className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 text-[10px] font-bold text-slate-600 shadow-sm transition-all hover:shadow-md"
                >
                  <User className="h-5 w-5" />
                  <span>مستخدم</span>
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 text-[10px] font-bold text-slate-600 shadow-sm transition-all hover:shadow-md"
                >
                  <LogOut className="h-5 w-5" />
                  <span>إغلاق</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* الجسم: معلومات يمين | جدول وسط | أزرار مواد يسار */}
      <div className="flex min-h-0 flex-1 gap-1 p-1">
        {/* المعلومات الجانبية - يمين */}
        <aside className="flex w-[11.5rem] shrink-0 flex-col overflow-hidden rounded-lg bg-white shadow-md lg:w-[13rem]">
          {/* شعار Soft Touch */}
          <div className="relative border-b border-slate-400 bg-gradient-to-b from-[#eceff1] via-[#cfd8dc] to-[#b0bec5] px-2 py-2">
            <div className="flex flex-col items-center gap-1">
              {/* اسم المتجر */}
              <div className="text-center">
                <span className="text-[16px] font-black text-[#0d47a1]">{storeName}</span>
              </div>
              {/* الشعار */}
              <div className="flex items-center gap-1">
                <svg className="h-12 w-12 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" opacity="0.3"/>
                  <path d="M12 4.5l6 3v5.5c0 3.87-2.67 7.48-6 8.37-3.33-.89-6-4.5-6-8.37V7.5l6-3z"/>
                  <circle cx="12" cy="12" r="3" fill="#fff"/>
                </svg>
                <div className="flex flex-col items-start">
                  <div className="flex items-baseline gap-0.5" dir="ltr">
                    <span className="text-[18px] font-black italic text-[#0d47a1]">SOFT</span>
                    <span className="text-[18px] font-black italic text-[#00695c]">TOUCH</span>
                  </div>
                  <span className="text-[13px] font-black tracking-wider text-[#0d47a1]" dir="ltr">{POS_BRAND_PHONE}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="border-b border-[#00838f] bg-[#00bcd4] px-2 py-1 text-[13px] font-black text-white">
            بيانات الفاتورة الحالية
          </div>
          <div className="space-y-0.5 bg-white p-2 text-[13px]">
            <div className="flex justify-between gap-1">
              <span className="text-slate-600">رقم الفاتورة</span>
              <span className="font-bold">{lines.length ? cartCount : '—'}</span>
            </div>
            <div className="flex justify-between gap-1">
              <span className="text-slate-600">عدد الأصناف</span>
              <span className="font-mono font-black">{lines.length}</span>
            </div>
            <div className="flex justify-between gap-1">
              <span className="text-slate-600">الوقت</span>
              <span className="font-mono font-bold">{format(footerNow, 'hh:mm:ss a', { locale: arSA })}</span>
            </div>
            <div className="flex justify-between gap-1">
              <span className="text-slate-600">التاريخ</span>
              <span className="font-mono font-bold">{format(footerNow, 'dd/MM/yyyy', { locale: arSA })}</span>
            </div>
            <div className="flex justify-between gap-1 border-t border-slate-300 pt-1">
              <span className="text-slate-600">المجموع</span>
              <span className="font-mono font-black">{grandTotal.toFixed(2)}</span>
            </div>
          </div>
          <div className="border-y border-[#6a1b9a] bg-[#8e24aa] px-2 py-0.5 text-[11px] font-black text-white">
            الفاتورة السابقة
          </div>
          <div className="space-y-0.5 bg-[#fce4ec] p-1.5 text-[11px]">
            <div className="flex justify-between gap-1">
              <span className="font-bold text-slate-800">رقم الفاتورة</span>
              <span className="font-mono font-black">{lastInvoiceNumber || '—'}</span>
            </div>
            <div className="flex justify-between gap-1">
              <span className="font-bold text-slate-800">القيمة</span>
              <span className="font-mono font-black">{prevCompletedSale ? prevCompletedSale.total.toFixed(2) : '0.00'}</span>
            </div>
            <div className="flex justify-between gap-1">
              <span className="font-bold text-slate-800">المدفوع</span>
              <span className="font-mono font-black">{prevCompletedSale ? prevCompletedSale.paid.toFixed(2) : '0.00'}</span>
            </div>
            <div className="flex justify-between gap-1">
              <span className="font-bold text-slate-800">الباقي</span>
              <span className="font-mono font-black">{prevCompletedSale ? prevCompletedSale.change.toFixed(2) : '0.00'}</span>
            </div>
          </div>
          <div className="border-b border-[#0d47a1] bg-[#1976d2] px-2 py-0.5 text-[11px] font-black text-white">
            المستخدم
          </div>
          <div className="bg-white px-2 py-1.5 text-[11px]">
            <div>
              <span className="text-slate-600">المستخدم: </span>
              <span className="font-bold">{user?.displayName ?? '—'}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1">
              <span className="text-slate-600">رصيد افتتاحي</span>
              <span className="font-mono font-bold">60.000</span>
            </div>
          </div>

          <div className="bg-gray-50 rounded-md p-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setShiftCloseOpen(true)}
                className="flex flex-col items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[10px] font-semibold text-white shadow-sm hover:shadow transition-all">
                <span>اغلاق اليوم</span>
              </button>
            <button
              type="button"
              onClick={() => setPosToolModal('daily')}
              className="flex flex-col items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[10px] font-semibold text-white shadow-sm hover:shadow transition-all"
            >
              <span>جرد الصندوق</span>
            </button>
            {canAny(['purchase.read', 'purchase.write']) && (
              <NavLink to="/purchases" className="flex flex-col items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[10px] font-semibold text-white shadow-sm hover:shadow transition-all">
                <span>المشتريات</span>
              </NavLink>
            )}
            {canAny(['inventory.read', 'inventory.write']) && (
              <button
                type="button"
                onClick={() => navi('/inventory-count')}
                className="flex flex-col items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[10px] font-semibold text-white shadow-sm hover:shadow transition-all"
              >
                <span>جرد الكميات</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => navi('/receivables')}
              className="flex flex-col items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[10px] font-semibold text-white shadow-sm hover:shadow transition-all"
            >
              <span>قائمة الذمم</span>
            </button>
            <button
              type="button"
              onClick={() => navi('/expenses')}
              className="flex flex-col items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[10px] font-semibold text-white shadow-sm hover:shadow transition-all"
            >
              <span>المصاريف</span>
            </button>
            <button
              type="button"
              onClick={() => navi('/settings')}
              className="flex flex-col items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[10px] font-semibold text-white shadow-sm hover:shadow transition-all"
            >
              <span>الإعدادات</span>
            </button>
            <button
              type="button"
              onClick={() => navi('/inventory')}
              className="flex flex-col items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[10px] font-semibold text-white shadow-sm hover:shadow transition-all"
            >
              <span>المنتجات</span>
            </button>
            <button
              type="button"
              onClick={() => navi('/reports')}
              className="flex flex-col items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[10px] font-semibold text-white shadow-sm hover:shadow transition-all"
            >
              <span>التقارير</span>
            </button>
            <button
              type="button"
              onClick={() => navi('/suppliers')}
              className="flex flex-col items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[10px] font-semibold text-white shadow-sm hover:shadow transition-all"
            >
              <span>الموردين</span>
            </button>
            </div>
          </div>
        </aside>

        {/* المنطقة الوسطى: جدول الفاتورة + أزرار الدفع */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* جدول الفاتورة */}
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-md">
            <div className="shrink-0 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-[12px] font-bold text-slate-900">أسطر الفاتورة</span>
                {(cartExpirySummary.expired > 0 || cartExpirySummary.near > 0) && (
                <span className="text-[10px] font-semibold">
                  {cartExpirySummary.expired > 0 && (
                    <span className="me-1 rounded bg-red-100 px-1 text-red-800">منتهي: {cartExpirySummary.expired}</span>
                  )}
                  {cartExpirySummary.near > 0 && (
                    <span className="rounded bg-amber-100 px-1 text-amber-900">قريب الانتهاء: {cartExpirySummary.near}</span>
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-[1] border-b-2 border-gray-200 bg-gray-100 text-xs font-semibold text-gray-700">
                <tr>
                  <th className="border border-slate-400 p-1 text-center w-8">X</th>
                  <th className="border border-slate-400 p-1 text-center">رقم المادة</th>
                  <th className="border border-slate-400 p-1 text-right">اسم المادة</th>
                  <th className="border border-slate-400 p-1 text-center">السعر الإفرادي</th>
                  <th className="border border-slate-400 p-1 text-center">الكمية</th>
                  <th className="border border-slate-400 p-1 text-center">السعر الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr
                    key={l.productId}
                    role="button"
                    tabIndex={0}
                    className={
                      (selectedCartProductId === l.productId ? 'bg-[#bbdefb] ring-1 ring-inset ring-[#1565c0] ' : 'hover:bg-[#f5f9ff] ') +
                      'cursor-pointer outline-none'
                    }
                    onClick={() => {
                      setSelectedCartProductId(l.productId)
                      setPosProductUi({ type: 'editor_loading', id: l.productId })
                    }}
                  >
                    <td className="border border-slate-300 p-1 text-center" onClick={(ev) => ev.stopPropagation()}>
                      <button
                        type="button"
                        className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white hover:bg-red-700"
                        onClick={() => removeLine(l.productId)}
                      >
                        X
                      </button>
                    </td>
                    <td className="border border-slate-300 p-1 font-mono text-[11px] text-center">{l.productId.slice(-8)}</td>
                    <td className="border border-slate-300 p-1 text-xs font-medium">{l.name}</td>
                    <td className="border border-slate-300 p-1 font-mono text-xs text-center">{l.unitPrice.toFixed(2)}</td>
                    <td className="border border-slate-300 p-1 text-center" onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          className="h-6 w-6 rounded border border-slate-400 bg-slate-100 hover:bg-white"
                          onClick={() => incQty(l.productId, -1)}
                        >
                          <Minus className="mx-auto h-3 w-3" />
                        </button>
                        <input
                          className="h-6 w-10 rounded border border-slate-400 text-center font-mono text-xs"
                          inputMode="numeric"
                          value={l.quantity}
                          data-pos-cart-qty
                          onPointerDown={() => setSelectedCartProductId(l.productId)}
                          onFocus={() => setSelectedCartProductId(l.productId)}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10)
                            if (Number.isFinite(v)) setQty(l.productId, v)
                          }}
                        />
                        <button
                          type="button"
                          className="h-6 w-6 rounded border border-slate-400 bg-slate-100 hover:bg-white"
                          onClick={() => incQty(l.productId, 1)}
                        >
                          <Plus className="mx-auto h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="border border-slate-300 p-1 font-mono text-xs font-semibold text-center">{lineTotal(l).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!lines.length && (
              <div className="px-4 py-12 text-center text-sm text-slate-500">لا توجد أسطر — اختر من الشبكة أو امسح الباركود</div>
            )}
          </div>
        </main>

          {/* شريط سفلي - صف دفع + أزرار */}
          <footer className="shrink-0 bg-white rounded-lg shadow-md px-2 py-1.5">
            <div className="flex flex-col gap-1">
              {/* صف الدفع والخصم */}
              <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-gray-50 border border-gray-200 px-2 py-1.5" dir="rtl">
                {can('pos.discount') && (
                  <label className="flex items-center gap-0.5">
                    <span className="text-[12px] font-bold text-slate-800">خصم</span>
                    <input
                      className="h-9 w-12 rounded border border-slate-500 bg-white px-1 text-center font-mono text-[13px] font-bold"
                      value={cartDiscount || '0'}
                      onChange={(e) => setCartDiscount(Number(e.target.value || 0))}
                    />
                    <span className="text-[12px] font-bold">%</span>
                  </label>
                )}
                
                {/* أزرار طرق الدفع */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPaymentCode('cash')}
                    className={
                      'h-8 rounded-md px-3 text-xs font-semibold shadow-sm transition-all ' +
                      (paymentCode === 'cash'
                        ? 'bg-green-600 text-white hover:bg-green-700 ring-2 ring-green-300'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300')
                    }
                  >
                    نقدي
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentCode('card')}
                    className={
                      'h-8 rounded-md px-3 text-xs font-semibold shadow-sm transition-all ' +
                      (paymentCode === 'card'
                        ? 'bg-blue-600 text-white hover:bg-blue-700 ring-2 ring-blue-300'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300')
                    }
                  >
                    فيزا
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentCode('click')}
                    className={
                      'h-8 rounded-md px-3 text-xs font-semibold shadow-sm transition-all ' +
                      (paymentCode === 'click'
                        ? 'bg-purple-600 text-white hover:bg-purple-700 ring-2 ring-purple-300'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300')
                    }
                  >
                    كليك
                  </button>
                  {creditAllowed && (
                    <button
                      type="button"
                      onClick={() => setPaymentCode('credit')}
                      className={
                        'h-8 rounded-md px-3 text-xs font-semibold shadow-sm transition-all ' +
                        (paymentCode === 'credit'
                          ? 'bg-orange-600 text-white hover:bg-orange-700 ring-2 ring-orange-300'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300')
                      }
                    >
                      ذمم
                    </button>
                  )}
                </div>
                
                {/* اختيار الزبون عند الآجل */}
                {paymentCode === 'credit' && creditAllowed && (
                  <label className="flex min-w-0 items-center gap-0.5">
                    <span className="text-[12px] font-bold text-slate-800">زبون:</span>
                    <input
                      list="customers-list"
                      className="h-9 w-28 rounded border border-slate-500 bg-white px-1.5 text-[12px] font-bold"
                      value={saleCustomers.find(c => c.id === saleCustomerId)?.name || ''}
                      onChange={(e) => {
                        const customer = saleCustomers.find(c => c.name === e.target.value)
                        setSaleCustomerId(customer?.id || '')
                      }}
                      placeholder="ابحث..."
                    />
                    <datalist id="customers-list">
                      {saleCustomers.map((c) => (
                        <option key={c.id} value={c.name} />
                      ))}
                    </datalist>
                  </label>
                )}
                
                {/* المجموع */}
                <div className="flex items-center gap-0.5">
                  <span className="text-[12px] font-bold text-slate-800">مجموع</span>
                  <div className="h-9 rounded border border-slate-600 bg-slate-700 px-2 font-mono text-[14px] font-black text-white" dir="ltr">
                    {grandTotal.toFixed(3)}
                  </div>
                </div>
                
                {/* الدفع - يظهر فقط عند النقدي */}
                {paymentCode === 'cash' && (
                  <label className="flex items-center gap-0.5">
                    <span className="text-[12px] font-bold text-slate-800">دفع</span>
                    <input
                      className="h-9 w-16 rounded border border-slate-500 bg-white px-1.5 text-center font-mono text-[13px] font-bold"
                      value={cashReceived}
                      placeholder="0.000"
                      onChange={(e) => setCashReceived(e.target.value)}
                    />
                  </label>
                )}
                
                {/* الباقي */}
                <div className="flex items-center gap-0.5">
                  <span className="text-[12px] font-bold text-slate-800">باقي</span>
                  <div className="h-9 rounded border border-black bg-black px-2 font-mono text-[14px] font-black text-[#00ff00]" dir="ltr">
                    {changeDue.toFixed(3)}
                  </div>
                </div>
              </div>

              {/* شبكة الأزرار */}
              <div className="flex items-stretch gap-1">
                <div className="grid flex-1 grid-cols-5 gap-1">
                  <button
                    type="button"
                    onClick={async () => {
                      const id = lastSaleId
                      if (!id) {
                        toast('لا توجد فاتورة سابقة للطباعة', 'err')
                        return
                      }
                      try {
                        const pr = await window.posApi.print.saleReceipt(id)
                        if (!pr.ok) toast('تعذّرت الطباعة', 'err')
                        else toast('تم إرسال الفاتورة للطباعة')
                      } catch {
                        toast('خطأ في الطباعة', 'err')
                      }
                    }}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[9px] font-semibold text-white shadow-sm hover:shadow transition-all"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>طباعة آخر فاتورة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void window.posApi.hardware.cashDrawer()}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[9px] font-semibold text-white shadow-sm hover:shadow transition-all"
                  >
                    <Package className="h-3.5 w-3.5" />
                    <span>فتح الدرج</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedCartProductId) {
                        setPosProductUi({ type: 'editor_loading', id: selectedCartProductId })
                      } else {
                        toast('اختر منتجاً من الفاتورة أولاً', 'err')
                      }
                    }}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[9px] font-semibold text-white shadow-sm hover:shadow transition-all"
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    <span>تعديل السعر (F4)</span>
                  </button>
                  <button
                    type="button"
                    disabled={!lines.length}
                    onClick={() => void completeSale({ printReceipt: false })}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-green-600 hover:bg-green-700 active:bg-green-800 py-2 text-[9px] font-semibold text-white shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>حفظ (F10)</span>
                  </button>
                  <button
                    type="button"
                    disabled={!lines.length}
                    onClick={() => void completeSale({ printReceipt: true })}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-green-600 hover:bg-green-700 active:bg-green-800 py-2 text-[9px] font-semibold text-white shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>حفظ+طباعة (F11)</span>
                  </button>
                  <button
                    type="button"
                    id="btn-hold"
                    onClick={async () => {
                      if (!lines.length) return
                      const name = heldName || `معلق ${new Date().toLocaleTimeString('ar-SA')}`
                      const r = await window.posApi.sales.hold({
                        heldName: name,
                        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount })),
                        discount: cartDiscount
                      })
                      if (r.ok) {
                        clear()
                        setHeldName('')
                        toast('تم تعليق الفاتورة')
                      }
                    }}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800 py-2 text-[9px] font-semibold text-white shadow-sm hover:shadow transition-all"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    <span>تعليق (PageDown)</span>
                  </button>
                  <button
                    type="button"
                    onClick={cancelSale}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-red-600 hover:bg-red-700 active:bg-red-800 py-2 text-[9px] font-semibold text-white shadow-sm hover:shadow transition-all"
                  >
                    <Eraser className="h-3.5 w-3.5" />
                    <span>مسح (Esc)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeldOpen(true)}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[9px] font-semibold text-white shadow-sm hover:shadow transition-all"
                  >
                    <ListOrdered className="h-3.5 w-3.5" />
                    <span>المعلقة (F9)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navi('/returns')}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[9px] font-semibold text-white shadow-sm hover:shadow transition-all"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    <span>مرتجعات (F7)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navi('/customers')}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 py-2 text-[9px] font-semibold text-white shadow-sm hover:shadow transition-all"
                  >
                    <UserCircle className="h-3.5 w-3.5" />
                    <span>الزبائن</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md bg-red-600 hover:bg-red-700 active:bg-red-800 py-2 text-[9px] font-bold text-white shadow-sm hover:shadow transition-all"
                >
                  <Power className="h-4 w-4" />
                  <span>خروج</span>
                </button>
              </div>
            </div>
          </footer>
        </div>

        {/* أزرار المنتجات - يسار */}
        <aside className="flex w-[min(100%,320px)] shrink-0 overflow-hidden rounded-lg bg-white shadow-md md:w-[340px] lg:w-[400px]">
          <div className="flex w-16 shrink-0 flex-col items-center gap-1 border-e border-gray-200 bg-gray-50 p-2">
            <button
              type="button"
              onClick={() => setSelectedCategoryId(null)}
              className={`flex w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-3 text-[10px] font-bold transition-all ${
                selectedCategoryId == null
                  ? 'bg-blue-100 text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              <Grid2x2 className="h-4 w-4" />
              <span>الكل</span>
            </button>
            {categories.slice(0, 6).map((c) => {
              const label = c.name.length > 8 ? `${c.name.slice(0, 8)}…` : c.name
              const icon = c.name.includes('مشروب')
                ? CupSoda
                : c.name.includes('حل') || c.name.includes('حلو')
                  ? Candy
                  : c.name.includes('غذ') || c.name.includes('مادة')
                    ? Apple
                    : c.name.includes('منظ')
                      ? SprayCan
                      : MoreHorizontal
              const Icon = icon
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(c.id)}
                  className={`flex w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-3 text-[10px] font-bold transition-all ${
                    selectedCategoryId === c.id
                      ? 'bg-blue-100 text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                  title={c.name}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-center leading-tight">{label}</span>
                </button>
              )
            })}
            <div className="mt-auto w-full rounded-lg border border-gray-200 bg-white px-1 py-2 text-center text-[10px] font-semibold text-slate-600">
              <div className="font-mono text-[11px] text-slate-800">{filtered.length}</div>
              <div>مادة معروضة</div>
            </div>
          </div>
          <div ref={parentRef} className="min-h-0 flex-1 overflow-auto bg-gray-100 p-3">
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }} className="w-full">
              {rowVirtualizer.getVirtualItems().map((vRow) => {
                const rowIndex = vRow.index
                const start = rowIndex * COLS
                const slice = filtered.slice(start, start + COLS)
                return (
                  <div
                    key={vRow.key}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${vRow.start}px)` }}
                  >
                    <div className="grid gap-3 pb-4 md:gap-4 md:pb-5 xl:gap-6 xl:pb-6" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
                      {slice.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            addProduct({
                              id: p.id,
                              name: p.name,
                              salePrice: p.salePrice,
                              quantityAvailable: p.quantity
                            })
                          }
                          className="flex h-[9.5rem] flex-col gap-2 rounded-xl border-4 border-white bg-gradient-to-br from-green-400 to-green-500 p-3 text-start shadow-lg ring-2 ring-gray-300 transition-all hover:from-green-500 hover:to-green-600 hover:shadow-xl active:scale-95 md:h-[10rem] md:p-3.5 xl:h-[11rem] xl:gap-2.5 xl:p-4 overflow-hidden"
                        >
                          <span className="font-mono text-[11px] font-semibold leading-tight text-green-900 opacity-75 truncate">
                            {p.id.length > 8 ? p.id.slice(-6) : p.id}
                          </span>
                          <span className="line-clamp-3 text-base font-bold leading-snug text-white flex-1 overflow-hidden">{p.name}</span>
                          <span className="text-sm font-semibold text-white shrink-0">
                            <span className="font-mono text-lg font-bold tabular-nums">
                              {p.salePrice.toFixed(3)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </aside>
      </div>

      {posToolModal && (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center bg-black/45 p-4"
          onClick={() => setPosToolModal(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-300 bg-white shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {posToolModal === 'daily' && (
              <>
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-200 border-b border-slate-300 shrink-0">
                  <span className="font-bold text-slate-800">يومية الشفت</span>
                  <button
                    type="button"
                    className="p-1.5 rounded-lg hover:bg-slate-300 text-slate-700"
                    aria-label="إغلاق"
                    onClick={() => setPosToolModal(null)}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-4 overflow-y-auto text-sm space-y-3">
                  {dailyLoading && <div className="text-center text-slate-500 py-6">جاري التحميل…</div>}
                  {!dailyLoading && dailyStats && (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                          <div className="text-slate-500 mb-0.5">الرصيد الافتتاحي</div>
                          <div className="font-mono font-bold text-base tabular-nums" dir="ltr">
                            {dailyStats.openingCash.toFixed(2)}
                            {CURRENCY_SUFFIX}
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                          <div className="text-slate-500 mb-0.5">إيراد الشفت</div>
                          <div className="font-mono font-bold text-base tabular-nums text-emerald-700" dir="ltr">
                            {dailyStats.revenue.toFixed(2)}
                            {CURRENCY_SUFFIX}
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                          <div className="text-slate-500 mb-0.5">عدد الفواتير المكتملة</div>
                          <div className="font-bold text-lg">{dailyStats.invoices}</div>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                          <div className="text-slate-500 mb-0.5">فواتير معلقة</div>
                          <div className="font-bold text-lg">{dailyStats.heldInvoices}</div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3 space-y-1.5 bg-white">
                        <div className="text-xs font-semibold text-slate-700 mb-1">حسب طريقة الدفع</div>
                        <StatRowPay label="نقدي" value={dailyStats.cashSales} />
                        <StatRowPay label="بطاقة" value={dailyStats.cardSales} />
                        <StatRowPay label="متعدد" value={dailyStats.mixedSales} />
                      </div>
                      {dailyStats.topItems.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-slate-700 mb-2">الأكثر مبيعاً في هذا الشفت</div>
                          <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto">
                            {dailyStats.topItems.map((t, i) => (
                              <li key={`${t.name}-${i}`} className="flex justify-between gap-2 px-2 py-1.5 text-xs">
                                <span className="truncate text-slate-800">{t.name}</span>
                                <span className="font-mono shrink-0 tabular-nums">{t.qty}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <button
                        type="button"
                        className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium hover:bg-slate-50"
                        onClick={() => setPosToolModal(null)}
                      >
                        إغلاق
                      </button>
                    </>
                  )}
                  {!dailyLoading && !dailyStats && (
                    <p className="text-center text-slate-500 py-4 text-sm">لا توجد بيانات — تأكد من فتح الشفت.</p>
                  )}
                </div>
              </>
            )}

            {posToolModal === 'print' && (
              <>
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-200 border-b border-slate-300 shrink-0">
                  <span className="font-bold text-slate-800">طباعة فاتورة</span>
                  <button
                    type="button"
                    className="p-1.5 rounded-lg hover:bg-slate-300 text-slate-700"
                    aria-label="إغلاق"
                    onClick={() => setPosToolModal(null)}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-slate-600">
                    آخر فاتورة:{' '}
                    <span className="font-mono font-semibold text-slate-900">{lastInvoiceNumber || '—'}</span>
                  </p>
                  <label className="block text-xs text-slate-600 space-y-1">
                    معرّف عملية البيع (للطباعة اليدوية)
                    <input
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs dir-ltr text-left"
                      value={printSaleId}
                      onChange={(e) => setPrintSaleId(e.target.value)}
                      placeholder="الصق المعرّف أو اتركه لآخر عملية بيع"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={printBusy}
                      className="touch-target rounded-xl bg-[#1e3a8a] text-white text-sm font-semibold py-2.5 hover:bg-[#172554] disabled:opacity-50"
                      onClick={async () => {
                        const id = printSaleId.trim() || lastSaleId
                        if (!id) {
                          toast('لا يوجد معرّف فاتورة — نفّذ بيعاً أولاً أو الصق المعرّف', 'err')
                          return
                        }
                        setPrintBusy(true)
                        try {
                          const pr = await window.posApi.print.saleReceipt(id)
                          if (!pr.ok) toast('تعذّرت الطباعة — تحقق من الطابعة والمعرّف', 'err')
                          else toast('تم إرسال الفاتورة للطباعة')
                        } finally {
                          setPrintBusy(false)
                        }
                      }}
                    >
                      {printBusy ? 'جاري الطباعة…' : 'طباعة'}
                    </button>
                    <button
                      type="button"
                      className="touch-target rounded-xl border border-slate-300 text-sm font-medium py-2.5 hover:bg-slate-50"
                      onClick={() => void window.posApi.hardware.cashDrawer()}
                    >
                      فتح الدرج
                    </button>
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-slate-300 py-2 text-sm hover:bg-slate-50"
                    onClick={() => setPosToolModal(null)}
                  >
                    إغلاق
                  </button>
                </div>
              </>
            )}

            {posToolModal === 'shiftInfo' && (
              <>
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-200 border-b border-slate-300 shrink-0">
                  <span className="font-bold text-slate-800">الشفت والرصيد الافتتاحي</span>
                  <button
                    type="button"
                    className="p-1.5 rounded-lg hover:bg-slate-300 text-slate-700"
                    aria-label="إغلاق"
                    onClick={() => setPosToolModal(null)}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  {shiftInfoLoading && <div className="text-center text-slate-500 py-6">جاري التحميل…</div>}
                  {!shiftInfoLoading && shiftInfo && (
                    <>
                      <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                        <div className="flex justify-between gap-2 px-3 py-2">
                          <span className="text-slate-600">رقم الشفت</span>
                          <span className="font-mono text-xs dir-ltr">{shiftInfo.id}</span>
                        </div>
                        <div className="flex justify-between gap-2 px-3 py-2">
                          <span className="text-slate-600">وقت الفتح</span>
                          <span className="font-mono text-xs">
                            {format(new Date(shiftInfo.openedAt), 'dd/MM/yyyy HH:mm', { locale: arSA })}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2 px-3 py-2">
                          <span className="text-slate-600">الرصيد الافتتاحي</span>
                          <span className="font-mono font-bold" dir="ltr">
                            {shiftInfo.openingCash.toFixed(2)}
                            {CURRENCY_SUFFIX}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2 px-3 py-2">
                          <span className="text-slate-600">الجهاز</span>
                          <span className="font-mono text-xs truncate max-w-[55%] text-end">{shiftInfo.deviceId}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium hover:bg-slate-50"
                        onClick={() => setPosToolModal(null)}
                      >
                        إغلاق
                      </button>
                    </>
                  )}
                  {!shiftInfoLoading && !shiftInfo && (
                    <p className="text-center text-slate-500 py-4">لا يوجد شفت مفتوح — استخدم تسجيل الدخول لفتح شفت.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {heldOpen && (
        <div
          className="fixed inset-0 z-[120] bg-black/45 flex items-center justify-center p-4"
          onClick={() => setHeldOpen(false)}
        >
          <div
            className="bg-white rounded-xl max-w-md w-full max-h-[70vh] overflow-hidden flex flex-col shadow-2xl border border-slate-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-200 border-b border-slate-300 shrink-0">
              <span className="font-bold text-slate-800">فواتير معلقة</span>
              <button
                type="button"
                className="p-1.5 rounded-lg hover:bg-slate-300 text-slate-700"
                aria-label="إغلاق"
                onClick={() => setHeldOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 min-h-0">
            <ul className="space-y-2 text-sm">
              {heldList.map((h) => (
                <li key={h.id} className="flex justify-between items-center border border-slate-200 rounded-lg p-2">
                  <div>
                    <div className="font-medium">{h.heldName ?? h.id}</div>
                    <div className="font-mono text-xs text-slate-600" dir="ltr">
                      {h.total.toFixed(2)}
                      {CURRENCY_SUFFIX}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="text-xs border border-slate-200 rounded px-2 py-1 hover:bg-slate-50"
                      onClick={async () => {
                        const g = await window.posApi.sales.heldConsume(h.id)
                        if (!g.ok || !('sale' in g)) {
                          playErrorSound()
                          toast('تعذر استرجاع هذه الفاتورة.', 'err')
                          const r = await window.posApi.sales.heldList()
                          if (r.ok && 'items' in r) {
                            setHeldList(r.items as { id: string; heldName: string | null; total: number }[])
                          }
                          return
                        }
                        const s = g.sale as {
                          discount: number
                          items: { productId: string; name: string; quantity: number; unitPrice: number; discount: number }[]
                        }
                        replaceCart(
                          s.items.map((it) => ({
                            productId: it.productId,
                            name: it.name,
                            quantity: it.quantity,
                            unitPrice: it.unitPrice,
                            discount: it.discount
                          })),
                          s.discount
                        )
                        const r = await window.posApi.sales.heldList()
                        if (r.ok && 'items' in r) {
                          setHeldList(r.items as { id: string; heldName: string | null; total: number }[])
                        }
                        setHeldOpen(false)
                      }}
                    >
                      استرجاع
                    </button>
                    <button
                      type="button"
                      className="text-xs text-red-600 border border-red-200 rounded px-2 py-1 hover:bg-red-50"
                      onClick={async () => {
                        await window.posApi.sales.heldDelete(h.id)
                        const r = await window.posApi.sales.heldList()
                        if (r.ok && 'items' in r) setHeldList(r.items as never)
                      }}
                    >
                      حذف
                    </button>
                  </div>
                </li>
              ))}
            </ul>
              <button
                type="button"
                className="mt-4 w-full border border-slate-300 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50"
                onClick={() => setHeldOpen(false)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      <ProductSearchModal
        open={quickProductPickOpen}
        title="منتج سريع — بحث وإضافة للسلة"
        onClose={() => setQuickProductPickOpen(false)}
        onPick={(p: PickedProduct) => {
          playScanSound()
          addProduct({
            id: p.id,
            name: p.name,
            salePrice: p.salePrice,
            quantityAvailable: p.quantity
          })
        }}
      />

      {posProductUi?.type === 'editor_loading' && (
        <div className="fixed inset-0 z-[92] flex items-center justify-center bg-black/35">
          <div className="rounded-sm border border-[#808080] bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg">
            جاري فتح بطاقة المنتج…
          </div>
        </div>
      )}

      {posProductUi?.type === 'unknown_barcode' && (
        <EnterpriseModalFrame title="المنتج غير مضاف" onClose={() => setPosProductUi(null)} maxWidthClass="max-w-md">
          <p className="text-sm text-slate-700 leading-relaxed">
            الباركود{' '}
            <span className="font-mono font-bold text-slate-900 dir-ltr inline-block">{posProductUi.code}</span> غير مسجّل
            في المستودع.
          </p>
          {can('product.write') ? (
            <button
              type="button"
              className="mt-4 w-full rounded-sm border border-[#1b5e20] bg-[#2e7d32] py-2.5 text-sm font-bold text-white shadow hover:bg-[#388e3c]"
              onClick={() =>
                setPosProductUi({ type: 'editor', initial: null, prefillBarcode: posProductUi.code })
              }
            >
              إضافة منتج بهذا الباركود
            </button>
          ) : (
            <p className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-sm p-2">
              ليس لديك صلاحية إضافة منتج. اطلب من المدير تفعيل صلاحية إدارة المنتجات.
            </p>
          )}
          <button
            type="button"
            className="mt-3 w-full rounded-sm border border-[#888] bg-[#f0f0f0] py-2 text-sm font-semibold text-slate-800 hover:bg-white"
            onClick={() => setPosProductUi(null)}
          >
            إغلاق
          </button>
        </EnterpriseModalFrame>
      )}

      {posProductUi?.type === 'readonly' && (
        <EnterpriseModalFrame title="بطاقة المنتج" onClose={() => setPosProductUi(null)} maxWidthClass="max-w-lg">
          <div className="space-y-2 text-sm text-slate-800">
            <div>
              <span className="text-slate-500">الاسم: </span>
              <span className="font-semibold">{posProductUi.product.name}</span>
            </div>
            {posProductUi.product.shortName ? (
              <div>
                <span className="text-slate-500">مختصر: </span>
                {posProductUi.product.shortName}
              </div>
            ) : null}
            <div>
              <span className="text-slate-500">التصنيف: </span>
              {posProductUi.product.categoryName ?? categories.find((c) => c.id === posProductUi.product.categoryId)?.name ?? '—'}
            </div>
            <div className="dir-ltr text-end">
              <span className="text-slate-500">الباركود: </span>
              <span className="font-mono font-semibold">{posProductUi.product.barcode ?? '—'}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-xs">
              <div>شراء: {posProductUi.product.purchasePrice.toFixed(2)}</div>
              <div>بيع: {posProductUi.product.salePrice.toFixed(2)}</div>
              <div>كمية: {posProductUi.product.quantity}</div>
              <div>حد أدنى: {posProductUi.product.minStock}</div>
            </div>
            <div className="text-xs text-slate-600">
              على POS: {posProductUi.product.showOnPos ? 'نعم' : 'لا'}
              {posProductUi.product.isWeighted ? ` — بالوزن (${posProductUi.product.weightPrefix ?? ''})` : ''}
            </div>
            {posProductUi.product.barcodes?.length ? (
              <div className="text-xs">
                <span className="text-slate-500">باركودات بديلة: </span>
                <span className="font-mono">{posProductUi.product.barcodes.map((b) => b.barcode).join('، ')}</span>
              </div>
            ) : null}
            <p className="text-xs text-slate-500 pt-1">لتعديل البيانات تحتاج صلاحية «إدارة المنتجات».</p>
          </div>
          <button
            type="button"
            className="mt-4 w-full rounded-sm border border-[#1b5e20] bg-[#2e7d32] py-2.5 text-sm font-bold text-white shadow hover:bg-[#388e3c]"
            onClick={() => {
              const pr = posProductUi.product
              addProduct({
                id: pr.id,
                name: pr.name,
                salePrice: pr.salePrice,
                quantityAvailable: pr.quantity
              })
              toast('تمت إضافة المنتج للسلة', 'ok')
              setPosProductUi(null)
            }}
          >
            أضف للسلة
          </button>
        </EnterpriseModalFrame>
      )}

      {posProductUi?.type === 'editor' && (
        <ProductEditorModal
          key={posProductUi.initial?.id ?? `new-${posProductUi.prefillBarcode ?? ''}`}
          categories={categories}
          reloadCategories={reloadCategoriesForPos}
          initial={posProductUi.initial}
          prefillBarcode={posProductUi.prefillBarcode}
          titleOverride={posProductUi.initial ? 'بطاقة المنتج' : 'منتج جديد'}
          beforeSaveActions={
            posProductUi.initial ? (
              <button
                type="button"
                className="w-full rounded-sm border border-[#1b5e20] bg-[#2e7d32] py-2.5 text-sm font-bold text-white shadow hover:bg-[#388e3c]"
                onClick={() => {
                  const pr = posProductUi.initial!
                  addProduct({
                    id: pr.id,
                    name: pr.name,
                    salePrice: pr.salePrice,
                    quantityAvailable: pr.quantity
                  })
                  toast('تمت إضافة المنتج للسلة', 'ok')
                }}
              >
                أضف للسلة
              </button>
            ) : null
          }
          onClose={() => setPosProductUi(null)}
          onSaved={() => {
            setPosProductUi(null)
            void load()
          }}
        />
      )}

      {shiftCloseOpen && <CloseShiftModal onClose={() => setShiftCloseOpen(false)} />}
    </div>
  )
}
