import { useEffect, useState } from 'react'

/** True when the window is wide enough for the desktop dashboard (sidebar and multi-column pages). */
export function useDesktop(query = '(min-width: 1024px)') {
  const [wide, setWide] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const on = () => setWide(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return wide
}
