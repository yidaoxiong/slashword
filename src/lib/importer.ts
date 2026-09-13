/**
 * 词库导入：把用户上传的 Excel / CSV 解析成标准词条。
 *
 * 清洗规则是从 scripts/parse_vocab.py 原样搬过来的（括号注释剥离、二选一切分、
 * 音标拆分、单元编号识别）—— 两边必须保持一致，否则同一个词表在
 * 「发给我跑脚本」和「自己导入」两条路上会得到不一样的结果。
 *
 * Excel 解析用动态 import：SheetJS 有 400KB 左右，只有真的点了导入才加载，
 * 不拖慢首屏。
 */
import type { Lang, WordEntry } from '../types'

/** 模板的标准列名（改这里要同步改 scripts/make_template.py 的 HEADERS） */
export const TEMPLATE_HEADERS = [
  '单词',
  '音标',
  '词性',
  '中文含义',
  '英文例句',
  '例句中文',
  '冠词',
  '单元',
  '单元主题',
  '课文',
  '词汇类别',
]

export type Field =
  | 'word'
  | 'phonetic'
  | 'article'
  | 'pos'
  | 'cn'
  | 'exampleCn'
  | 'exampleEn'
  | 'unitTitle'
  | 'unit'
  | 'lessonTitle'
  | 'lesson'
  | 'category'

/**
 * 匹配顺序有讲究：越具体的字段越靠前。
 * 「例句中文」包含「例句」、「单元主题」包含「单元」，先匹配具体字段才不会被抢走。
 */
const ORDER: Field[] = [
  'word',
  'phonetic',
  'article',
  'cn',
  'exampleCn',
  'exampleEn',
  'unitTitle',
  'unit',
  'lessonTitle',
  'lesson',
  'category',
  'pos',
]

const ALIASES: Record<Field, string[]> = {
  word: ['单词', 'word', '词汇', '生字', '英文'],
  phonetic: ['音标', '注音', 'phonetic', '读音', '发音'],
  article: ['冠词', 'article', '定冠词'],
  pos: ['词性', 'pos', '词类', 'part of speech'],
  cn: ['中文含义', '中文意思', '中文释义', '中文', '释义', '意思', 'meaning', 'cn'],
  exampleEn: ['英文例句', '英语例句', '例句（英）', 'example', '例句'],
  exampleCn: ['例句中文解释', '例句中文', '例句翻译', '例句（中）'],
  unit: ['单元', '所属unit', 'unit', '第几单元', 'module'],
  unitTitle: ['单元主题', 'unit主题', 'unit title'],
  lesson: ['课文', '所属lesson', 'lesson', '课'],
  lessonTitle: ['课文题目', '课题目', 'lesson题目'],
  category: ['词汇类别', '类别', '分类', 'category', 'tag'],
}

/** 必填列，缺了整个表就没法用 */
export const REQUIRED: Field[] = ['word', 'cn']

export interface ColumnMap {
  /** field -> 列下标，没匹配到就不存在 */
  index: Partial<Record<Field, number>>
  headers: string[]
  missing: Field[]
}

export interface ImportReport {
  total: number
  skipped: number
  duplicates: string[]
  missing: { phonetic: number; cn: number; example: number; pos: number }
  unitCount: number
  samples: WordEntry[]
}

export interface ParsedBook {
  words: WordEntry[]
  report: ImportReport
}

// ---------- 基础清洗（与 scripts/parse_vocab.py 一致）----------

function clean(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * 'maths (=mathematics, AmE math)' -> ('maths', '=mathematics, AmE math')
 * 括号注释不剥掉的话孩子永远拼不对；但注释本身有价值，单独留到 note。
 */
function cleanWord(raw: unknown): [string, string] {
  let s = clean(raw)
  const notes: string[] = []
  const re = /\(([^)]*)\)|（([^）]*)）/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const t = (m[1] ?? m[2] ?? '').trim()
    if (t) notes.push(t)
  }
  s = s.replace(/\([^)]*\)/g, '').replace(/（[^）]*）/g, '')
  // 'turn left/right' 二选一，取第一种作为拼写答案
  if (s.includes('/')) s = s.split('/')[0]
  s = s.trim().replace(/^,|,$/g, '').trim()
  return [s, notes.join('; ')]
}

function cleanCn(raw: unknown): string {
  const s = clean(raw)
  return (s.includes('/') ? s.split('/')[0] : s).trim()
}

/** '英 /a/ 美 /b/' | '/a/' | 裸文本 -> (uk, us) */
function splitPhonetic(raw: unknown): [string, string] {
  const s = clean(raw)
  if (!s) return ['', '']
  const both = s.match(/英\s*(\/[^/]+\/)\s*美\s*(\/[^/]+\/)/)
  if (both) return [both[1].trim(), both[2].trim()]
  const one = s.match(/(\/[^/]+\/)/)
  if (one) return [one[1].trim(), one[1].trim()]
  return [s, s]
}

const ZH_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

function firstNum(s: string, fallback = 999): number {
  const m = s.match(/(\d+)/)
  if (m) return Number(m[1])
  return fallback
}

function unitNum(unit: unknown): number {
  const s = clean(unit).toLowerCase()
  if (!s) return 999
  for (const [k, v] of Object.entries(ZH_NUM)) {
    if (s.includes(k)) return v
  }
  const zh = s.match(/[一二三四五六七八九十]/)
  if (zh) {
    const map: Record<string, number> = {
      一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
    }
    return map[zh[0]] ?? 999
  }
  return firstNum(s)
}

// ---------- 表头识别 ----------

function normalizeHeader(h: unknown): string {
  return clean(h).replace(/[*\s]/g, '').toLowerCase()
}

export function mapColumns(headers: string[]): ColumnMap {
  const norm = headers.map(normalizeHeader)
  const index: Partial<Record<Field, number>> = {}
  const taken = new Set<number>()

  for (const field of ORDER) {
    const aliases = ALIASES[field].map((a) => a.replace(/\s/g, '').toLowerCase())
    // 先精确匹配，再退到包含匹配（包含匹配要避开已被占用的列）
    let i = norm.findIndex((h, k) => !taken.has(k) && aliases.includes(h))
    if (i < 0) {
      i = norm.findIndex(
        (h, k) => !taken.has(k) && h !== '' && aliases.some((a) => h.includes(a)),
      )
    }
    if (i >= 0) {
      index[field] = i
      taken.add(i)
    }
  }

  const missing = REQUIRED.filter((f) => index[f] === undefined)
  return { index, headers, missing }
}

// ---------- 解析文件 ----------

async function decodeText(buf: ArrayBuffer): Promise<string> {
  const utf8 = new TextDecoder('utf-8').decode(buf)
  // Excel 另存的 CSV 常常是 GBK，直接按 UTF-8 解会出一堆替换字符
  if (utf8.includes('\uFFFD')) {
    try {
      const gbk = new TextDecoder('gbk').decode(buf)
      if (!gbk.includes('\uFFFD')) return gbk
    } catch {
      // 浏览器不支持 gbk 就用 UTF-8 的结果
    }
  }
  return utf8
}

export interface SheetData {
  /** 第一行是表头 */
  rows: string[][]
  sheetNames: string[]
}

export async function readSpreadsheet(file: File): Promise<SheetData> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const isCsv = /\.(csv|txt)$/i.test(file.name)
  const wb = isCsv
    ? XLSX.read(await decodeText(buf), { type: 'string' })
    : XLSX.read(new Uint8Array(buf), { type: 'array' })

  // 有多个表时优先用名字里带"单词/词汇/sheet1"的那个，否则取第一个
  const names = wb.SheetNames
  const preferred =
    names.find((n) => /单词|词汇|word/i.test(n)) ?? names[0]
  const table: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[preferred], {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  })
  return {
    rows: table.map((r) => (Array.isArray(r) ? r.map((c) => clean(c)) : [])),
    sheetNames: names,
  }
}

// ---------- 组装词条 ----------

export interface BuildOptions {
  /** 词库 id，词条 id 用它的前缀 */
  bookId: string
  grade: string
  source: string
  /** 语言决定发音音色和屏幕键盘，导入时由用户在家长页选 */
  lang: Lang
}

export function buildEntries(
  rows: string[][],
  map: ColumnMap,
  opts: BuildOptions,
): ParsedBook {
  const body = rows.slice(1)
  const at = (r: string[], f: Field) =>
    map.index[f] === undefined ? '' : (r[map.index[f] as number] ?? '')

  const words: WordEntry[] = []
  const duplicates: string[] = []
  const seen = new Set<string>()
  let skipped = 0
  let noPhonetic = 0
  let noCn = 0
  let noExample = 0
  let noPos = 0

  for (const r of body) {
    if (!r || r.length === 0) continue
    const [word, note] = cleanWord(at(r, 'word'))
    if (!word) {
      skipped += 1
      continue
    }
    const key = word.toLowerCase()
    if (seen.has(key)) {
      duplicates.push(word)
      continue
    }
    seen.add(key)

    const [uk, us] = splitPhonetic(at(r, 'phonetic'))
    const cn = cleanCn(at(r, 'cn'))
    const exampleEn = at(r, 'exampleEn')
    if (!uk) noPhonetic += 1
    if (!cn) noCn += 1
    if (!exampleEn) noExample += 1
    const pos = at(r, 'pos')
    if (!pos) noPos += 1

    words.push({
      id: `${opts.bookId}-${String(words.length + 1).padStart(4, '0')}`,
      word,
      note,
      phoneticUk: uk,
      phoneticUs: us,
      article: at(r, 'article'),
      lang: opts.lang,
      pos,
      cn,
      exampleEn,
      exampleCn: at(r, 'exampleCn'),
      book: opts.bookId,
      grade: opts.grade,
      source: opts.source,
      unit: at(r, 'unit'),
      unitOrder: unitNum(at(r, 'unit')),
      unitTitle: at(r, 'unitTitle'),
      lesson: at(r, 'lesson'),
      lessonOrder: firstNum(at(r, 'lesson')),
      lessonTitle: at(r, 'lessonTitle'),
      category: at(r, 'category'),
      phonics: [],
      definitionEn: '',
    })
  }

  const unitCount = new Set(words.map((w) => w.unitOrder)).size
  return {
    words,
    report: {
      total: words.length,
      skipped,
      duplicates,
      missing: {
        phonetic: noPhonetic,
        cn: noCn,
        example: noExample,
        pos: noPos,
      },
      unitCount,
      samples: words.slice(0, 5),
    },
  }
}

/** 新词库 id：u + 时间戳 36 进制，短且不会撞 */
export function newBookId(): string {
  return `u-${Date.now().toString(36)}`
}

/** 导出给 npm run import-book 用的文件 */
export function downloadBook(book: {
  meta: Record<string, unknown>
  words: WordEntry[]
}) {
  const blob = new Blob([JSON.stringify(book, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${String(book.meta.id)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
