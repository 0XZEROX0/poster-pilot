/** Where a post's story goes. */
export type StoryWhere = '' | 'fb' | 'ig' | 'fb+ig'

/** One product on a poster. A post holds 1 to 3 of them (the sheet's Item 1 to 3 columns), or up to 4 versions of one product. */
export type PostItem = {
  category: string
  name: string
  /** A photo link that overrides the automatic search (sheet: Manual photo N). */
  manualPhoto: string
  /** Ask the engine to try the next search result (sheet: Next photo N). */
  nextPhoto: boolean
  /** Set by the engine: this is the item whose photo could not be found. */
  photoMissing?: boolean
  /**
   * Versions of one product picked from the website photos: what tells this version apart ("Jungle Panda").
   * `name` stays the price list name, so the price check still finds it; the poster and caption show both.
   */
  label?: string
}

/** What the person decided about a finished poster (sheet: Feedback). */
export type Feedback = '' | 'Done' | 'Redo' | 'Redo next image' | 'ignore' | 'Cancel'

/** One row of the Posts sheet. Dates and times are Cairo local strings, as the engine writes them. */
export type Post = {
  id: string
  /** Position in the list, lowest first. */
  order: number
  items: PostItem[]
  /** The items are versions (colours, switches...) of one product: one name and one price on the poster, up to 4 items. */
  variants?: boolean
  /** With variants: the product name shown once on the poster and in the caption. */
  title?: string
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
  /** 'yes' after someone confirmed "Post now": the engine publishes it on Facebook and Instagram at once (not scheduled),
   * then empties it and sets Post date / Post time to the minute it went out. */
  postNow?: string
  /**
   * Also post this as a story: '' (no story), 'fb', 'ig' or 'fb+ig'. The engine makes a 1080x1920 story picture from
   * the poster and publishes it on its own when the post goes out (plus `storyDelay` minutes). Neither Facebook nor
   * Instagram can hold a story on a schedule, so the engine posts it at that minute.
   */
  story?: StoryWhere
  /** Minutes after the post that the story goes out, as text ('' or '0' = the same minute). */
  storyDelay?: string
  /** Engine only: link to the story picture in Drive, made from the poster. Empty until it is made. */
  storyImage?: string
  /** Engine only: '', 'Waiting', 'Posted', or an error text, for each place the story goes. */
  storyFbStatus?: string
  storyIgStatus?: string
  /** The story as designed in the story editor (layers, as JSON text), so it can be opened and changed again. App only. */
  storyDesign?: string
  /** Engine only: link to the story video in Drive, when the designed story moves (GIFs, moving stickers). */
  storyVideo?: string
  /** Engine only: when the designed story picture was saved. */
  storyDesignedAt?: string
  /** App only: the error text the person chose to ignore. The problem is hidden while the text stays the same. */
  ignoredProblem?: string
  /** App only: when the person last asked for a redo, so a retry that fails again can be told apart from one still running. */
  retriedAt?: number
  /** Engine only: competitor prices for this offer. */
  market?: Market
  /** App only: when someone pressed Check again. */
  marketAsk?: number
  /** App only: when someone asked for the website photos of the items. The engine removes it when it has answered. */
  photoAsk?: number
  /** Engine only: every photo the website has for each item, for the photo picker. */
  photoChoices?: PhotoChoices
}

/** One photo of a product on the website: the full photo and a small one for the picker. */
export type WebPhoto = { src: string; thumb: string; /** The website option this photo belongs to ("Jungle Panda"), when it is an option's own photo. */ label?: string }

/** Someone's request for the website photos of one product, to pick versions from in New offer (photoAsks/{uid}). */
export type VersionPhotos = { name: string; asked: number; answered: number; choice: PhotoChoiceItem | null }

/** What the engine found on the website for one item: the product it matched and all its photos. Empty when there is none. */
export type PhotoChoiceItem = {
  name: string
  product: string
  page: string
  photos: WebPhoto[]
  /** When the website has no product that is this exact item: the closest products, so a photo can still be chosen by eye. */
  near?: { product: string; page: string; photos: WebPhoto[] }[]
  error?: string
}

/** The website photos of a post's items, in the same order as its items. `asked` is the photoAsk it answers. */
export type PhotoChoices = { checkedAt: number; asked: number; items: PhotoChoiceItem[] }

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

/** Facebook numbers for one published post (any can be missing: Meta did not give it, or the token may not read it). */
export type FbResults = { reach?: number; views?: number; reactions?: number; comments?: number; shares?: number; clicks?: number }
/** Instagram numbers for one published post. */
export type IgResults = { reach?: number; views?: number; likes?: number; comments?: number; saved?: number; shares?: number; interactions?: number }
/** One post's numbers. `at` = when the engine last got them (ms). */
export type PostResults = { fb?: FbResults; ig?: IgResults; igLink?: string; at?: number }
/**
 * Written twice a day by the engine (workflow "Static OS - Post results") to status/results.
 * `need` lists what the Meta token may not read yet: 'fbIns' (Facebook reach), 'fbEng' (Facebook reactions,
 * comments, shares), 'igIns' (Instagram reach, saves, shares).
 */
export type Results = { at: number; need: string[]; posts: Record<string, PostResults> }

export type Data = {
  loaded: boolean
  posts: Post[]
  products: Product[]
  styles: string[]
  templates: CaptionTemplate[]
  health: Health | null
  /** Facebook and Instagram numbers of the published posts. Null until the engine has written them. */
  results: Results | null
}

export type NewPost = Pick<Post, 'items' | 'variants' | 'title' | 'company' | 'priceBefore' | 'priceAfter' | 'style' | 'details' | 'captionStyle' | 'postDate' | 'postTime' | 'story'>

export const emptyData: Data = { loaded: false, posts: [], products: [], styles: [], templates: [], health: null, results: null }

/** One field that changed in a log entry, as short text. */
export type LogChange = { f: string; from: string; to: string }

/**
 * One line of a post's history (Firestore `log/{id}`). Written by the app in the same step as the
 * change, or by the engine for what happened in the sheet and the workflows. Entries are never changed.
 * `by` is the person's id, or 'sheet' (someone typed in the Posts sheet) or 'system' (a workflow).
 */
export type LogEntry = { id: string; postId: string; at: number; by: string; byName: string; act: string; note?: string; changes?: LogChange[]; title?: string }
