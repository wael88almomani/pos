import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { EnterpriseModalFrame } from '../../shared/EnterpriseToolbar'

type BarRow = { barcode: string; variantName: string; isDefault: boolean }
type PackagingUnit = { 
  name: string
  quantity: number 
  barcode: string
  salePrice: number
}

export type InventoryProduct = {
  id: string
  name: string
  shortName: string | null
  categoryId: string | null
  /** يأتي من الخادم عند جلب المنتج */
  categoryName?: string | null
  barcode: string | null
  purchasePrice: number
  salePrice: number
  quantity: number
  minStock: number
  expiryDate?: string | null
  showOnPos: boolean
  imagePath: string | null
  averageCost?: number
  isWeighted?: boolean
  weightPrefix?: string | null
  barcodes: { id: string; barcode: string; variantName: string | null; isDefault: boolean }[]
}

const NEW_CATEGORY_VALUE = '__new__'

export type ProductEditorModalProps = {
  categories: { id: string; name: string }[]
  reloadCategories: () => Promise<void>
  initial: InventoryProduct | null
  onClose: () => void
  onSaved: () => void
  /** عند فتح «منتج جديد» مع باركود معروف (مثلاً من مسح غير موجود) */
  prefillBarcode?: string
  titleOverride?: string
  /** أزرار إضافية فوق زر الحفظ (مثل «أضف للسلة» من شاشة البيع) */
  beforeSaveActions?: ReactNode
}

export function ProductEditorModal({
  categories,
  reloadCategories,
  initial,
  onClose,
  onSaved,
  prefillBarcode,
  titleOverride,
  beforeSaveActions
}: ProductEditorModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [shortName, setShortName] = useState(initial?.shortName ?? '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [barcode, setBarcode] = useState(initial?.barcode ?? prefillBarcode ?? '')
  const [purchasePrice, setPurchasePrice] = useState(String(initial?.purchasePrice ?? 0))
  const [salePrice, setSalePrice] = useState(String(initial?.salePrice ?? 0))
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 0))
  const [minStock, setMinStock] = useState(String(initial?.minStock ?? 0))
  const [expiryDate, setExpiryDate] = useState(
    initial?.expiryDate ? String(initial.expiryDate).slice(0, 10) : ''
  )
  const [showOnPos, setShowOnPos] = useState(initial?.showOnPos ?? false)
  const [averageCost, setAverageCost] = useState(String(initial?.averageCost ?? initial?.purchasePrice ?? 0))
  const [isWeighted, setIsWeighted] = useState(initial?.isWeighted ?? false)
  const [weightPrefix, setWeightPrefix] = useState(initial?.weightPrefix ?? '')
  const [bars, setBars] = useState<BarRow[]>(() =>
    (initial?.barcodes ?? []).map((b) => ({
      barcode: b.barcode,
      variantName: b.variantName ?? '',
      isDefault: b.isDefault
    }))
  )
  const [preview, setPreview] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [newCategoryOpen, setNewCategoryOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryShowOnPos, setNewCategoryShowOnPos] = useState(false)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const categoryIdBeforeNewRef = useRef<string | null>(null)
  const newCategoryInputRef = useRef<HTMLInputElement>(null)
  const defRadioName = useRef(`def-${initial?.id ?? 'new'}-${Math.random().toString(36).slice(2, 9)}`).current
  
  // الوحدات الكبرى
  const [packagingUnits, setPackagingUnits] = useState<PackagingUnit[]>([])
  const [packagingOpen, setPackagingOpen] = useState(false)
  
  // العروض
  const [offersOpen, setOffersOpen] = useState(false)
  const [offerType, setOfferType] = useState<'discount' | 'fixed' | 'bogo' | 'bundle'>('discount')
  const [offerValue, setOfferValue] = useState('0')
  const [offerStartDate, setOfferStartDate] = useState('')
  const [offerEndDate, setOfferEndDate] = useState('')
  const [currentPromotions, setCurrentPromotions] = useState<any[]>([])
  const [savingPromotion, setSavingPromotion] = useState(false)
  
  // مرجع لقسم الباركودات البديلة
  const barcodesRef = useRef<HTMLDivElement>(null)

  // تحميل العروض عند فتح المودال للمنتج الموجود
  useEffect(() => {
    if (initial?.id) {
      void loadPromotions(initial.id)
    }
  }, [initial?.id])

  async function loadPromotions(productId: string) {
    const result = await window.posApi.promotions.list(productId)
    if (result.ok && 'items' in result) {
      setCurrentPromotions(result.items)
    }
  }

  async function savePromotion() {
    if (!initial?.id) {
      toast('يجب حفظ المنتج أولاً قبل إضافة عروض', 'err')
      return
    }

    setSavingPromotion(true)
    try {
      const result = await window.posApi.promotions.save({
        productId: initial.id,
        type: offerType,
        value: parseFloat(offerValue) || 0,
        freeQty: offerType === 'bogo' ? 1 : undefined,
        startDate: offerStartDate || undefined,
        endDate: offerEndDate || undefined,
        isActive: true
      })

      if (result.ok) {
        toast('تم حفظ العرض بنجاح ✅', 'ok')
        setOffersOpen(false)
        // إعادة تحميل العروض
        await loadPromotions(initial.id)
        // إعادة تعيين الحقول
        setOfferType('discount')
        setOfferValue('0')
        setOfferStartDate('')
        setOfferEndDate('')
      } else {
        toast('فشل حفظ العرض', 'err')
      }
    } catch (error) {
      toast('حدث خطأ أثناء حفظ العرض', 'err')
    } finally {
      setSavingPromotion(false)
    }
  }

  async function deletePromotion(promoId: string) {
    if (!confirm('هل تريد حذف هذا العرض؟')) return
    
    const result = await window.posApi.promotions.delete(promoId)
    if (result.ok) {
      toast('تم حذف العرض', 'ok')
      if (initial?.id) await loadPromotions(initial.id)
    } else {
      toast('فشل حذف العرض', 'err')
    }
  }

  async function togglePromotion(promoId: string) {
    const result = await window.posApi.promotions.toggle(promoId)
    if (result.ok) {
      toast('تم تحديث حالة العرض', 'ok')
      if (initial?.id) await loadPromotions(initial.id)
    } else {
      toast('فشل تحديث حالة العرض', 'err')
    }
  }

  useEffect(() => {
    setNewCategoryOpen(false)
    setNewCategoryName('')
    categoryIdBeforeNewRef.current = null
  }, [initial?.id])

  useEffect(() => {
    if (!newCategoryOpen) return
    const t = window.setTimeout(() => {
      const active = document.activeElement
      if (active instanceof HTMLSelectElement) active.blur()
      const el = newCategoryInputRef.current
      if (!el) return
      el.focus({ preventScroll: true })
      if (el.value) el.select()
    }, 0)
    return () => window.clearTimeout(t)
  }, [newCategoryOpen])

  useEffect(() => {
    if (!initial && prefillBarcode) setBarcode(prefillBarcode)
  }, [initial, prefillBarcode])

  async function gen() {
    const r = await window.posApi.products.generateBarcode()
    if (r.ok && 'barcode' in r) {
      setPreview(r.barcode as string)
      setBarcode(r.barcode as string)
    }
  }

  async function submitNewCategory() {
    const n = newCategoryName.trim()
    if (!n) {
      setErr('أدخل اسماً للتصنيف الجديد')
      return
    }
    setErr(null)
    setCreatingCategory(true)
    try {
      const r = await window.posApi.products.createCategory({ name: n, showOnPos: newCategoryShowOnPos })
      if (!r.ok || !('item' in r)) {
        setErr('تعذر إنشاء التصنيف — تحقق من الصلاحيات')
        return
      }
      const item = r.item as { id: string; name: string }
      setCategoryId(item.id)
      setNewCategoryOpen(false)
      setNewCategoryName('')
      setNewCategoryShowOnPos(false)
      categoryIdBeforeNewRef.current = null
      await reloadCategories()
    } finally {
      setCreatingCategory(false)
    }
  }

  async function save() {
    setErr(null)
    if (newCategoryOpen) {
      setErr('أنشئ التصنيف أو اضغط «إلغاء» للعودة إلى قائمة التصنيفات')
      return
    }
    const payload = {
      id: initial?.id,
      name,
      shortName: shortName || null,
      categoryId: categoryId || null,
      barcode: barcode || null,
      purchasePrice: Number(purchasePrice),
      salePrice: Number(salePrice),
      quantity: Number(quantity),
      minStock: Number(minStock),
      expiryDate: expiryDate || null,
      showOnPos,
      imagePath: null,
      averageCost: Number(averageCost),
      isWeighted,
      weightPrefix: weightPrefix.trim() || null,
      barcodes: bars
        .filter((b) => b.barcode.trim())
        .map((b) => ({
          barcode: b.barcode.trim(),
          variantName: b.variantName || null,
          isDefault: b.isDefault
        }))
    }
    const r = await window.posApi.products.save(payload)
    if (!r.ok) {
      setErr('تعذر الحفظ — تحقق من الباركودات الفريدة')
      return
    }
    onSaved()
  }

  const modalTitle = titleOverride ?? (initial ? 'تعديل مادة' : 'إضافة مادة')

  return (
    <EnterpriseModalFrame title={modalTitle} onClose={onClose} maxWidthClass="max-w-5xl">
      <div className="flex gap-3 max-h-[calc(92vh-5rem)] overflow-y-auto">
        {/* المحتوى الرئيسي */}
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {/* رقم المادة / الباركود */}
            <label className="text-sm flex items-center justify-end gap-2">
              <input 
                className="flex-1 border border-[#808080] px-2 py-1 text-sm font-mono bg-white" 
                value={barcode} 
                onChange={(e) => setBarcode(e.target.value)}
                placeholder=""
                autoFocus
              />
              <button 
                type="button" 
                className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-2 py-1 text-xs font-bold hover:from-[#f5f5f5] whitespace-nowrap" 
                onClick={() => void gen()}
              >
                توليد
              </button>
              <span className="font-bold text-[#1a1a1a] whitespace-nowrap">: رقم المادة / الباركود *</span>
            </label>

            <label className="text-sm flex items-center justify-end gap-2">
              <input
                className="flex-1 border border-[#808080] px-2 py-1 text-sm bg-white"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                dir="ltr"
              />
              <span className="font-bold text-[#1a1a1a] whitespace-nowrap">: الكمية المتوفرة</span>
            </label>

            {/* اسم المادة */}
            <label className="text-sm flex items-center justify-end gap-2">
              <input 
                className="flex-1 border border-[#808080] px-2 py-1 text-sm bg-white" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
              />
              <span className="font-bold text-[#1a1a1a] whitespace-nowrap">: اسم المادة *</span>
            </label>

            <label className="text-sm flex items-center justify-end gap-2">
              <input
                className="flex-1 border border-[#808080] px-2 py-1 text-sm font-mono bg-white"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                dir="ltr"
              />
              <span className="font-bold text-[#1a1a1a] whitespace-nowrap">: سعر البيع مفرق</span>
            </label>

            {/* الاسم المختصر */}
            <label className="text-sm flex items-center justify-end gap-2">
              <input
                className="flex-1 border border-[#808080] px-2 py-1 text-sm bg-white"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
              />
              <span className="font-bold text-[#1a1a1a] whitespace-nowrap">: الاسم المختصر</span>
            </label>

            <label className="text-sm flex items-center justify-end gap-2">
              <input
                className="flex-1 border border-[#808080] px-2 py-1 text-sm font-mono bg-white"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                dir="ltr"
              />
              <span className="font-bold text-[#1a1a1a] whitespace-nowrap">: سعر البيع جملة</span>
            </label>

            {/* نسبة الخصم */}
            <label className="text-sm flex items-center justify-end gap-2">
              <input
                className="flex-1 border border-[#808080] px-2 py-1 text-sm font-mono bg-white"
                defaultValue="0"
                dir="ltr"
              />
              <span className="font-bold text-[#1a1a1a] whitespace-nowrap">: نسبة الخصم %</span>
            </label>

            <label className="text-sm flex items-center justify-end gap-2">
              <input
                className="flex-1 border border-[#808080] px-2 py-1 text-sm font-mono bg-white"
                value={averageCost}
                onChange={(e) => setAverageCost(e.target.value)}
                dir="ltr"
              />
              <span className="font-bold text-[#1a1a1a] whitespace-nowrap">: سعر التكلفة</span>
            </label>

            {/* نسبة الضريبة */}
            <label className="text-sm flex items-center justify-end gap-2">
              <input
                className="flex-1 border border-[#808080] px-2 py-1 text-sm font-mono bg-white"
                defaultValue="0"
                dir="ltr"
              />
              <span className="font-bold text-[#1a1a1a] whitespace-nowrap">: نسبة الضريبة %</span>
            </label>

            <label className="text-sm flex items-center justify-end gap-2">
              <input
                className="flex-1 border border-[#808080] px-2 py-1 text-sm font-mono bg-white"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                dir="ltr"
              />
              <span className="font-bold text-[#1a1a1a] whitespace-nowrap">: الحد الأدنى للمخزون</span>
            </label>

            {/* التصنيف */}
            <label className="text-sm flex items-center justify-end gap-2">
              <select
                className="flex-1 border border-[#808080] px-2 py-1 text-sm bg-white"
                value={newCategoryOpen ? NEW_CATEGORY_VALUE : categoryId}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === NEW_CATEGORY_VALUE) {
                    categoryIdBeforeNewRef.current = categoryId || null
                    setCategoryId('')
                    setNewCategoryOpen(true)
                    return
                  }
                  setNewCategoryOpen(false)
                  setNewCategoryName('')
                  categoryIdBeforeNewRef.current = null
                  setCategoryId(v)
                }}
              >
                <option value="">— بدون تصنيف —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value={NEW_CATEGORY_VALUE}>➕ إضافة تصنيف جديد…</option>
              </select>
              <span className="font-bold text-[#1a1a1a] whitespace-nowrap">: التصنيف</span>
            </label>

            <label className="text-sm flex items-center justify-end gap-2">
              <input
                type="date"
                className="flex-1 border border-[#808080] px-2 py-1 text-sm font-mono bg-white"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
              <span className="font-bold text-[#1a1a1a] whitespace-nowrap">: تاريخ الانتهاء</span>
            </label>

            {/* المورد */}
            <label className="text-sm flex items-center justify-end gap-2">
              <select
                className="flex-1 border border-[#808080] px-2 py-1 text-sm bg-white"
              >
                <option value="">الرئيسي</option>
              </select>
              <span className="font-bold text-[#1a1a1a] whitespace-nowrap">: المصدر</span>
            </label>

            {/* مساحة فارغة */}
            <div></div>

            {/* مادة ميزانية */}
            <label className="text-sm flex items-center justify-end gap-2">
              <input type="checkbox" checked={isWeighted} onChange={(e) => setIsWeighted(e.target.checked)} />
              <span className="font-bold text-[#1a1a1a]">: مادة ميزانية؟</span>
            </label>

            {/* بادئة باركود الوزن */}
            {isWeighted && (
              <label className="text-sm flex items-center justify-end gap-2">
                <input
                  className="flex-1 border border-[#808080] px-2 py-1 text-sm font-mono bg-white"
                  placeholder="21"
                  value={weightPrefix}
                  onChange={(e) => setWeightPrefix(e.target.value)}
                  dir="ltr"
                />
                <span className="font-bold text-[#1a1a1a] whitespace-nowrap">: بادئة باركود الوزن</span>
              </label>
            )}

            {/* الظهور بالقائمة الرئيسية */}
            <label className="text-sm flex items-center justify-end gap-2 col-span-2">
              <input type="checkbox" checked={showOnPos} onChange={(e) => setShowOnPos(e.target.checked)} />
              <span className="font-bold text-[#1a1a1a]">: الظهور بالقائمة الرئيسية؟</span>
            </label>
          </div>

          {/* نافذة إنشاء تصنيف جديد */}
          {newCategoryOpen && (
            <div className="border-2 border-[#808080] bg-[#f5f5f5] p-3 space-y-2">
              <label className="text-xs block">
                <span className="font-bold mb-1 block">اسم التصنيف الجديد:</span>
                <input
                  ref={newCategoryInputRef}
                  className="w-full border border-[#808080] px-2 py-1 text-sm"
                  placeholder="مثال: منظفات"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={newCategoryShowOnPos}
                  onChange={(e) => setNewCategoryShowOnPos(e.target.checked)}
                />
                <span className="font-bold">إظهار في شاشة البيع</span>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={creatingCategory}
                  className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-3 py-1 text-xs font-bold text-black hover:from-[#b8ddf8] disabled:opacity-60"
                  onClick={() => void submitNewCategory()}
                >
                  {creatingCategory ? 'جاري…' : 'إنشاء'}
                </button>
                <button
                  type="button"
                  className="border border-[#555] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-3 py-1 text-xs font-bold hover:from-[#f5f5f5]"
                  disabled={creatingCategory}
                  onClick={() => {
                    setNewCategoryOpen(false)
                    setNewCategoryName('')
                    setCategoryId(categoryIdBeforeNewRef.current ?? '')
                    categoryIdBeforeNewRef.current = null
                  }}
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}

          {preview && <div className="text-xs text-slate-500">آخر باركود تم توليده: {preview}</div>}
          
          {/* قسم الباركودات البديلة (المواد البديلة) */}
          <div ref={barcodesRef} className="border-2 border-[#808080] bg-white p-3 space-y-2 scroll-mt-4">
            <div className="flex items-center justify-between border-b-2 border-[#808080] pb-2">
              <div className="font-bold text-[#1a1a1a]">المواد البديلة (أنواع المنتج)</div>
              <button
                type="button"
                className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-3 py-1 text-xs font-bold text-black hover:from-[#b8ddf8]"
                onClick={() => setBars((b) => [...b, { barcode: '', variantName: '', isDefault: b.length === 0 }])}
              >
                + إضافة نوع
              </button>
            </div>
            <div className="text-xs text-slate-600 bg-amber-50 border border-amber-300 p-2">
              <p className="font-bold mb-1">💡 ما هي المواد البديلة؟</p>
              <p>أنواع مختلفة من نفس المنتج بنفس السعر لكن بباركودات مختلفة.</p>
              <p className="mt-1"><strong>مثال:</strong> دخان ونستون - أحمر، أزرق، سلفر، ون - كلهم نفس المنتج لكن باركودات مختلفة.</p>
            </div>
            {bars.map((b, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-[#f5f5f5] p-2 border border-[#c0c0c0]">
                <div className="col-span-5">
                  <label className="text-xs block mb-1 font-bold">الباركود:</label>
                  <input
                    className="w-full border border-[#808080] px-2 py-1 text-sm font-mono bg-white"
                    value={b.barcode}
                    onChange={(e) =>
                      setBars((rows) => rows.map((r, i) => (i === idx ? { ...r, barcode: e.target.value } : r)))
                    }
                    placeholder="أدخل الباركود"
                  />
                </div>
                <div className="col-span-5">
                  <label className="text-xs block mb-1 font-bold">اسم النوع (أحمر، أزرق...):</label>
                  <input
                    className="w-full border border-[#808080] px-2 py-1 text-sm bg-white"
                    value={b.variantName}
                    onChange={(e) =>
                      setBars((rows) => rows.map((r, i) => (i === idx ? { ...r, variantName: e.target.value } : r)))
                    }
                    placeholder="اسم النوع"
                  />
                </div>
                <div className="col-span-1 text-center">
                  <label className="text-xs block mb-1 font-bold">افتراضي:</label>
                  <input
                    type="radio"
                    name={defRadioName}
                    checked={b.isDefault}
                    onChange={() => setBars((rows) => rows.map((r, i) => ({ ...r, isDefault: i === idx })))}
                    className="h-4 w-4"
                  />
                </div>
                <div className="col-span-1 text-center">
                  <label className="text-xs block mb-1 font-bold">&nbsp;</label>
                  <button
                    type="button"
                    className="border border-[#8b0000] bg-gradient-to-b from-[#ffb3b3] to-[#ff4444] px-2 py-1 text-xs font-bold text-black hover:from-[#ffc0c0]"
                    onClick={() => setBars((rows) => rows.filter((_, i) => i !== idx))}
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))}
            {!bars.length && (
              <div className="text-xs text-slate-500 text-center py-3">
                لا توجد أنواع مضافة. اضغط "+ إضافة نوع" لإضافة باركودات لأنواع مختلفة من هذا المنتج.
              </div>
            )}
          </div>
        </div>

        {/* الأزرار الجانبية */}
        <div className="flex flex-col gap-2 w-32">
          <button
            type="button"
            className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-3 py-2 text-xs font-bold text-black hover:from-[#b8ddf8]"
            onClick={() => {
              setNewCategoryOpen(!newCategoryOpen)
            }}
          >
            التصنيفات
          </button>
          <button
            type="button"
            className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-3 py-2 text-xs font-bold text-black hover:from-[#b8ddf8]"
            onClick={() => {
              window.location.hash = '#/suppliers'
            }}
          >
            الموردين
          </button>
          <button
            type="button"
            className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-3 py-2 text-xs font-bold text-black hover:from-[#b8ddf8]"
            onClick={() => {
              window.location.hash = '#/inventory/products'
            }}
          >
            عرض المواد
          </button>
          <button
            type="button"
            className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-3 py-2 text-xs font-bold text-black hover:from-[#b8ddf8]"
            onClick={() => {
              barcodesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          >
            المواد البديلة
          </button>
          <button
            type="button"
            className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-3 py-2 text-xs font-bold text-black hover:from-[#b8ddf8]"
            onClick={() => setPackagingOpen(true)}
          >
            الوحدات الكبرى
          </button>
          <button
            type="button"
            className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-3 py-2 text-xs font-bold text-black hover:from-[#b8ddf8]"
            onClick={() => setOffersOpen(true)}
          >
            العروض
          </button>
        </div>
      </div>

      {/* منطقة الحفظ */}
      <div className="mt-3 space-y-2">
        {err && (
          <div className="border border-[#8b0000] bg-[#ffe0e0] px-3 py-2 text-sm text-[#8b0000] font-bold">
            {err}
          </div>
        )}
        {beforeSaveActions}
        <button
          type="button"
          className="w-32 border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-4 py-2 text-sm font-bold text-black hover:from-[#b8ddf8] shadow"
          onClick={() => void save()}
        >
          حفظ
        </button>
      </div>

      {/* نافذة الوحدات الكبرى */}
      {packagingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPackagingOpen(false)}>
          <div className="w-full max-w-3xl border-2 border-[#808080] bg-[#d0d0d0] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2">
              <h2 className="text-base font-black text-[#1a1a1a]">الوحدات الكبرى - {name || 'منتج جديد'}</h2>
            </div>
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="text-sm text-slate-700 bg-blue-50 border border-blue-300 p-3 rounded">
                <p className="font-bold mb-1">💡 ما هي الوحدات الكبرى؟</p>
                <p>مثال: علبة بسكوت تحتوي على 12 باكيت. العلبة هي "وحدة كبرى" لها باركود خاص وسعر خاص.</p>
                <p className="mt-1">عند بيع علبة واحدة، يتم خصم 12 باكيت من المخزون تلقائياً.</p>
              </div>

              <div className="border border-[#808080] bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d8d8d8]">
                      <th className="border-l border-[#c0c0c0] px-2 py-2 text-right font-black">اسم الوحدة</th>
                      <th className="border-l border-[#c0c0c0] px-2 py-2 text-right font-black">الكمية (عدد القطع)</th>
                      <th className="border-l border-[#c0c0c0] px-2 py-2 text-right font-black">الباركود</th>
                      <th className="border-l border-[#c0c0c0] px-2 py-2 text-right font-black">سعر البيع</th>
                      <th className="px-2 py-2 text-center font-black">حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packagingUnits.map((unit, idx) => (
                      <tr key={idx} className="border-b border-[#e0e0e0]">
                        <td className="border-l border-[#e0e0e0] px-2 py-2">
                          <input
                            className="w-full border border-[#808080] px-2 py-1 text-sm"
                            value={unit.name}
                            onChange={(e) => {
                              const updated = [...packagingUnits]
                              updated[idx].name = e.target.value
                              setPackagingUnits(updated)
                            }}
                            placeholder="مثال: علبة، كرتون"
                          />
                        </td>
                        <td className="border-l border-[#e0e0e0] px-2 py-2">
                          <input
                            type="number"
                            className="w-full border border-[#808080] px-2 py-1 text-sm font-mono"
                            value={unit.quantity}
                            onChange={(e) => {
                              const updated = [...packagingUnits]
                              updated[idx].quantity = Number(e.target.value)
                              setPackagingUnits(updated)
                            }}
                            placeholder="12"
                          />
                        </td>
                        <td className="border-l border-[#e0e0e0] px-2 py-2">
                          <input
                            className="w-full border border-[#808080] px-2 py-1 text-sm font-mono"
                            value={unit.barcode}
                            onChange={(e) => {
                              const updated = [...packagingUnits]
                              updated[idx].barcode = e.target.value
                              setPackagingUnits(updated)
                            }}
                            placeholder="الباركود"
                          />
                        </td>
                        <td className="border-l border-[#e0e0e0] px-2 py-2">
                          <input
                            type="number"
                            step="0.01"
                            className="w-full border border-[#808080] px-2 py-1 text-sm font-mono"
                            value={unit.salePrice}
                            onChange={(e) => {
                              const updated = [...packagingUnits]
                              updated[idx].salePrice = Number(e.target.value)
                              setPackagingUnits(updated)
                            }}
                            placeholder="السعر"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            className="border border-[#8b0000] bg-gradient-to-b from-[#ffb3b3] to-[#ff4444] px-2 py-1 text-xs font-bold text-black hover:from-[#ffc0c0]"
                            onClick={() => setPackagingUnits(packagingUnits.filter((_, i) => i !== idx))}
                          >
                            حذف
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                className="w-full border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-4 py-2 text-sm font-bold text-black hover:from-[#b8ddf8]"
                onClick={() => setPackagingUnits([...packagingUnits, { name: '', quantity: 1, barcode: '', salePrice: 0 }])}
              >
                + إضافة وحدة كبرى
              </button>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPackagingOpen(false)}
                  className="border border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-4 py-2 text-sm font-bold hover:from-[#f5f5f5]"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نافذة العروض */}
      {offersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOffersOpen(false)}>
          <div className="w-full max-w-3xl border-2 border-[#808080] bg-[#d0d0d0] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0] px-3 py-2">
              <h2 className="text-base font-black text-[#1a1a1a]">العروض الترويجية - {name || 'منتج جديد'}</h2>
            </div>
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="text-sm text-slate-700 bg-green-50 border border-green-300 p-3 rounded">
                <p className="font-bold mb-1">💡 ما هي العروض؟</p>
                <p>عروض خاصة على المنتج مثل: "خصم 20%" أو "اشترِ 2 واحصل على الثالث مجاناً"</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-bold mb-1 block">نوع العرض:</label>
                  <select
                    className="w-full border border-[#808080] px-2 py-1.5 text-sm bg-white"
                    value={offerType}
                    onChange={(e) => setOfferType(e.target.value as any)}
                  >
                    <option value="discount">خصم بالنسبة المئوية %</option>
                    <option value="fixed">خصم بقيمة ثابتة</option>
                    <option value="bogo">اشترِ X احصل على Y مجاناً</option>
                    <option value="bundle">عرض حزمة (Bundle)</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-bold mb-1 block">
                    {offerType === 'discount' ? 'نسبة الخصم %:' : 
                     offerType === 'fixed' ? 'قيمة الخصم:' :
                     offerType === 'bogo' ? 'اشتري (عدد):' : 'عدد المنتجات:'}
                  </label>
                  <input
                    type="number"
                    step={offerType === 'discount' ? '1' : '0.01'}
                    className="w-full border border-[#808080] px-2 py-1.5 text-sm font-mono bg-white"
                    value={offerValue}
                    onChange={(e) => setOfferValue(e.target.value)}
                    placeholder={offerType === 'discount' ? '20' : offerType === 'bogo' ? '2' : '10.00'}
                  />
                </div>

                <div>
                  <label className="text-sm font-bold mb-1 block">تاريخ البداية:</label>
                  <input
                    type="date"
                    className="w-full border border-[#808080] px-2 py-1.5 text-sm font-mono bg-white"
                    value={offerStartDate}
                    onChange={(e) => setOfferStartDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-bold mb-1 block">تاريخ النهاية:</label>
                  <input
                    type="date"
                    className="w-full border border-[#808080] px-2 py-1.5 text-sm font-mono bg-white"
                    value={offerEndDate}
                    onChange={(e) => setOfferEndDate(e.target.value)}
                  />
                </div>
              </div>

              {offerType === 'discount' && offerValue && (
                <div className="bg-blue-50 border border-blue-300 p-3 rounded text-sm">
                  <strong>معاينة العرض:</strong> خصم {offerValue}% على {name || 'هذا المنتج'}
                  {offerStartDate && offerEndDate && (
                    <span className="block mt-1 text-xs">
                      من {offerStartDate} حتى {offerEndDate}
                    </span>
                  )}
                </div>
              )}

              {offerType === 'fixed' && offerValue && (
                <div className="bg-blue-50 border border-blue-300 p-3 rounded text-sm">
                  <strong>معاينة العرض:</strong> خصم {offerValue} دينار على {name || 'هذا المنتج'}
                  {offerStartDate && offerEndDate && (
                    <span className="block mt-1 text-xs">
                      من {offerStartDate} حتى {offerEndDate}
                    </span>
                  )}
                </div>
              )}

              {offerType === 'bogo' && offerValue && (
                <div className="bg-blue-50 border border-blue-300 p-3 rounded text-sm">
                  <strong>معاينة العرض:</strong> اشترِ {offerValue} واحصل على 1 مجاناً
                  {offerStartDate && offerEndDate && (
                    <span className="block mt-1 text-xs">
                      من {offerStartDate} حتى {offerEndDate}
                    </span>
                  )}
                </div>
              )}

              {/* العروض الحالية */}
              {currentPromotions.length > 0 && (
                <div className="border border-slate-300 rounded p-3">
                  <h3 className="font-bold text-sm mb-2">العروض الحالية:</h3>
                  <div className="space-y-2">
                    {currentPromotions.map((promo) => (
                      <div key={promo.id} className="flex items-center justify-between bg-white border border-slate-200 p-2 rounded text-sm">
                        <div className="flex-1">
                          <div className="font-bold">
                            {promo.type === 'discount' && `خصم ${promo.value}%`}
                            {promo.type === 'fixed' && `خصم ${promo.value} دينار`}
                            {promo.type === 'bogo' && `اشتري ${promo.value} احصل على ${promo.freeQty} مجاناً`}
                            {promo.type === 'bundle' && `حزمة ${promo.value} منتج`}
                          </div>
                          {promo.startDate && promo.endDate && (
                            <div className="text-xs text-slate-500">
                              من {new Date(promo.startDate).toLocaleDateString('ar')} حتى {new Date(promo.endDate).toLocaleDateString('ar')}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => void togglePromotion(promo.id)}
                            className={`px-2 py-1 text-xs font-bold border ${promo.isActive ? 'bg-green-100 border-green-400 text-green-700' : 'bg-gray-100 border-gray-400 text-gray-700'}`}
                          >
                            {promo.isActive ? 'نشط' : 'متوقف'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deletePromotion(promo.id)}
                            className="px-2 py-1 text-xs font-bold bg-red-100 border border-red-400 text-red-700 hover:bg-red-200"
                          >
                            حذف
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!initial?.id && (
                <div className="text-center py-4 text-amber-600 bg-amber-50 border border-amber-300 rounded">
                  <p className="font-bold">💡 ملاحظة:</p>
                  <p className="text-sm mt-1">احفظ المنتج أولاً لتتمكن من إضافة عروض ترويجية</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOffersOpen(false)}
                  className="border border-[#808080] bg-gradient-to-b from-[#f0f0f0] to-[#d0d0d0] px-4 py-2 text-sm font-bold hover:from-[#f5f5f5]"
                >
                  إغلاق
                </button>
                {initial?.id && (
                  <button
                    type="button"
                    onClick={() => void savePromotion()}
                    disabled={savingPromotion}
                    className="border border-[#1a4480] bg-gradient-to-b from-[#a8d4fa] to-[#3d84c6] px-4 py-2 text-sm font-bold text-black hover:from-[#b8ddf8] disabled:opacity-50"
                  >
                    {savingPromotion ? 'جاري الحفظ...' : 'حفظ العرض'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </EnterpriseModalFrame>
  )
}
