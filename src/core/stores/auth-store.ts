import { create } from 'zustand'

export type AuthUser = {
  id: string
  username: string
  displayName: string
  /** اسم الدور للعرض (مثل «مدير») */
  role: string
  /** رمز الدور من قاعدة البيانات (مثل admin، cashier) */
  roleCode: string
  permissions: string[]
}

export type CashierSession = {
  id: string
  openedAt: string
  openingCash: number
  deviceId: string
}

type AuthState = {
  user: AuthUser | null
  session: CashierSession | null
  setUser: (u: AuthUser | null) => void
  setSession: (s: CashierSession | null) => void
  can: (code: string) => boolean
  /** يكفي امتلاك إحدى الصلاحيات (مثل users.edit أو users.manage) */
  canAny: (codes: string[]) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  setUser: (u) => set({ user: u }),
  setSession: (s) => set({ session: s }),
  can: (code) => {
    const p = get().user?.permissions ?? []
    return p.includes(code)
  },
  canAny: (codes) => {
    const p = get().user?.permissions ?? []
    return codes.some((c) => p.includes(c))
  }
}))
