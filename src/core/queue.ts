import type { EngineConfig, QueueItem, WordEntry } from '../types'
import { createCard } from './scheduler'
import type { Repository } from '../storage'

/**
 * 一个单词的归一 key。
 * 用"小写单词 + 中文释义指纹"，这样：
 * - 大小写、多余空格不同的写法会被合并成一个卡；
 * - 真正的多义词（review 评论 / review 写评论）会各自成卡，分别掌握。
 */
export function wordKeyOf(word: string, cn: string): string {
  const w = word.toLowerCase().trim().replace(/\s+/g, ' ')
  let h = 0
  for (let i = 0; i < cn.length; i++) {
    h = (h * 31 + cn.charCodeAt(i)) >>> 0
  }
  return `${w}#${h.toString(36)}`
}

export function sortEntries(entries: WordEntry[]): WordEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.unitOrder - b.unitOrder ||
      a.lessonOrder - b.lessonOrder ||
      a.id.localeCompare(b.id),
  )
}

/**
 * 生成今日任务队列。
 *
 * 顺序：先复习后新词。复习是"还债"，新词是"扩张"——
 * 债不还，学再多新词也会在同一个坑上反复摔。
 */
export async function buildDailyQueue(
  repo: Repository,
  config: EngineConfig,
  now: number,
): Promise<QueueItem[]> {
  const items: QueueItem[] = []

  // 1) 到期的复习卡 —— 只取当前词书的，否则学厚海时会混进五年级的复习词
  const allDue = await repo.listDueCards(config.userId, now, config.dailyReviewLimit * 3)
  const dueSorted = allDue
    .filter((c) => c.book === config.activeBook)
    .sort((a, b) => a.due - b.due)
    .slice(0, config.dailyReviewLimit)
  for (const card of dueSorted) {
    const entryId = card.entryIds[0]
    if (!entryId) continue
    items.push({
      cardId: card.id,
      entryId,
      word: card.display,
      isNew: false,
    })
  }

  // 2) 新词：取已解锁单元中还没建过卡的前 N 个
  const newNeeded = config.dailyNewLimit
  if (newNeeded > 0) {
    const entries = await repo.listEntries(config.activeBook)
    const allowed = unlockedUnitSet(entries, config)
    const candidates = sortEntries(entries.filter((e) => allowed.has(e.unitOrder)))

    const fresh: QueueItem[] = []
    for (const e of candidates) {
      if (fresh.length >= newNeeded) break
      const key = wordKeyOf(e.word, e.cn)
      const existing = await repo.getCardByWordKey(config.userId, key)
      if (existing) continue

      const card = createCard({
        userId: config.userId,
        wordKey: key,
        display: e.word,
        entryIds: [e.id],
        book: e.book,
        unit: e.unit,
        unitOrder: e.unitOrder,
        lesson: e.lesson,
        lessonOrder: e.lessonOrder,
        now,
      })
      await repo.putCard(card)
      fresh.push({
        cardId: card.id,
        entryId: e.id,
        word: e.word,
        isNew: true,
      })
    }
    items.push(...fresh)
  }

  return items
}

/** 一本词书里所有单元的编号，按顺序列出来（五上是 [1,2,3,5,6,7]，厚海是 [7..12]） */
export function unitsOf(entries: WordEntry[]): number[] {
  return [...new Set(entries.map((e) => e.unitOrder))].sort((a, b) => a - b)
}

/** 当前词书解锁了几个单元 */
export function unlockedCount(config: EngineConfig): number {
  return config.unitProgress?.[config.activeBook] ?? 1
}

/** 已解锁单元的编号集合 */
export function unlockedUnitSet(
  entries: WordEntry[],
  config: EngineConfig,
): Set<number> {
  return new Set(unitsOf(entries).slice(0, unlockedCount(config)))
}

/** 当前学到哪个单元（返回课本上的真实叫法，比如 "Unit 7" / "Unit One"） */
export function currentUnitLabel(
  entries: WordEntry[],
  config: EngineConfig,
): string {
  const units = unitsOf(entries)
  if (units.length === 0) return '—'
  const idx = Math.min(unlockedCount(config), units.length) - 1
  const order = units[idx]
  return entries.find((e) => e.unitOrder === order)?.unit ?? '—'
}

export function todayKey(now: number = Date.now()): string {
  const d = new Date(now)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function defaultConfig(userId = 'local'): EngineConfig {
  return {
    userId,
    dailyNewLimit: 10,
    dailyReviewLimit: 60,
    activeBook: 'g5a',
    unitProgress: {},
    enabledSkills: ['spell', 'example', 'definition'],
    // 默认不给首字母提示：这一关练的就是"从意思反推拼写"，
    // 给了首字母等于替孩子想了第一步。需要的话家长端可以打开
    spellHint: false,
    masteryThreshold: 80,
  }
}
