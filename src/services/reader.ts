// ============================================
// 阅读器 API
// ============================================

import { invoke } from '@tauri-apps/api/core'

export const reader = {
  importTxt: (name: string, content: string): Promise<any> =>
    invoke('import_txt', { name, content }),

  getLocalBookChapters: (bookId: string): Promise<any[]> =>
    invoke('get_local_book_chapters', { bookId }),

  getLocalChapterContent: (bookId: string, chapterId: number): Promise<string> =>
    invoke('get_local_chapter_content', { bookId, chapterId }),
}
