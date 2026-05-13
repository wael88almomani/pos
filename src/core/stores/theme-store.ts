import { create } from 'zustand'

/** واجهة ثابتة بالوضع الفاتح — لا تبديل داكن في التطبيق */
export const useThemeStore = create<{ init: () => void }>(() => ({
  init: () => {
    document.documentElement.classList.remove('dark')
  }
}))
