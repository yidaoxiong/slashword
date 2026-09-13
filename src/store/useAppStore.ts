import { create } from 'zustand'
import type {
  Card,
  CheckinRecord,
  EngineConfig,
  QueueItem,
  Skill,
  WordEntry,
} from '../types'
import { getRepo } from '../storage'
import { buildDailyQueue, defaultConfig, todayKey } from '../core/queue'
import { loadCatalog, type BookInfo } from '../core/books'
import {
  SCHEDULER_VERSION,
  applySkillResult,
  finalizeReview,
} from '../core/scheduler'

const repo = getRepo()
const LOCAL_USER = 'local'

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
  /** 可选词书目录 */
  catalog: BookInfo[]

  init: () => Promise<void>
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
 * 每次启动都重新导入词库。
 * 词表会改（比如这次清洗掉了括号注释），只判断"本地有没有"的话，
 * 老数据会一直卡在浏览器里不更新。396 条重写只要几十毫秒，不值得为此做版本号。
 */
async function loadBook(bookId: string) {
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

  async init() {
    try {
      if (get().catalog.length === 0) {
        const catalog = await loadCatalog()
        set({ catalog })
      }
      let config = await repo.getConfig(LOCAL_USER)
      if (!config) {
        config = defaultConfig(LOCAL_USER)
        await repo.putConfig(config)
      } else if (config.accent === undefined) {
        // 老配置没有新增字段，用默认值补齐（以后加字段也走这条路）
        config = { ...defaultConfig(config.userId), ...config }
        await repo.putConfig(config)
      }
      await loadBook(config.activeBook)
      const checkin = await repo.getCheckin(LOCAL_USER, todayKey())
      const streak = await computeStreak(LOCAL_USER)
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

    let checkin = await repo.getCheckin(LOCAL_USER, todayKey(now))
    if (!checkin) {
      checkin = {
        userId: LOCAL_USER,
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
      userId: LOCAL_USER,
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
      userId: LOCAL_USER,
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
        }
        await repo.putCheckin(done)
        set({ checkin: done })
      }
      set({
        phase: 'done',
        card: finalized.card,
        streak: await computeStreak(LOCAL_USER),
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
    const next = { ...cur, ...patch }
    await repo.putConfig(next)
    set({ config: next })
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
