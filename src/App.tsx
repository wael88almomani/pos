import { useEffect } from 'react'
import { useThemeStore } from './core/stores/theme-store'
import { AppRouter } from './router/AppRouter'
import { ShortcutProvider } from './core/shortcuts/ShortcutProvider'
import { AppErrorBoundary } from './core/AppErrorBoundary'
import { ToastHost } from './core/ToastHost'
import { SessionLock } from './core/SessionLock'

export default function App() {
  const initTheme = useThemeStore((s) => s.init)

  useEffect(() => {
    initTheme()
    document.documentElement.lang = 'ar'
    document.documentElement.dir = 'rtl'
  }, [initTheme])

  return (
    <AppErrorBoundary>
      <ShortcutProvider>
        <AppRouter />
        <ToastHost />
        <SessionLock />
      </ShortcutProvider>
    </AppErrorBoundary>
  )
}
