import type { CaptionTemplate, Data, NewPost, Post } from './types'

/** Where the app's data lives. The screens only use this, so the store behind it can change. */
export interface Backend {
  /** Calls back with the whole data set now and after every change. Returns the function that stops it. */
  subscribe(onData: (data: Data) => void, onError: (message: string) => void): () => void
  addPost(post: NewPost): Promise<void>
  updatePost(id: string, patch: Partial<Post>): Promise<void>
  removePost(id: string): Promise<void>
  saveTemplates(templates: CaptionTemplate[]): Promise<void>
}
