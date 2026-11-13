/** One product on a poster. A post holds 1 to 3 of them (the sheet's Item 1 to 3 columns). */
export type PostItem = {
  category: string
  name: string
  /** A photo link that overrides the automatic search (sheet: Manual photo N). */
  manualPhoto: string
  /** Ask the engine to try the next search result (sheet: Next photo N). */
  nextPhoto: boolean
}

/** What the person decided about a finished poster (sheet: Feedback). */
export type Feedback = '' | 'Done' | 'Redo' | 'Redo next image' | 'ignore'

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
}

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
