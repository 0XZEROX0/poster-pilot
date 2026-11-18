import { useMemo, useState } from 'react'
import { formatPrice } from '../data/logic'
import type { Product } from '../data/types'
import { t } from '../i18n'

/**
 * Search the price list and pick one product. A name that is not in the list can be added as typed.
 * Used by New offer and by the offer editor (change, add).
 */
export function ProductSearch({ products, skip = [], onPick, autoFocus, placeholder }: {
  products: Product[]
  /** Names already on the post, left out of the results. */
  skip?: string[]
  onPick: (p: Product) => void
  autoFocus?: boolean
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    const taken = new Set(skip.map((s) => s.trim().toLowerCase()))
    return products.filter((p) => words.every((w) => `${p.category} ${p.name} ${p.company}`.toLowerCase().includes(w)) && !taken.has(p.name.trim().toLowerCase())).slice(0, 8)
  }, [query, products, skip])
  const pick = (p: Product) => { onPick(p); setQuery('') }
  return (
    <>
      <input type="search" placeholder={placeholder ?? t('Search products…')} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus={autoFocus} />
      {query.trim() && (
        <div className="results">
          {matches.map((p) => (
            <button type="button" key={`${p.category}${p.name}`} onClick={() => pick(p)}>
              <span dir="auto">{p.name}</span>
              <span className="muted small">{p.category} · {formatPrice(p.price)} EGP</span>
            </button>
          ))}
          {!matches.length && (
            <button type="button" onClick={() => pick({ category: '', name: query.trim(), price: '', company: '' })}>
              <span className="muted small">{t('No product matches. Add it as typed:')}</span>
              <span dir="auto">{query.trim()}</span>
            </button>
          )}
        </div>
      )}
    </>
  )
}
