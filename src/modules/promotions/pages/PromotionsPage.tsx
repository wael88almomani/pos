import { useCallback, useEffect, useState } from 'react'
import { Tag, Trash2, Power, PowerOff } from 'lucide-react'
import { format } from 'date-fns'
import { arSA } from 'date-fns/locale'
import { EnterpriseToolbar, enterprisePageRootClass } from '../../shared/EnterpriseToolbar'
import { useToastStore } from '../../../core/toast-store'

type Promotion = {
  id: string
  productId: string
  productName?: string
  type: string
  value: number
  freeQty: number
  startDate: string | null
  endDate: string | null
  isActive: boolean
  createdAt: string
}

export function PromotionsPage() {
  const toast = useToastStore((s) => s.push)
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [products, setProducts] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'expired'>('active')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // تحميل جميع المنتجات للحصول على الأسماء
      const productsResult = await window.posApi.products.list({})
      if (productsResult.ok && 'items' in productsResult) {
        const productMap = new Map()
        for (const p of productsResult.items as any[]) {
          productMap.set(p.id, p.name)
        }
        setProducts(productMap)

        // تحميل العروض لكل منتج
        const allPromotions: Promotion[] = []
        for (const p of productsResult.items as any[]) {
          const promoResult = await window.posApi.promotions.list(p.id)
          if (promoResult.ok && 'items' in promoResult) {
            for (const promo of promoResult.items as any[]) {
              allPromotions.push({
                ...promo,
                productName: p.name
              })
            }
          }
        }
        setPromotions(allPromotions)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function togglePromotion(id: string) {
    const result = await window.posApi.promotions.toggle(id)
    if (result.ok) {
      toast('تم تحديث حالة العرض', 'ok')
      void load()
    } else {
      toast('فشل تحديث حالة العرض', 'err')
    }
  }

  async function deletePromotion(id: string) {
    if (!confirm('هل تريد حذف هذا العرض؟')) return
    
    const result = await window.posApi.promotions.delete(id)
    if (result.ok) {
      toast('تم حذف العرض', 'ok')
      void load()
    } else {
      toast('فشل حذف العرض', 'err')
    }
  }

  const filteredPromotions = promotions.filter((promo) => {
    if (filter === 'active') return promo.isActive
    if (filter === 'expired') {
      if (!promo.endDate) return false
      return new Date(promo.endDate) < new Date()
    }
    return true
  })

  const getPromotionLabel = (promo: Promotion) => {
    if (promo.type === 'discount') return `خصم ${promo.value}%`
    if (promo.type === 'fixed') return `خصم ${promo.value} دينار`
    if (promo.type === 'bogo') return `اشتري ${promo.value} احصل على ${promo.freeQty} مجاناً`
    if (promo.type === 'bundle') return `حزمة ${promo.value} منتج`
    return promo.type
  }

  return (
    <div className={enterprisePageRootClass}>
      <EnterpriseToolbar title="إدارة العروض الترويجية" icon={Tag} />

      <div className="flex-1 overflow-auto p-6 bg-[#d0d0d0]">
        {/* الفلاتر */}
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 text-sm font-bold border ${
              filter === 'all'
                ? 'bg-blue-100 border-blue-400'
                : 'bg-white border-slate-300'
            }`}
          >
            الكل ({promotions.length})
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-4 py-2 text-sm font-bold border ${
              filter === 'active'
                ? 'bg-green-100 border-green-400'
                : 'bg-white border-slate-300'
            }`}
          >
            النشطة ({promotions.filter((p) => p.isActive).length})
          </button>
          <button
            onClick={() => setFilter('expired')}
            className={`px-4 py-2 text-sm font-bold border ${
              filter === 'expired'
                ? 'bg-red-100 border-red-400'
                : 'bg-white border-slate-300'
            }`}
          >
            المنتهية
          </button>
        </div>

        {loading && (
          <div className="text-center py-8">
            <div className="text-2xl mb-2">⏳</div>
            <div className="font-bold">جاري التحميل...</div>
          </div>
        )}

        {!loading && filteredPromotions.length === 0 && (
          <div className="text-center py-12 bg-white border-2 border-[#808080] rounded">
            <Tag className="mx-auto h-12 w-12 text-slate-400 mb-3" />
            <p className="text-lg font-bold text-slate-600">لا توجد عروض</p>
            <p className="text-sm text-slate-500 mt-1">
              يمكنك إضافة عروض من صفحة تعديل المنتج
            </p>
          </div>
        )}

        <div className="space-y-3">
          {filteredPromotions.map((promo) => (
            <div
              key={promo.id}
              className="bg-white border-2 border-[#808080] p-4 rounded shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-bold text-lg">{promo.productName}</h3>
                    <span
                      className={`px-2 py-0.5 text-xs font-bold rounded ${
                        promo.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {promo.isActive ? '🟢 نشط' : '⚫ متوقف'}
                    </span>
                  </div>
                  
                  <div className="text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">العرض:</span>
                      <span className="text-blue-600 font-bold">
                        {getPromotionLabel(promo)}
                      </span>
                    </div>
                    
                    {promo.startDate && promo.endDate && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <span className="font-bold">الفترة:</span>
                        <span>
                          من {format(new Date(promo.startDate), 'd MMM yyyy', { locale: arSA })}
                          {' حتى '}
                          {format(new Date(promo.endDate), 'd MMM yyyy', { locale: arSA })}
                        </span>
                        {new Date(promo.endDate) < new Date() && (
                          <span className="text-red-600 font-bold">(منتهي)</span>
                        )}
                      </div>
                    )}
                    
                    <div className="text-xs text-slate-500">
                      تاريخ الإنشاء: {format(new Date(promo.createdAt), 'd MMM yyyy HH:mm', { locale: arSA })}
                    </div>
                  </div>
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => void togglePromotion(promo.id)}
                    className={`p-2 border-2 ${
                      promo.isActive
                        ? 'bg-yellow-100 border-yellow-400 hover:bg-yellow-200'
                        : 'bg-green-100 border-green-400 hover:bg-green-200'
                    }`}
                    title={promo.isActive ? 'إيقاف' : 'تفعيل'}
                  >
                    {promo.isActive ? (
                      <PowerOff className="h-4 w-4" />
                    ) : (
                      <Power className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => void deletePromotion(promo.id)}
                    className="p-2 bg-red-100 border-2 border-red-400 hover:bg-red-200"
                    title="حذف"
                  >
                    <Trash2 className="h-4 w-4 text-red-700" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
