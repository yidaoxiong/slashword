import type { Lang, UserBook } from '../types'
import { langOf } from './lang'

export interface BookInfo {
  id: string
  name: string
  grade: string
  source: string
  wordCount: number
  unitCount: number
  /** 用户自己导入的词库。true 时不能去 fetch data/<id>.json，只能从本地库读 */
  custom?: boolean
  /**
   * 锁定的词库，不允许从列表里移除。
   * 学校教材（五年级、厚海）是必须打卡的主线，误删会直接断掉学习，
   * 所以这类词书既不给移除入口，即使 hiddenBooks 里被写进去也强制显示。
   */
  locked?: boolean
  lang: Lang
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
  const list = (await res.json()) as BookInfo[]
  return list.map((b) => ({ ...b, lang: langOf(b.lang) }))
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
    lang: langOf(b.lang),
  }))
  return [...builtin, ...custom]
}

export function isCustomBook(catalog: BookInfo[], id: string): boolean {
  return catalog.find((b) => b.id === id)?.custom === true
}

/** 首页/各处看到的词书列表 = 全部词书 - 用户隐藏的 */
export function visibleBooks(
  catalog: BookInfo[],
  hidden: string[] = [],
): BookInfo[] {
  if (hidden.length === 0) return catalog
  const set = new Set(hidden)
  // locked 的永远留下：隐藏列表是给用户自己整理的，不能让他把主线教材弄丢
  return catalog.filter((b) => !set.has(b.id) || b.locked)
}

/** 能不能从列表里移除（锁定的和正在学的都不行） */
export function canHideBook(
  book: BookInfo,
  activeBookId: string | undefined,
  visibleCount: number,
): boolean {
  if (book.locked) return false
  if (book.id === activeBookId) return false
  return visibleCount > 1
}
