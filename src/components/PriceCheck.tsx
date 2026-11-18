import { useState } from 'react'
import { PRICE_IGNORE_PERMS, postsMissingPrice, priceKey } from '../data/logic'
import { allowed, backend } from '../data/store'
import type { Data, Post } from '../data/types'
import { t } from '../i18n'
import { PostRow } from './PostRow'
import { Icon, showToast } from './ui'

/** Whether this person may set a missing Price before aside. */
export const mayIgnorePrice = () => PRICE_IGNORE_PERMS.some((p) => allowed(p))

/**
 * "Ignore": the post is fine without a Price before. It leaves the warning until its products change, and "Show the
 * warning again" in the post brings it back.
 */
export const ignorePrice = (post: Post) =>
  backend.updatePost(post.id, { priceIgnored: priceKey(post) }).then(() => showToast(t('Ignored. Undo it from the post.')))
export const unignorePrice = (post: Post) =>
  backend.updatePost(post.id, { priceIgnored: '' }).then(() => showToast(t('The warning shows again')))

/**
 * Offers and posters that show no Price before (the price list could not price one of their items), so nobody finds out
 * from the poster. Shown on Home and above the offers. Opening one shows which item and the list product to use instead.
 */
export function MissingPrices({ data, onOpen, open: startOpen = false }: { data: Data; onOpen: (id: string) => void; open?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const list = postsMissingPrice(data.posts, data.products)
  if (!list.length) return null
  const mayIgnore = mayIgnorePrice()
  return (
    <section className="alert price-check" role="status">
      <b>
        <Icon name="fix" size={18} />
        {(list.length === 1 ? t('1 post has no Price before') : t('{n} posts have no Price before').replace('{n}', String(list.length)))}
        <button className="link price-check-toggle" onClick={() => setOpen(!open)}>{t(open ? 'Hide' : 'Show')}</button>
      </b>
      <p>{t('An item in it is not in the price list under that exact name, so the old price cannot show on the poster. Open it to pick the right product.')}</p>
      {open && (
        <div className="list">
          {list.map((p) => (
            <div key={p.id} className="price-check-row">
              <PostRow post={p} onOpen={onOpen} />
              {mayIgnore && <button className="btn btn-ghost btn-small" onClick={() => ignorePrice(p)} title={t('Fine without a Price before')}><Icon name="close" size={16} />{t('Ignore')}</button>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
