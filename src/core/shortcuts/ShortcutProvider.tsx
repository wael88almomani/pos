import { useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth-store'

type Binding = { actionId: string; keys: string }

function normalize(ev: KeyboardEvent): string {
  const parts: string[] = []
  if (ev.ctrlKey || ev.metaKey) parts.push('Control')
  if (ev.altKey) parts.push('Alt')
  if (ev.shiftKey) parts.push('Shift')
  const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key
  if (!['Control', 'Alt', 'Shift'].includes(ev.key)) {
    parts.push(key)
  }
  return parts.join('+')
}

function parseStored(keys: string): string {
  return keys
    .split('+')
    .map((p) => p.trim())
    .map((p) => (p.toLowerCase() === 'ctrl' ? 'Control' : p))
    .join('+')
}

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const bindingsRef = useRef<Binding[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await window.posApi.shortcuts.list()
      if (!cancelled && res.ok && 'items' in res) {
        bindingsRef.current = res.items as Binding[]
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const routeMap = useMemo(
    () =>
      ({
        'nav.pos': '/pos',
        'nav.invoices': '/pos',
        'nav.returns': '/returns',
        'search.product': '/pos',
        'sale.complete': '/pos',
        'pos.held_open': '/pos',
        'hardware.drawer': '/pos'
      }) as Record<string, string>,
    []
  )

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!user) return
      const tag = (ev.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || (ev.target as HTMLElement).isContentEditable) {
        const fk = /^F([1-9]|1[0-2])$/i.test(ev.key)
        const homeNav = /^home$/i.test(ev.key) || ev.code === 'Home'
        if (!fk && !homeNav) {
          return
        }
      }
      const pressed = normalize(ev).toLowerCase()
      const hit = bindingsRef.current.find((b) => parseStored(b.keys).toLowerCase() === pressed)
      if (!hit) return
      ev.preventDefault()
      /** على شاشة البيع: نفس اختصار «المنتجات» يفتح نافذة البحث السريع بدل مغادرة البيع. */
      if (hit.actionId === 'nav.products') {
        const onPos = location.pathname === '/pos'
        if (!onPos) navigate('/pos')
        const delay = onPos ? 0 : 140
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('pos-shortcut', { detail: 'nav.products' }))
        }, delay)
        return
      }
      const path = routeMap[hit.actionId]
      if (path) navigate(path)
      window.dispatchEvent(new CustomEvent('pos-shortcut', { detail: hit.actionId }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, routeMap, user, location.pathname])

  return <>{children}</>
}
