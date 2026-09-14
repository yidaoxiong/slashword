import { create } from 'zustand'
import type {
  Card,
  CheckinRecord,
  EngineConfig,
  QueueItem,
  Skill,
  UserBook,
  WordEntry,
} from '../types'
import { getRepo } from '../storage'
import { buildDailyQueue, defaultConfig, todayKey } from '../core/queue'
import {
  isCustomBook,
  loadCatalog,
  mergeCatalog,
  visibleBooks,
  type BookInfo,
} from '../core/books'
import {
  SCHEDULER_VERSION,
  applySkillResult,
  finalizeReview,
} from '../core/scheduler'
import { getUserId } from './useAuthStore'

const repo = getRepo()

export type Phase = 'loading' | 'idle' | 'learning' | 'done'

interface SessionState {
  cardId: string
  entryId: string
  skillIdx: number
  results: Partial<Record<Skill, boolean>>
  startedAt: number
}

interface AppState {
  phase: Phase
  config: EngineConfig | null
  queue: QueueItem[]
  idx: number
  card: Card | null
  entry: WordEntry | null
  session: SessionState | null
  checkin: CheckinRecord | null
  streak: number
  totalWords: number
  bookLoaded: boolean
  error: string | null
  /** 当前词书全部词条，内存缓存（几百条，用于出干扰项） */
  entries: WordEntry[]
  /** 可选词书目录（内置 + 自制） */
  catalog: BookInfo[]
  /** 用户导入的词库 */
  userBooks: UserBook[]

  init: () => Promise<void>
  refreshCatalog: () => Promise<void>
  /** 导入一个自制词库，导入后自动出现在首页词书列表里。userId 自动取当前账号 */
  importBook: (
    input: Omit<UserBook, 'createdAt' | 'updatedAt' | 'userId'>,
  ) => Promise<void>
  /** 删除自制词库；删的正好是当前词书就自动切到第一本 */
  removeBook: (id: string) => Promise<void>
  startDay: () => Promise<void>
  submitSkill: (
    skill: Skill,
    correct: boolean,
    input?: string,
    usedHint?: boolean,
  ) => Promise<void>
  skipItem: () => void
  reset: () => Promise<void>
  setConfig: (patch: Partial<EngineConfig>) => Promise<void>
  /** 切换词书（今天学厚海还是五年级） */
  switchBook: (bookId: string) => Promise<void>
  /** 临时加量：今天想多背几个，不用改每天的默认设置 */
  addMore: (count: number, kind?: 'new' | 'weak') => Promise<number>
}

/**
 * 每次启动都重新导入**内置**词库。
 * 词表会改（比如这次清洗掉了括号注释），只判断"本地有没有"的话，
 * 老数据会一直卡在浏览器里不更新。396 条重写只要几十毫秒，不值得为此做版本号。
 *
 * 用户导入的词库不能这么干 —— 它没有 JSON 文件可 fetch，
 * 只能从本地 userBooks 记录里读（记录本身带全部词条）。
 */
async function loadBook(bookId: string, custom: boolean) {
  if (custom) {
    const ub = await repo.getUserBook(bookId)
    if (!ub) throw new Error(`自制词库已丢失，请在家长页重新导入：${bookId}`)
    await repo.importEntries(bookId, ub.words)
    return
  }
  const res = await fetch(`./data/${bookId}.json`)
  if (!res.ok) throw new Error(`词库加载失败：${bookId}`)
  const data = (await res.json()) as { meta: unknown; words: WordEntry[] }
  await repo.importEntries(bookId, data.words)
}

async function computeStreak(userId: string): Promise<number> {
  const records = await repo.listCheckins(userId)
  const done = new Set(records.filter((r) => r.completed).map((r) => r.date))
  let streak = 0
  const cursor = new Date()
  // 今天没打卡不打断连续记录，从昨天开始往前数
  if (!done.has(todayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  for (;;) {
    const key = todayKey(cursor.getTime())
    if (!done.has(key)) break
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export const useAppStore = create<AppState>((set, get) => ({
  phase: 'loading',
  config: null,
  queue: [],
  idx: 0,
  card: null,
  entry: null,
  session: null,
  checkin: null,
  streak: 0,
  totalWords: 0,
  bookLoaded: false,
  error: null,
  entries: [],
  catalog: [],
  userBooks: [],

  async init() {
    try {
      // 每次都重算：切账号后可用的自制词库不一样，不能沿用上一本账的目录
      const userId = getUserId()
      const [builtin, userBooks] = await Promise.all([
        loadCatalog(),
        repo.listUserBooks(userId),
      ])
      set({ catalog: mergeCatalog(builtin, userBooks), userBooks })

      let config = await repo.getConfig(userId)
      if (!config) {
        config = defaultConfig(userId)
        await repo.putConfig(config)
      } else {
        // 老配置用默认值补齐新字段（hiddenBooks 等），已有的一律保留。
        // 无条件跑而不是判断某个字段在不在 —— 以前那样判断，加第二个新字段时又会漏
        // updatedAt 只在缺失时补：老配置没有这个字段，用默认值填会让它
        // 一启动就变成"最新"，下次同步就把云端真正新的配置盖掉
        config = {
          ...defaultConfig(userId),
          ...config,
          userId,
          updatedAt: config.updatedAt ?? Date.now(),
        }
        await repo.putConfig(config)
      }
      await loadBook(config.activeBook, isCustomBook(get().catalog, config.activeBook))
      const checkin = await repo.getCheckin(userId, todayKey())
      const streak = await computeStreak(userId)
      const entries = await repo.listEntries(config.activeBook)
      set({
        phase: 'idle',
        config,
        checkin: checkin ?? null,
        streak,
        totalWords: entries.length,
        entries,
        bookLoaded: true,
        error: null,
        // 切账号时把上一个人的会话彻底清掉，否则会留着上一个用户的待学队列和进度
        queue: [],
        idx: 0,
        card: null,
        entry: null,
        session: null,
      })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), phase: 'idle' })
    }
  },

  async startDay() {
    const { config } = get()
    if (!config) return
    const now = Date.now()
    const queue = await buildDailyQueue(repo, config, now)

    let checkin = await repo.getCheckin(getUserId(), todayKey(now))
    if (!checkin) {
      checkin = {
        userId: getUserId(),
        date: todayKey(now),
        newCount: queue.filter((q) => q.isNew).length,
        reviewCount: queue.filter((q) => !q.isNew).length,
        durationSec: 0,
        completed: false,
        completedAt: null,
        updatedAt: now,
      }
      await repo.putCheckin(checkin)
    }

    if (queue.length === 0) {
      set({ phase: 'done', queue, idx: 0, checkin, card: null, entry: null })
      return
    }
    set({ phase: 'learning', queue, idx: 0, checkin })
    await loadItem(0, queue, set)
  },

  async submitSkill(skill, correct, input, usedHint = false) {
    const state = get()
    const { card, session, config, queue, idx } = state
    if (!card || !session || !config) return

    const now = Date.now()
    const results = { ...session.results, [skill]: correct }
    // 用过"先听一遍"的，即使拼对也只算半掌握
    const updated = applySkillResult(card, skill, correct, usedHint)
    await repo.putCard(updated)

    await repo.appendLog({
      userId: getUserId(),
      cardId: card.id,
      wordKey: card.wordKey,
      reviewedAt: now,
      skill,
      correct,
      input,
      durationMs: now - session.startedAt,
      rating: correct ? 3 : 1,
      schedulerVersion: SCHEDULER_VERSION,
    })

    const nextIdx = session.skillIdx + 1
    const skills = config.enabledSkills

    if (nextIdx < skills.length) {
      set({
        card: updated,
        session: { ...session, skillIdx: nextIdx, results },
      })
      return
    }

    // 该词全部环节完成 → 综合评分 → FSRS 排下次复习
    const finalized = finalizeReview(updated, skills, now)
    await repo.putCard(finalized.card)
    await repo.appendLog({
      userId: getUserId(),
      cardId: card.id,
      wordKey: card.wordKey,
      reviewedAt: now,
      skill: skills[skills.length - 1],
      correct: Object.values(results).every(Boolean),
      durationMs: now - session.startedAt,
      rating: finalized.rating,
      schedulerVersion: SCHEDULER_VERSION,
    })

    const nextItemIdx = idx + 1
    if (nextItemIdx >= queue.length) {
      const rec = state.checkin
      if (rec) {
        const done: CheckinRecord = {
          ...rec,
          completed: true,
          completedAt: now,
          durationSec: Math.round((now - session.startedAt) / 1000),
          // 必须刷新：同步靠 updatedAt 判断谁新（last-write-wins）。
          // 不刷的话它还是"开始学习"那一刻的时间戳 ——
          // 万一那条 completed=false 已经推上云端，这次推送会因为
          // 「时间戳不比云端新」被拒，云端永远是未打卡状态，
          // 别的设备也就永远同步不到今天已打卡
          updatedAt: now,
        }
        await repo.putCheckin(done)
        set({ checkin: done })
      }
      set({
        phase: 'done',
        card: finalized.card,
        streak: await computeStreak(getUserId()),
      })
      return
    }

    set({ idx: nextItemIdx, card: finalized.card })
    await loadItem(nextItemIdx, queue, set)
  },

  skipItem() {
    const { idx, queue } = get()
    const next = idx + 1
    if (next >= queue.length) {
      set({ phase: 'done' })
      return
    }
    set({ idx: next })
    void loadItem(next, queue, set)
  },

  async reset() {
    const { config } = get()
    if (!config) return
    await repo.resetProgress(config.userId)
    set({
      queue: [],
      idx: 0,
      card: null,
      entry: null,
      session: null,
      checkin: null,
      streak: 0,
      phase: 'idle',
    })
    await get().init()
  },

  async setConfig(patch) {
    const cur = get().config
    if (!cur) return
    // 必须刷新 updatedAt：同步时它是 last-write-wins 的唯一依据。
    // 不改的话本地改完永远是旧时间戳，推上去云端不收、拉下来又被云端盖掉
    const next = { ...cur, ...patch, updatedAt: Date.now() }
    await repo.putConfig(next)
    set({ config: next })
  },

  /**
   * 只重算词书目录，不动正在进行的会话。
   * 同步从别的设备拉到新词库后要调它 —— 走 init 会打断孩子正在做的题。
   */
  async refreshCatalog() {
    const [builtin, userBooks] = await Promise.all([
      loadCatalog(),
      repo.listUserBooks(getUserId()),
    ])
    set({ userBooks, catalog: mergeCatalog(builtin, userBooks) })
  },

  async importBook(input) {
    const now = Date.now()
    // 归属当前账号：别的账号登录后看不到这本
    const book: UserBook = {
      ...input,
      userId: getUserId(),
      createdAt: now,
      updatedAt: now,
    }
    await repo.putUserBook(book)
    await repo.importEntries(book.id, book.words)
    const userBooks = await repo.listUserBooks(getUserId())
    const builtin = await loadCatalog()
    set({ userBooks, catalog: mergeCatalog(builtin, userBooks) })
  },

  async removeBook(id) {
    const { config } = get()
    await repo.deleteUserBook(id)
    const userBooks = await repo.listUserBooks(getUserId())
    const builtin = await loadCatalog()
    const catalog = mergeCatalog(builtin, userBooks)
    set({ userBooks, catalog })
    if (config?.activeBook === id) {
      // 只能切到「没被移除」的词书，否则会跳到一个看不见的列表项上。
      // 全被移除光了就把移除列表清空，不留死局
      let next = visibleBooks(catalog, config.hiddenBooks)[0]
      if (!next && catalog.length > 0) {
        await get().setConfig({ hiddenBooks: [] })
        next = catalog[0]
      }
      if (next) await get().switchBook(next.id)
    }
  },

  async switchBook(bookId) {
    await get().setConfig({ activeBook: bookId })
    // init 会按需把新词库灌进本地库，并重新载入词条
    await get().init()
    set({ phase: 'idle', queue: [], idx: 0, card: null, entry: null, session: null })
  },

  async addMore(count, kind = 'new') {
    const { config, queue, phase, checkin } = get()
    if (!config) return 0

    const have = new Set(queue.map((q) => q.cardId))
    let added: QueueItem[] = []

    if (kind === 'new') {
      // 只取新词，不重复拉已经在队列里的
      const temp: EngineConfig = {
        ...config,
        dailyNewLimit: count,
        dailyReviewLimit: 0,
      }
      added = (await buildDailyQueue(repo, temp, Date.now())).filter(
        (q) => !have.has(q.cardId),
      )
    } else {
      // 专攻薄弱词：把掌握度最低、又不在今天队列里的挑出来
      const skills = config.enabledSkills
      const avgOf = (c: Card) =>
        skills.reduce((a, s) => a + c.mastery[s], 0) / skills.length
      added = (await repo.listCards(config.userId))
        .filter((c) => c.reps > 0 && !have.has(c.id) && c.entryIds.length > 0)
        .sort((a, b) => avgOf(a) - avgOf(b))
        .slice(0, count)
        .map((c) => ({
          cardId: c.id,
          entryId: c.entryIds[0],
          word: c.display,
          isNew: false,
        }))
    }

    if (added.length === 0) return 0

    const nextQueue = [...queue, ...added]

    if (phase === 'done' || phase === 'idle') {
      // 打完卡（或重开页面停在首页）又想加练：重新进入学习，打卡状态放回去
      const reopened: CheckinRecord | null = checkin
        ? {
            ...checkin,
            newCount: checkin.newCount + (kind === 'new' ? added.length : 0),
            reviewCount: checkin.reviewCount + (kind === 'weak' ? added.length : 0),
            completed: false,
            completedAt: null,
          }
        : null
      if (reopened) await repo.putCheckin(reopened)
      const startIdx = phase === 'idle' ? 0 : queue.length
      set({
        queue: nextQueue,
        phase: 'learning',
        idx: startIdx,
        checkin: reopened,
      })
      await loadItem(startIdx, nextQueue, set)
    } else {
      if (checkin) {
        const bumped: CheckinRecord = {
          ...checkin,
          newCount: checkin.newCount + (kind === 'new' ? added.length : 0),
          reviewCount: checkin.reviewCount + (kind === 'weak' ? added.length : 0),
        }
        await repo.putCheckin(bumped)
        set({ queue: nextQueue, checkin: bumped })
      } else {
        set({ queue: nextQueue })
      }
    }
    return added.length
  },
}))

async function loadItem(
  index: number,
  queue: QueueItem[],
  set: (partial: Partial<AppState>) => void,
) {
  const item = queue[index]
  if (!item) return
  const [card, entry] = await Promise.all([
    repo.getCard(item.cardId),
    repo.getEntry(item.entryId),
  ])
  if (!card || !entry) return
  set({
    card,
    entry,
    session: {
      cardId: item.cardId,
      entryId: item.entryId,
      skillIdx: 0,
      results: {},
      startedAt: Date.now(),
    },
  })
}
