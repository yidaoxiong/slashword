export interface BookInfo {
  id: string
  name: string
  grade: string
  source: string
  wordCount: number
  unitCount: number
}

/**
 * 词书目录。
 *
 * 由 scripts/parse_vocab.py 从 data/books.json 生成 —— 以后要加单词包，
 * 只要把新词表放进源目录、在脚本的 BOOKS 里加一项、重跑 `npm run vocab`，
 * 前端不用改一行代码就会多出一本可选词书。
 */
export async function loadCatalog(): Promise<BookInfo[]> {
  const res = await fetch('./data/books.json')
  if (!res.ok) throw new Error('词书目录加载失败')
  return (await res.json()) as BookInfo[]
}
