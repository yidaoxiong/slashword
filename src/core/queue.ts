import type { Card, EngineConfig, QueueItem, Skill, WordEntry } from '../types'
import { ENABLED_SKILL_ORDER } from '../types'
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

/**
 * 从当前词表里找回一张卡片对应的那条词。
 *
 * 词条 id 是位置编号（g5a-0001、g5a-0002…），词表清洗一次就整体重排 ——
 * 卡片里存下来的 entryIds[0] 会指向另一个词，甚至指向已经不存在的编号。
 * 直接拿它去 getEntry，轻则显示成别的词，重则查不到、整页变空白。
 *
 * 所以不信存下来的 id，用 wordKey 反查。wordKey = 单词 + 释义指纹，
 * 只要这个词还在表里就对得上，跟编号怎么排没关系。
 */
export function resolveEntry(
  entries: WordEntry[],
  card: Card,
): WordEntry | undefined {
  const byKey = entries.find((e) => wordKeyOf(e.word, e.cn) === card.wordKey)
  if (byKey) return byKey
  // 释义被改过 → wordKey 变了。退一步只认单词本身，总比显示成别的词强
  const w = card.display.trim().toLowerCase()
  return entries.find((e) => e.word.trim().toLowerCase() === w)
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
 * 每天**首次**生成任务时的总量上限（新增 + 复习）。
 *
 * 光有「新词上限」管不住总量：复习默认 60、新词 10，凑起来 70 个。
 * 孩子在首页明明选了"学 5 个新词"，一进去发现还有五十几个复习等着，
 * 第一反应就是"我设的 5 个怎么没用"。
 */
export const DEFAULT_TOTAL_LIMIT = 50

/**
 * 生成今日任务队列。
 *
 * 队列顺序仍然是先复习后新词（复习是"还债"，新词是"扩张"——
 * 债不还，学再多新词也会在同一个坑上反复摔）。
 *
 * 但**计算顺序**要反过来：先定新词、再用剩下的名额取复习。
 * 因为总上限是共享的，得先知道新词占掉几个，才知道复习还能给多少。
 * 新词没取满时（单元快见底了）空出来的名额自动让给复习，不浪费。
 *
 * @param totalLimit 覆盖总量上限。加练时传大值绕开每天 50 的限制 ——
 *   那是孩子自己点的"再来几个"，不该被首日限额挡住。
 */
export async function buildDailyQueue(
  repo: Repository,
  config: EngineConfig,
  now: number,
  totalLimitOverride?: number,
): Promise<QueueItem[]> {
  const entries = await repo.listEntries(config.activeBook)
  const totalLimit = totalLimitOverride ?? config.dailyTotalLimit ?? DEFAULT_TOTAL_LIMIT

  // 1) 新词：取已解锁单元中还没建过卡的前 N 个
  const newNeeded = Math.max(0, Math.min(config.dailyNewLimit, totalLimit))
  const fresh: QueueItem[] = []
  if (newNeeded > 0) {
    const allowed = unlockedUnitSet(entries, config)
    const candidates = sortEntries(entries.filter((e) => allowed.has(e.unitOrder)))

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
  }

  // 2) 复习名额 = 总量上限 - 实际新词数
  const reviewCap = Math.max(
    0,
    Math.min(config.dailyReviewLimit, totalLimit - fresh.length),
  )
  const reviews: QueueItem[] = []
  if (reviewCap > 0) {
    // 只取当前词书的，否则学厚海时会混进五年级的复习词
    const allDue = await repo.listDueCards(config.userId, now, reviewCap * 3)
    const dueSorted = allDue
      .filter((c) => c.book === config.activeBook)
      .sort((a, b) => a.due - b.due)
    for (const card of dueSorted) {
      if (reviews.length >= reviewCap) break
      const entry = resolveEntry(entries, card)
      // 词表里已经找不到这个词了（改过词表）—— 跳过，而且不能让白跳的卡
      // 占掉复习名额，所以限额判断放在这里而不是提前 slice
      if (!entry) continue
      // 顺手把卡片上过期的位置编号改回来，之后就不用每次都反查了
      if (card.entryIds[0] !== entry.id) {
        await repo.putCard({
          ...card,
          entryIds: [entry.id],
          unit: entry.unit,
          unitOrder: entry.unitOrder,
          lesson: entry.lesson,
          lessonOrder: entry.lessonOrder,
          updatedAt: now,
        })
      }
      reviews.push({
        cardId: card.id,
        entryId: entry.id,
        word: card.display,
        isNew: false,
      })
    }
  }

  return [...reviews, ...fresh]
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

/**
 * 自动解锁下一个单元。
 *
 * 以前 unitProgress 只能靠家长端手动拖滑杆，代码里没有任何推进 ——
 * 结果就是孩子学完第 1 个单元后，buildDailyQueue 再也找不到新词，
 * 加练按钮点了完全没反应，也没任何提示。
 *
 * 规则：已解锁单元里的词全部建过卡（即都见过）就往后开一个单元。
 * 没掌握的词会由 FSRS 继续安排复习，所以"见过就解锁"不会漏掉谁。
 *
 * 返回更新后的 config；没变化就原样返回（调用方据此决定要不要写库）。
 */
export async function autoUnlock(
  repo: Repository,
  config: EngineConfig,
  entries: WordEntry[],
): Promise<EngineConfig> {
  const units = unitsOf(entries)
  let unlocked = unlockedCount(config)

  while (unlocked < units.length) {
    const allowed = new Set(units.slice(0, unlocked))
    const pool = entries.filter((e) => allowed.has(e.unitOrder))
    if (pool.length === 0) {
      unlocked += 1
      continue
    }
    const seen = await Promise.all(
      pool.map(async (e) =>
        repo.getCardByWordKey(config.userId, wordKeyOf(e.word, e.cn)),
      ),
    )
    // 还有没见过的词就停在这里，别急着开新的
    if (seen.some((c) => !c)) break
    unlocked += 1
  }

  if (unlocked === unlockedCount(config)) return config
  return {
    ...config,
    unitProgress: { ...config.unitProgress, [config.activeBook]: unlocked },
  }
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

/**
 * 把已保存的环节顺序重排成当前规范顺序。
 *
 * 环节顺序改过一次（「听读音选中文释义」从第三项挪到第二项），但老配置已经
 * 躺在 IndexedDB 里了 —— 光改 defaultConfig() 的默认值对老用户无效，
 * spread 合并时旧数组会原样带过来。所以每次读配置都重排一遍。
 *
 * 只重排顺序、不动开关：家长端关掉的环节照样关着。
 * 不在规范列表里的（比如 pron）原样保留在末尾，不会丢。
 * 幂等：已经是新顺序的话原样返回。
 */
export function normalizeSkills(saved: Skill[] | undefined): Skill[] {
  if (!saved?.length) return [...ENABLED_SKILL_ORDER]
  const on = new Set(saved)
  const ordered = ENABLED_SKILL_ORDER.filter((s) => on.has(s))
  const extra = saved.filter((s) => !ENABLED_SKILL_ORDER.includes(s))
  return [...ordered, ...extra]
}

export function defaultConfig(userId = 'local'): EngineConfig {
  return {
    userId,
    dailyNewLimit: 10,
    dailyReviewLimit: 60,
    // 首次生成队列的新增+复习总量上限。老配置没有这个字段，
    // 加载时靠 {...默认值, ...已存配置} 自动补上
    dailyTotalLimit: DEFAULT_TOTAL_LIMIT,
    activeBook: 'g5a',
    unitProgress: {},
    // 拼写 → 听读音选中文释义 → 例句（释义调到例句前面，见 types/index.ts 的说明）
    enabledSkills: [...ENABLED_SKILL_ORDER],
    // 默认不给首字母提示：这一关练的就是"从意思反推拼写"，
    // 给了首字母等于替孩子想了第一步。需要的话家长端可以打开
    spellHint: false,
    // 默认英音。人教版小学英语偏美音，家里如果要跟教材一致，
    // 去家长端切成"美音"即可，单词和例句会整体切换
    accent: 'uk',
    hiddenBooks: [],
    masteryThreshold: 80,
    updatedAt: Date.now(),
  }
}
