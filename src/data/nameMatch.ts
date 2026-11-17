// Finding the price list product an order line most likely is, by its name. Order lines come from the website
// (its own product names), the old sales sheet (typed by hand) or the app; the price list often names the same
// product a little differently ("Lenovo Legion R24e 23.8-inch IPS FHD 180Hz" vs "Lenovo Legion R24e 24\" 180Hz").

/** A name in a plain form, for comparing and as a key: lower case, signs and extra spaces gone. */
export function plainName(s: string): string {
  return s.toLowerCase()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9؀-ۿ.+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

// Words that say little about which product it is.
const WEAK = new Set(['the', 'and', 'with', 'for', 'of', 'gaming', 'edition', 'black', 'white', 'inch', 'desktop', 'processor', 'pc', 'case', 'monitor', 'keyboard', 'mouse', 'fan', 'fans', 'cooler', 'argb', 'rgb', 'a', 'plus', 'oc'])
const words = (s: string) => plainName(s).split(' ').map((w) => w.replace(/^\.+|\.+$/g, '')).filter((w) => w.length > 1 || /\d/.test(w))
const weight = (w: string) => (/\d/.test(w) ? 3 : WEAK.has(w) ? 0.4 : 1)

/** How alike two names are, 0 to 1. Words with numbers (model numbers, sizes) count the most. */
export function nameScore(a: string, b: string): number {
  const A = new Set(words(a)), B = new Set(words(b))
  if (!A.size || !B.size) return 0
  let common = 0, wa = 0, wb = 0
  for (const w of A) { wa += weight(w); if (B.has(w)) common += weight(w) }
  for (const w of B) wb += weight(w)
  // A model number glued differently ("b850m" vs "b850m-k" -> "b850m k") still counts half.
  for (const w of A) if (!B.has(w) && /\d/.test(w) && w.length >= 4) for (const v of B) if (v !== w && /\d/.test(v) && (v.startsWith(w) || w.startsWith(v))) { common += weight(w) / 2; break }
  return Math.min(1, (2 * common) / (wa + wb))
}

/** The products most like a name, best first, only those alike enough. */
export function bestMatches<T extends { name: string }>(name: string, list: T[], max = 3, min = 0.35): { item: T; score: number }[] {
  return list
    .map((item) => ({ item, score: nameScore(name, item.name) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
}
