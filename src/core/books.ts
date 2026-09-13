import type { UserBook } from '../types'

export interface BookInfo {
  id: string
  name: string
  grade: string
  source: string
  wordCount: number
  unitCount: number
  /** 用户自己导入的词库。true 时不能去 fetch data/<id>.json，只能从本地库读 */
  custom?: boolean
}

/**
 * 内置词书目录。
 *
 * 由 scripts/parse_vocab.py 从 data/books.json 生成 —— 要加内置单词包，
 * 把新词表放进源目录、在脚本的 BOOKS 里加一项、重跑 `npm run vocab` 即可。
 * 用户自己在家长页导入的词库走另一条路（存 IndexedDB），见 mergeCatalog。
 */
export async function loadCatalog(): Promise<BookInfo[]> {
  const res = await fetch('./data/books.json')
  if (!res.ok) throw new Error('词书目录加载失败')
  return (await res.json()) as BookInfo[]
}

/** 内置词书 + 用户导入的词书，合并成首页看到的一张列表 */
export function mergeCatalog(
  builtin: BookInfo[],
  userBooks: UserBook[],
): BookInfo[] {
  const custom = userBooks.map<BookInfo>((b) => ({
    id: b.id,
    name: b.name,
    grade: b.grade,
    source: b.source,
    wordCount: b.wordCount,
    unitCount: b.units.length || 1,
    custom: true,
  }))
  return [...builtin, ...custom]
}

export function isCustomBook(catalog: BookInfo[], id: string): boolean {
  return catalog.find((b) => b.id === id)?.custom === true
}
