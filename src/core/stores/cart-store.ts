import { create } from 'zustand'

export type CartLine = {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  discount: number
  promotionId?: string
  promotionType?: string
}

type CartState = {
  lines: CartLine[]
  cartDiscount: number
  addProduct: (p: {
    id: string
    name: string
    salePrice: number
    quantityAvailable: number
    promotion?: {
      id: string
      type: string
      value: number
      freeQty?: number
    }
  }) => void
  setQty: (productId: string, qty: number) => void
  incQty: (productId: string, delta: number) => void
  removeLine: (productId: string) => void
  setCartDiscount: (v: number) => void
  clear: () => void
  replaceCart: (lines: CartLine[], cartDiscount: number) => void
  subtotal: () => number
  total: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  cartDiscount: 0,
  addProduct: (p) => {
    set((s) => {
      const existing = s.lines.find((l) => l.productId === p.id)
      
      // حساب الخصم من العرض
      let lineDiscount = 0
      let promotionId: string | undefined
      let promotionType: string | undefined
      
      if (p.promotion) {
        promotionId = p.promotion.id
        promotionType = p.promotion.type
        
        if (p.promotion.type === 'discount') {
          // خصم بالنسبة المئوية
          lineDiscount = (p.salePrice * p.promotion.value) / 100
        } else if (p.promotion.type === 'fixed') {
          // خصم بقيمة ثابتة
          lineDiscount = p.promotion.value
        }
        // BOGO و Bundle سيتم تطبيقهما لاحقاً بمنطق أكثر تعقيداً
      }
      
      if (existing) {
        return {
          lines: s.lines.map((l) =>
            l.productId === p.id 
              ? { 
                  ...l, 
                  quantity: existing.quantity + 1,
                  discount: lineDiscount * (existing.quantity + 1) 
                } 
              : l
          )
        }
      }
      return {
        lines: [
          ...s.lines,
          {
            productId: p.id,
            name: p.name,
            quantity: 1,
            unitPrice: p.salePrice,
            discount: lineDiscount,
            promotionId,
            promotionType
          }
        ]
      }
    })
  },
  setQty: (productId, qty) => {
    set((s) => ({
      lines: s.lines
        .map((l) => (l.productId === productId ? { ...l, quantity: Math.max(0, qty) } : l))
        .filter((l) => l.quantity > 0)
    }))
  },
  incQty: (productId, delta) => {
    const line = get().lines.find((l) => l.productId === productId)
    if (!line) return
    get().setQty(productId, line.quantity + delta)
  },
  removeLine: (productId) => {
    set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) }))
  },
  setCartDiscount: (v) => set({ cartDiscount: Math.max(0, v) }),
  clear: () => set({ lines: [], cartDiscount: 0 }),
  replaceCart: (lines, cartDiscount) => set({ lines, cartDiscount }),
  subtotal: () => {
    return get().lines.reduce((acc, l) => acc + l.unitPrice * l.quantity - l.discount, 0)
  },
  total: () => Math.max(0, get().subtotal() - get().cartDiscount)
}))
