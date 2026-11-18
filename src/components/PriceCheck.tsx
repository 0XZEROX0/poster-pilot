import { useState } from 'react'
import { postsMissingPrice } from '../data/logic'
import type { Data } from '../data/types'
import { t } from '../i18n'
import { PostRow } from './PostRow'
import { Icon } from './ui'

/**
 * Offers and posters that show no Price before (the price list could not price one of their items), so nobody finds out
 * from the poster. Shown on Home and above the offers. Opening one shows which item and the list product to use instead.
 */
export function MissingPrices({ data, onOpen, open: startOpen = false }: { data: Data; onOpen: (id: string) => void; open?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const list = postsMissingPrice(data.posts, data.products)
  if (!list.length) return null
  return (
    <section className="alert price-check" role="status">
      <b>
        <Icon name="fix" size={18} />
        {(list.length === 1 ? t('1 post has no Price before') : t('{n} posts have no Price before').replace('{n}', String(list.length)))}
        <button className="link price-check-toggle" onClick={() => setOpen(!open)}>{t(open ? 'Hide' : 'Show')}</button>
      </b>
      <p>{t('An item in it is not in the price list under that exact name, so the old price cannot show on the poster. Open it to pick the right product.')}</p>
      {open && <div className="list">{list.map((p) => <PostRow key={p.id} post={p} onOpen={onOpen} />)}</div>}
    </section>
  )
}
