import type { CaptionTemplate, Data, LogEntry, NewPost, Post } from './types'

/** Where the app's data lives. The screens only use this, so the store behind it can change. */
export interface Backend {
  /** Calls back with the whole data set now and after every change. Returns the function that stops it. */
  subscribe(onData: (data: Data) => void, onError: (message: string) => void): () => void
  addPost(post: NewPost): Promise<void>
  updatePost(id: string, patch: Partial<Post>): Promise<void>
  removePost(id: string): Promise<void>
  saveTemplates(templates: CaptionTemplate[]): Promise<void>
  /** The history of one post, now and after every new entry, while the caller listens. */
  watchLog(postId: string, onLog: (entries: LogEntry[]) => void, onError: (message: string) => void): () => void
  /** The last entry of every post that is gone (deleted in the app or removed from the sheet). */
  deletedLog(): Promise<LogEntry[]>
}
