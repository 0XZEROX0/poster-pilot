/** One product on a poster. A post holds 1 to 3 of them (the sheet's Item 1 to 3 columns). */
export type PostItem = {
  category: string
  name: string
  /** A photo link that overrides the automatic search (sheet: Manual photo N). */
  manualPhoto: string
  /** Ask the engine to try the next search result (sheet: Next photo N). */
  nextPhoto: boolean
  /** Set by the engine: this is the item whose photo could not be found. */
  photoMissing?: boolean
}

/** What the person decided about a finished poster (sheet: Feedback). */
export type Feedback = '' | 'Done' | 'Redo' | 'Redo next image' | 'ignore' | 'Cancel'

/** One row of the Posts sheet. Dates and times are Cairo local strings, as the engine writes them. */
export type Post = {
  id: string
  /** Position in the list, lowest first. */
  order: number
  items: PostItem[]
  company: string
  priceBefore: string
  priceAfter: string
  style: string
  details: string
  /** Link to the finished poster (sheet: Image link). Empty while it is being built. */
  posterUrl: string
  /** '' while building, 'OK', or an error text such as 'MISSING' or 'AI ERROR'. */
  photoStatus: string
  feedback: Feedback
  /** 'YYYY-MM-DD' and 'HH:mm' the person asked for. Empty means the next free slot. */
  postDate: string
  postTime: string
  /** 'YYYY-MM-DD HH:mm' once the engine has scheduled it. */
  scheduledFor: string
  caption: string
  captionStyle: string
  /** '', 'Scheduled', 'Published', or an error text. */
  fbStatus: string
  igStatus: string
  fbPostId: string
  createdAt: number
  /** The decision on the offer itself, before any poster is made (sheet: Offer approval). Missing on posts from before offers existed. */
  offer?: '' | 'Approved' | 'Rejected'
  /** App only: why the offer was sent back, and who decided. */
  offerNote?: string
  offerBy?: string
  /** App only: who made the post in the app. */
  createdBy?: string
  createdByName?: string
  /** True until the engine has written a post made in the app into the sheet. */
  appNew?: boolean
  /** App only: the error text the person chose to ignore. The problem is hidden while the text stays the same. */
  ignoredProblem?: string
  /** App only: when the person last asked for a redo, so a retry that fails again can be told apart from one still running. */
  retriedAt?: number
  /** Engine only: competitor prices for this offer. */
  market?: Market
  /** App only: when someone pressed Check again. */
  marketAsk?: number
}

/** One competitor listing the engine found for an item. */
export type MarketHit = { shop: string; price: number; inStock: boolean | null; title: string; url: string; note?: string }

/** What the engine found for one item of an offer: the cheapest same product, other shops, and look-alikes that are never counted. */
export type MarketItem = { name: string; best: MarketHit | null; others: MarketHit[]; similar: MarketHit[] }

/** Competitor prices for an offer, written by the engine only. `key` is the items and price it was checked for. */
export type Market = { checkedAt: number; key: string; items: MarketItem[]; shops: string[]; error?: string }

export type Product = { category: string; name: string; price: string; company: string }

export type CaptionTemplate = { name: string; text: string }

/** Written by the engine so the app can show that it is alive. */
export type Health = { lastSync: number; note: string }

export type Data = {
  loaded: boolean
  posts: Post[]
  products: Product[]
  styles: string[]
  templates: CaptionTemplate[]
  health: Health | null
}

export type NewPost = Pick<Post, 'items' | 'company' | 'priceBefore' | 'priceAfter' | 'style' | 'details' | 'captionStyle' | 'postDate' | 'postTime'>

export const emptyData: Data = { loaded: false, posts: [], products: [], styles: [], templates: [], health: null }

/** One field that changed in a log entry, as short text. */
export type LogChange = { f: string; from: string; to: string }

/**
 * One line of a post's history (Firestore `log/{id}`). Written by the app in the same step as the
 * change, or by the engine for what happened in the sheet and the workflows. Entries are never changed.
 * `by` is the person's id, or 'sheet' (someone typed in the Posts sheet) or 'system' (a workflow).
 */
export type LogEntry = { id: string; postId: string; at: number; by: string; byName: string; act: string; note?: string; changes?: LogChange[]; title?: string }
