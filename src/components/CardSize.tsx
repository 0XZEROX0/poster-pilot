import { useState } from 'react'
import { t } from '../i18n'
import { Icon } from './ui'

const KEY = 'posterpilot.cards'
const SIZES = ['s', 'm', 'l'] as const
type Size = (typeof SIZES)[number]

function saved(): Size {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 's' || v === 'l') return v
  } catch {
    // No storage: the usual size.
  }
  return 'm'
}
const apply = (size: Size) => { document.documentElement.dataset.cards = size }
apply(saved())

/** Makes the cards on every page smaller or bigger. The choice is kept on this device. */
export function CardSize() {
  const [size, setSize] = useState<Size>(saved)
  const step = (n: number) => {
    const next = SIZES[Math.max(0, Math.min(SIZES.length - 1, SIZES.indexOf(size) + n))]
    setSize(next)
    apply(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // No storage: the choice lasts for this visit.
    }
  }
  return (
    <div className="size" role="group" aria-label={t('Card size')}>
      <button className="icon-btn" disabled={size === 's'} onClick={() => step(-1)} aria-label={t('Smaller cards')}><Icon name="minus" size={18} /></button>
      <Icon name="cards" size={18} />
      <button className="icon-btn" disabled={size === 'l'} onClick={() => step(1)} aria-label={t('Bigger cards')}><Icon name="plus" size={18} /></button>
    </div>
  )
}
