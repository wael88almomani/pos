/** Pure ranking for product search (barcode, variant, name, shortName). */

export type ProductSearchRow = {
  id: string
  name: string
  shortName: string | null
  barcode: string | null
  variantBarcodes: string[]
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

/** Lower score = better match. */
export function rankProduct(query: string, p: ProductSearchRow): number | null {
  const q = norm(query)
  if (!q) return 1000

  const name = norm(p.name)
  const shortN = p.shortName ? norm(p.shortName) : ''
  const mainBar = p.barcode ? norm(p.barcode) : ''

  if (mainBar && mainBar === q) return 0
  for (const b of p.variantBarcodes) {
    const bn = norm(b)
    if (bn && bn === q) return 1
  }
  if (mainBar && mainBar.startsWith(q)) return 5
  for (const b of p.variantBarcodes) {
    const bn = norm(b)
    if (bn && bn.startsWith(q)) return 6
  }
  if (name.startsWith(q)) return 10
  if (shortN && shortN.startsWith(q)) return 11
  if (name.includes(q)) return 20
  if (shortN && shortN.includes(q)) return 21

  const qChars = [...q]
  let fuzzy = 0
  let idx = 0
  for (const ch of qChars) {
    const found = name.indexOf(ch, idx)
    if (found === -1) {
      fuzzy = 999
      break
    }
    idx = found + 1
    fuzzy += found - (idx - 1)
  }
  if (fuzzy < 999 && q.length >= 2) return 40 + fuzzy
  return null
}

export function sortProductsByQuery<T extends ProductSearchRow>(query: string, items: T[]): T[] {
  const scored = items
    .map((p) => ({ p, score: rankProduct(query, p) }))
    .filter((x): x is { p: T; score: number } => x.score !== null)
    .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name, 'ar'))
  return scored.map((x) => x.p)
}
