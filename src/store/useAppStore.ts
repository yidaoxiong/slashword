import { create } from 'zustand'
import type {
  Card,
  CheckinRecord,
  EngineConfig,
  QueueItem,
  SessionProgress,
  Skill,
  UserBook,
  WordDraft,
  WordEntry,
} from '../types'
import { getRepo } from '../storage'
import {
  autoUnlock,
  buildDailyQueue,
  defaultConfig,
  normalizeSkills,
  resolveEntry,
  todayKey,
  wordKeyOf,
} from '../core/queue'
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
import { computeRewards, dailyReward, type RewardSummary } from '../core/reward'
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
  /** 奖金：累计总额 / 今天这一笔 / 当前连续第几天 */
  reward: RewardSummary
  /** 上一次删掉的词条快照，供「撤销」用 */
  lastRemovedWords: { bookId: string; words: WordEntry[]; at: number } | null
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
  /** 从自制词库里删掉若干词条（连带清理已学卡片、单元进度） */
  removeWordsFromBook: (bookId: string, wordIds: string[]) => Promise<void>
  /** 撤回上一次删除，把整本词库恢复成删之前的样子 */
  undoRemoveWords: () => Promise<void>
  /**
   * 改自制词库里的一个词条。
   * 单词 / 中文改了会连带把已学卡片的 wordKey 也改掉 ——
   * 不然改完这个词就对不上卡片，从此再也不会出现在复习里。
   */
  updateWordInBook: (
    bookId: string,
    entryId: string,
    draft: WordDraft,
  ) => Promise<void>
  /** 往自制词库里加一个词条 */
  addWordToBook: (bookId: string, draft: WordDraft) => Promise<void>
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
    /** 上一关已经证明会了，这一关按回车跳过。按半掌握记，不给满分 */
    skipped?: boolean,
  ) => Promise<void>
  skipItem: () => void
  reset: () => Promise<void>
  setConfig: (patch: Partial<EngineConfig>) => Promise<void>
  /** 切换词书（今天学厚海还是五年级） */
  switchBook: (bookId: string) => Promise<void>
  /**
   * 临时加量：今天想多背几个，不用改每天的默认设置。
   * 返回实际加了几个；一个都没加上时 reason 说明为什么 ——
   * 静默返回 0 的话，用户点了按钮只会觉得 app 坏了。
   */
  addMore: (
    count: number,
    kind?: 'new' | 'weak',
  ) => Promise<{ added: number; reason?: string }>
}

export type AddMoreResult = { added: number; reason?: string }

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
  reward: { total: 0, today: 0, perDay: new Map(), day: 0 },
  lastRemovedWords: null,
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
          // 顺序必须重排：老配置里存的是旧顺序，spread 会原样带过来
          enabledSkills: normalizeSkills(config.enabledSkills),
          updatedAt: config.updatedAt ?? Date.now(),
        }
        await repo.putConfig(config)
      }
      await loadBook(config.activeBook, isCustomBook(get().catalog, config.activeBook))
      const checkin = await repo.getCheckin(userId, todayKey())
      const streak = await computeStreak(userId)
      // 奖金按打卡记录整体算，历史记录自动回填 —— 不用洗数据
      const reward = computeRewards(await repo.listCheckins(userId))
      const entries = await repo.listEntries(config.activeBook)
      // 顺手把该解锁的单元开了：不然首页进度条会一直停在旧的单元数上
      const unlocked = await applyAutoUnlock(config, entries)
      set({
        phase: 'idle',
        config: unlocked,
        checkin: checkin ?? null,
        streak,
        reward,
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
    // 先解锁：上一个单元学完了不推进，今天就会 0 个新词直接跳到"已完成"
    const cfg = await applyAutoUnlock(config, get().entries)
    const queue = await buildDailyQueue(repo, cfg, now)

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
        // 整场打卡的起点。session.startedAt 只记"当前这一个词"，每个词都会
        // 重置，不能拿来算总用时
        sessionStartedAt: now,
        updatedAt: now,
      }
      await repo.putCheckin(checkin)
    }

    // 上次没打完就换设备 / 关了页面 —— 从存下来的进度接着学，
    // 已经做完的那些不用再来一遍
    const saved = checkin.progress
    if (saved && !checkin.completed && saved.queue.length > 0) {
      if (await resumeProgress(saved, set)) return
      // 恢复失败（词库换过、卡片没了）就当新的一天重来，不留死局
    }

    if (queue.length === 0) {
      // 今天确实没词可学（整本学完 / 复习都排到以后）—— 直接算完成，
      // 别把孩子扔在空荡荡的首页上干瞪眼
      set({
        phase: 'done',
        queue,
        idx: 0,
        checkin: { ...checkin, completed: true, completedAt: now },
        card: null,
        entry: null,
      })
      await repo.putCheckin({ ...checkin, completed: true, completedAt: now })
      return
    }
    const ok = await loadItem(0, queue, set)
    if (!ok) {
      set({ phase: 'idle', error: '词卡数据没准备好，请重新打开页面' })
      return
    }
    set({ phase: 'learning', queue, idx: 0, checkin })
    await saveProgress(queue, 0, {
      cardId: queue[0].cardId,
      entryId: queue[0].entryId,
      skillIdx: 0,
      results: {},
      startedAt: now,
    }, set)
  },

  async submitSkill(skill, correct, input, usedHint = false, skipped = false) {
    const state = get()
    const { card, session, config, queue, idx } = state
    if (!card || !session || !config) return

    const now = Date.now()
    const results = { ...session.results, [skill]: correct }
    // 用过"先听一遍"的、以及上一关拼对了直接回车跳过的，都只算半掌握：
    // 这个环节本身没有新的证据，不该给满分
    const updated = applySkillResult(card, skill, correct, usedHint || skipped)
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
      const nextSession = { ...session, skillIdx: nextIdx, results }
      set({ card: updated, session: nextSession })
      await saveProgress(queue, idx, nextSession, set)
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
        // 今天的奖金：连到第几天就拿多少（规则见 core/reward.ts）
        const allCheckins = await repo.listCheckins(getUserId())
        const rewardYuan = dailyReward(computeRewards(allCheckins).day)
        const done: CheckinRecord = {
          ...rec,
          completed: true,
          completedAt: now,
          /**
           * 用时 = 之前几轮的累计 + 本轮。
           *
           * 一天可能学好几轮（打完卡又"再来几个"），每轮起点由 addMore 重置，
           * 这里把各轮加起来才是今天真实的总投入。
           * 退回 session.startedAt 是给老记录兜底（那时还没这个字段）。
           */
          durationSec:
            (rec.durationSec ?? 0) +
            Math.round((now - (rec.sessionStartedAt ?? session.startedAt)) / 1000),
          rewardYuan,
          // 打完了就不用再存进度了，留着反而让别的设备以为还要接着学
          progress: undefined,
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
      // 打卡刚落地，奖金和连续天数一起重算，右上角立刻跳
      const records = await repo.listCheckins(getUserId())
      set({
        phase: 'done',
        card: finalized.card,
        streak: await computeStreak(getUserId()),
        reward: computeRewards(records),
      })
      return
    }

    set({ idx: nextItemIdx, card: finalized.card })
    await loadItem(nextItemIdx, queue, set)
    const moved = get().session
    if (moved) await saveProgress(queue, nextItemIdx, moved, set)
  },

  skipItem() {
    const { idx, queue } = get()
    const next = idx + 1
    if (next >= queue.length) {
      set({ phase: 'done' })
      return
    }
    set({ idx: next })
    void loadItem(next, queue, set).then((ok) => {
      if (!ok) return
      const moved = get().session
      if (moved) void saveProgress(queue, next, moved, set)
    })
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

  /**
   * 从自制词库里删掉若干词条。
   *
   * 难的不是删词条，是删完要收的尾巴：
   *   1. 已经背过的卡片要处理 —— 不清理的话明天复习还会冒出这个词，
   *      而它已经不在词库里了，变成"幽灵词"
   *   2. 解锁到第几单元的记录可能超出新的单元数，要 clamp
   *   3. updatedAt 必须刷新，否则别的设备同步不到这次修改
   */
  async removeWordsFromBook(bookId, wordIds) {
    const book = await repo.getUserBook(bookId)
    if (!book || wordIds.length === 0) return
    const drop = new Set(wordIds)
    const nextWords = book.words.filter((w) => !drop.has(w.id))
    if (nextWords.length === book.words.length) return

    const userId = getUserId()
    const now = Date.now()

    // 受影响的卡片：引用了被删词条的都算
    const cards = await repo.listCards(userId)
    const affected = cards.filter(
      (c) => c.book === bookId && c.entryIds.some((id) => drop.has(id)),
    )
    const orphan: string[] = []
    const keep: Card[] = []
    for (const c of affected) {
      const rest = c.entryIds.filter((id) => !drop.has(id))
      if (rest.length === 0) orphan.push(c.id)
      else keep.push({ ...c, entryIds: rest })
    }

    const nextUnits = [
      ...new Set(nextWords.map((w) => w.unit).filter(Boolean)),
    ].sort()
    await repo.putUserBook({
      ...book,
      words: nextWords,
      units: nextUnits,
      wordCount: nextWords.length,
      updatedAt: now,
    })
    await repo.deleteEntries([...drop])
    await repo.deleteCards(orphan)
    if (keep.length > 0) await repo.bulkPutCards(keep)

    // 解锁进度可能已经超出新的单元数
    const { config } = get()
    if (config) {
      const cur = config.unitProgress[bookId] ?? 1
      const max = Math.max(1, nextUnits.length)
      if (cur > max) {
        await get().setConfig({
          unitProgress: { ...config.unitProgress, [bookId]: max },
        })
      }
    }

    await get().refreshCatalog()
    if (get().config?.activeBook === bookId) {
      const entries = await repo.listEntries(bookId)
      set({ entries, totalWords: entries.length })
    }

    // 留一份快照，删错了能一键撤回
    set({
      lastRemovedWords: { bookId, words: book.words, at: now },
    })
  },

  async updateWordInBook(bookId, entryId, draft) {
    const book = await repo.getUserBook(bookId)
    if (!book) return
    const idx = book.words.findIndex((w) => w.id === entryId)
    if (idx < 0) return
    const from = book.words[idx]
    const to = applyDraft(from.id, from, draft, book.words)
    const words = [...book.words]
    words[idx] = to
    await commitWords(bookId, words, [{ from, to }])
  },

  async addWordToBook(bookId, draft) {
    const book = await repo.getUserBook(bookId)
    if (!book) return
    // 新词条的固定字段照着同本词库抄，语言 / 年级 / 来源不会跑偏
    const seed = book.words[book.words.length - 1] ?? book.words[0]
    const template: WordEntry = {
      id: '',
      word: '',
      cn: '',
      note: '',
      phoneticUk: '',
      phoneticUs: '',
      lang: seed?.lang ?? book.lang,
      pos: '',
      exampleEn: '',
      exampleCn: '',
      book: bookId,
      grade: seed?.grade ?? book.grade,
      source: seed?.source ?? book.source,
      unit: '',
      unitOrder: seed?.unitOrder ?? 1,
      unitTitle: seed?.unitTitle ?? '',
      lesson: '',
      lessonOrder: seed?.lessonOrder ?? 0,
      lessonTitle: seed?.lessonTitle ?? '',
      category: '',
      phonics: [],
      definitionEn: '',
    }
    const entry = applyDraft(newEntryId(bookId, book.words), template, draft, book.words)
    await commitWords(bookId, [...book.words, entry], [])
  },

  async undoRemoveWords() {
    const snap = get().lastRemovedWords
    if (!snap) return
    const book = await repo.getUserBook(snap.bookId)
    if (!book) return
    const now = Date.now()
    const nextUnits = [
      ...new Set(snap.words.map((w) => w.unit).filter(Boolean)),
    ].sort()
    await repo.putUserBook({
      ...book,
      words: snap.words,
      units: nextUnits,
      wordCount: snap.words.length,
      updatedAt: now,
    })
    await repo.importEntries(snap.bookId, snap.words)
    await get().refreshCatalog()
    if (get().config?.activeBook === snap.bookId) {
      const entries = await repo.listEntries(snap.bookId)
      set({ entries, totalWords: entries.length })
    }
    set({ lastRemovedWords: null })
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
    const { config: config0, queue, phase, checkin } = get()
    if (!config0) return { added: 0, reason: '还没有选词书' }

    const userId = getUserId()
    // 先解锁：学完一个单元后不解锁的话，新词会永远是 0，加练点了没反应
    const config = await applyAutoUnlock(config0, get().entries)

    const have = new Set(queue.map((q) => q.cardId))
    let added: QueueItem[] = []

    if (kind === 'new') {
      // 只取新词，不重复拉已经在队列里的
      const temp: EngineConfig = {
        ...config,
        dailyNewLimit: count,
        dailyReviewLimit: 0,
      }
      // 加练是孩子自己点的"再来几个"，不受每天 50 个的首日上限约束，
      // 这里把总量上限放开，只让 dailyNewLimit=count 起作用
      added = (
        await buildDailyQueue(repo, temp, Date.now(), Number.MAX_SAFE_INTEGER)
      ).filter((q) => !have.has(q.cardId))
    } else {
      // 专攻薄弱词：按掌握度从低到高挑。
      // 不再排除"今天已经练过的" —— 刚学完的孩子，他全部的卡就是今天这几张，
      // 排除掉就一个都不剩，按钮点了没反应。今天练过的排后面，优先给没练过的
      const skills = config.enabledSkills
      const avgOf = (c: Card) =>
        skills.reduce((a, s) => a + c.mastery[s], 0) / skills.length
      // 词条必须按 wordKey 反查当前词表，不能拿卡片里存的 entryIds[0] ——
      // 那是位置编号，词表一清洗就指向别的词 / 空号，loadItem 直接装不上
      const entries = get().entries
      const practiced = (await repo.listCards(userId))
        .filter((c) => c.reps > 0 && c.book === config.activeBook)
        .sort((a, b) => {
          const pa = have.has(a.id) ? 1 : 0
          const pb = have.has(b.id) ? 1 : 0
          return pa - pb || avgOf(a) - avgOf(b)
        })
      const resolved: QueueItem[] = []
      for (const c of practiced) {
        if (resolved.length >= count) break
        const e = resolveEntry(entries, c)
        if (!e) continue
        // 顺手把过期的位置编号修回去，以后不用每次反查
        if (c.entryIds[0] !== e.id) {
          await repo.putCard({
            ...c,
            entryIds: [e.id],
            unit: e.unit,
            unitOrder: e.unitOrder,
            lesson: e.lesson,
            lessonOrder: e.lessonOrder,
            updatedAt: Date.now(),
          })
        }
        resolved.push({ cardId: c.id, entryId: e.id, word: c.display, isNew: false })
      }
      added = resolved
      if (added.length === 0) {
        return {
          added: 0,
          reason:
            practiced.length === 0
              ? '这本词书还没练过词，先学几天再来做薄弱专攻'
              : '薄弱词都没能和词表对上，先去学几个新词再回来',
        }
      }
    }

    // 必须给个说法：以前直接 return 0，用户点了按钮什么反应都没有，
    // 只会觉得是 app 坏了。（薄弱词的"加不上"在上面已经单独说过了）
    if (added.length === 0) {
      return { added: 0, reason: '这本词库已经学完了，没有更多新词' }
    }

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
            // 新一轮重新计时。不重置的话，加练的用时会从"早上第一次开始"
            // 一直算到现在，把中间隔着的几个小时也算进去
            sessionStartedAt: Date.now(),
          }
        : null
      if (reopened) await repo.putCheckin(reopened)
      const startIdx = phase === 'idle' ? 0 : queue.length
      // 先装数据再切页面：装不上就停在原地说明原因，
      // 不能切到 learning 让 LearnPage 渲染成空白
      const ok = await loadItem(startIdx, nextQueue, set)
      if (!ok) return { added: 0, reason: '这几张卡没准备好，回首页重新开始试试' }
      set({
        queue: nextQueue,
        phase: 'learning',
        idx: startIdx,
        checkin: reopened,
      })
      const s = get().session
      if (s) await saveProgress(nextQueue, startIdx, s, set)
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
      // 队列变长了，进度里存的也得跟着换，不然别的设备拿到的是旧队列
      const s = get().session
      if (s) await saveProgress(nextQueue, get().idx, s, set)
    }
    return { added: added.length }
  },
}))

/**
 * 跑一遍自动解锁，有变化就写回配置。
 * startDay 和 addMore 都要调 —— 只在一处做的话，另一处照样没新词。
 */
async function applyAutoUnlock(
  config: EngineConfig,
  entries: WordEntry[],
): Promise<EngineConfig> {
  const next = await autoUnlock(repo, config, entries)
  if (next !== config) {
    await repo.putConfig(next)
    useAppStore.setState({ config: next })
  }
  return next
}

/**
 * 装载第 index 个任务。返回是否成功。
 *
 * 必须让调用方知道结果：以前这里静默 return，上层照切 phase='learning'，
 * 于是 LearnPage 拿不到 entry 直接渲染成 null —— 用户看到的就是
 * 只剩顶部那条登录条的空白页，还以为点了按钮跳到登录去了。
 */
/** 新词条 id：不能跟已有的撞上，用时间戳 + 随机，和导入时的四位编号区分开 */
function newEntryId(bookId: string, words: WordEntry[]): string {
  const taken = new Set(words.map((w) => w.id))
  for (;;) {
    const id = `${bookId}-x${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 5)}`
    if (!taken.has(id)) return id
  }
}

function firstNum(s: string, fallback: number): number {
  const m = s.match(/\d+/)
  return m ? Number(m[0]) : fallback
}

/**
 * 把表单内容写进词条。
 *
 * 单元 / 课文的序号要跟着当前词库重算，不然会出怪事：
 * 填一个全新的单元名，如果只是留空序号，这个词会排到第一单元前面去。
 * 规则：填的是已有单元 → 用那个单元的序号；是新单元名 → 排到最后。
 */
function applyDraft(
  id: string,
  base: WordEntry,
  draft: WordDraft,
  allWords: WordEntry[],
): WordEntry {
  const unit = (draft.unit ?? '').trim()
  const lesson = (draft.lesson ?? '').trim()

  let unitOrder = base.unitOrder || 1
  if (unit !== base.unit) {
    if (!unit) {
      unitOrder = base.unitOrder || 1
    } else {
      const same = allWords.find((w) => w.unit === unit && w.unitOrder < 999)
      unitOrder = same
        ? same.unitOrder
        : Math.max(0, ...allWords.map((w) => (w.unitOrder < 999 ? w.unitOrder : 0))) + 1
    }
  }

  // 音标只留了一格：动过就英式美式一起写，没动就原样保留
  // （导入进来的词库可能两套都有，不能被编辑界面悄悄抹掉一套）
  const shown = base.phoneticUk || base.phoneticUs
  const typed = (draft.phonetic ?? '').trim()
  const phoneticUk = typed === shown ? base.phoneticUk : typed
  const phoneticUs = typed === shown ? base.phoneticUs : typed

  return {
    ...base,
    id,
    word: (draft.word ?? '').trim(),
    cn: (draft.cn ?? '').trim(),
    phoneticUk,
    phoneticUs,
    pos: (draft.pos ?? '').trim(),
    exampleEn: (draft.exampleEn ?? '').trim(),
    exampleCn: (draft.exampleCn ?? '').trim(),
    unit,
    unitOrder,
    lesson,
    lessonOrder: lesson ? firstNum(lesson, 999) : base.lessonOrder,
    category: (draft.category ?? '').trim(),
  }
}

/**
 * 把改好的整份词条写回词库，并收拾三个尾巴：
 *   1. 词条表要重灌 —— 学习时读的是这张表，不重灌读到的还是旧的
 *   2. 已学卡片的 wordKey 要跟着改 —— 卡片主键就是 userId:wordKey，
 *      改了词不改卡片，这个词从此再也不会出现在复习里
 *   3. 单元数变了要 clamp 解锁进度
 */
async function commitWords(
  bookId: string,
  words: WordEntry[],
  changed: { from: WordEntry; to: WordEntry }[],
) {
  const book = await repo.getUserBook(bookId)
  if (!book) return
  const now = Date.now()
  const units = [...new Set(words.map((w) => w.unit).filter(Boolean))].sort()

  await repo.putUserBook({
    ...book,
    words,
    units,
    wordCount: words.length,
    updatedAt: now,
  })
  await repo.importEntries(bookId, words)

  const userId = getUserId()
  for (const { from, to } of changed) {
    const card = await repo.getCardByWordKey(userId, wordKeyOf(from.word, from.cn))
    if (!card) continue
    const key = wordKeyOf(to.word, to.cn)
    const next: Card = {
      ...card,
      id: `${userId}:${key}`,
      wordKey: key,
      display: to.word,
      entryIds: [to.id],
      unit: to.unit,
      unitOrder: to.unitOrder,
      lesson: to.lesson,
      lessonOrder: to.lessonOrder,
      updatedAt: now,
    }
    if (next.id === card.id) {
      await repo.putCard(next)
    } else {
      // 主键换了只能删旧行插新行，调度状态（下次复习时间、掌握度）原样搬过去。
      // 复习日志里记的还是旧 wordKey —— 那是历史记录，不改写
      await repo.deleteCards([card.id])
      await repo.putCard(next)
    }
  }

  const { config } = useAppStore.getState()
  if (config) {
    const cur = config.unitProgress[bookId] ?? 1
    const max = Math.max(1, units.length)
    if (cur > max) {
      await useAppStore.getState().setConfig({
        unitProgress: { ...config.unitProgress, [bookId]: max },
      })
    }
  }

  await useAppStore.getState().refreshCatalog()
  if (useAppStore.getState().config?.activeBook === bookId) {
    const entries = await repo.listEntries(bookId)
    useAppStore.setState({ entries, totalWords: entries.length })
  }
}

/**
 * 把"今天学到哪了"写进打卡记录。
 *
 * 打卡记录本来就在同步范围内（按天一条），进度挂上去等于白捡了跨设备能力 ——
 * 不用新开一张表、不用改同步协议。换台设备读到它就能接着学。
 */
async function saveProgress(
  queue: QueueItem[],
  idx: number,
  session: SessionState,
  set: (partial: Partial<AppState>) => void,
) {
  const checkin = useAppStore.getState().checkin
  if (!checkin) return
  const next: CheckinRecord = {
    ...checkin,
    progress: {
      queue,
      idx,
      skillIdx: session.skillIdx,
      results: session.results,
      startedAt: session.startedAt,
    },
    updatedAt: Date.now(),
  }
  await repo.putCheckin(next)
  set({ checkin: next })
}

/**
 * 从存档的进度接着学。返回是否恢复成功。
 * 失败（词库换过、卡片被删）时调用方会退回"今天重新开始"。
 */
async function resumeProgress(
  saved: SessionProgress,
  set: (partial: Partial<AppState>) => void,
): Promise<boolean> {
  const idx = Math.min(Math.max(0, saved.idx), saved.queue.length - 1)
  if (!Number.isFinite(idx) || idx < 0) return false
  const ok = await loadItem(idx, saved.queue, set)
  if (!ok) return false

  // 环节的档位可能被家长改过（比如关掉了释义关），夹一下别越界
  const enabled = useAppStore.getState().config?.enabledSkills ?? []
  const skillIdx = Math.min(Math.max(0, saved.skillIdx), Math.max(0, enabled.length - 1))

  const item = saved.queue[idx]
  // loadItem 装的是一个"从第 0 关开始"的新 session，用存档覆盖回去
  set({
    phase: 'learning',
    queue: saved.queue,
    idx,
    session: {
      cardId: item.cardId,
      entryId: item.entryId,
      skillIdx,
      results: saved.results ?? {},
      startedAt: saved.startedAt,
    },
  })
  return true
}

async function loadItem(
  index: number,
  queue: QueueItem[],
  set: (partial: Partial<AppState>) => void,
): Promise<boolean> {
  const item = queue[index]
  if (!item) return false
  const [card, entry0] = await Promise.all([
    repo.getCard(item.cardId),
    repo.getEntry(item.entryId),
  ])
  if (!card) return false
  // 换设备 / 词库更新后，存下来的 entryId 可能已经对不上（词条 id 是位置编号）。
  // 不兜这一下的话界面会变成空白，和之前"只看到登录条"那次一模一样
  let entry = entry0
  if (!entry) {
    const entries = await repo.listEntries(card.book)
    entry = resolveEntry(entries, card)
    if (!entry) return false
    // 顺手把队列里这条改对，后面再用就不用重查
    queue[index] = { ...item, entryId: entry.id }
  }
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
  return true
}
