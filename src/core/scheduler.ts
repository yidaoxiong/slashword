import { FSRS, Card as FsrsCard, Rating, State } from 'fsrs.js'
import type { Card, Mastery, Skill } from '../types'
import { SKILLS } from '../types'

/**
 * 复习调度器
 *
 * 两个关键点：
 * 1. 算法本身用 FSRS —— 学术界成果，别自己造遗忘曲线。封装在这里是为了
 *    将来换实现（比如升级到新版 FSRS 或换 fsrs-rs）时只改这一个文件。
 * 2. 一个单词一天只做一次 FSRS 调度更新。发音/拼写/例句/释义四个环节
 *    各自更新掌握度，全部完成后才综合成一次评分交给 FSRS。
 *    否则一个词一天会被反复排程，复习节奏就乱了。
 */

export const SCHEDULER_VERSION = 'fsrs.js@1.2.2'

const fsrs = new FSRS()

/** 掌握度平滑系数。孩子的状态波动比成人大，响应要快一点 */
const MASTERY_ALPHA = 0.35

export function emptyMastery(): Mastery {
  return { pron: 0, spell: 0, example: 0, definition: 0 }
}

export function createCard(params: {
  userId: string
  wordKey: string
  display: string
  entryIds: string[]
  book: string
  unit: string
  unitOrder: number
  lesson: string
  lessonOrder: number
  now: number
}): Card {
  return {
    id: `${params.userId}:${params.wordKey}`,
    userId: params.userId,
    wordKey: params.wordKey,
    display: params.display,
    entryIds: params.entryIds,
    book: params.book,
    unit: params.unit,
    unitOrder: params.unitOrder,
    lesson: params.lesson,
    lessonOrder: params.lessonOrder,
    state: State.New,
    due: params.now,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    mastery: emptyMastery(),
    createdAt: params.now,
    lastReviewAt: null,
    updatedAt: params.now,
  }
}

function toFsrsCard(card: Card): FsrsCard {
  const c = new FsrsCard()
  c.due = new Date(card.due)
  c.stability = card.stability
  c.difficulty = card.difficulty
  c.elapsed_days = card.elapsedDays
  c.scheduled_days = card.scheduledDays
  c.reps = card.reps
  c.lapses = card.lapses
  c.state = card.state as State
  c.last_review = card.lastReviewAt ? new Date(card.lastReviewAt) : new Date(card.createdAt)
  return c
}

/**
 * 更新单个技能维度的掌握度。训练过程中实时调用，不触发调度。
 *
 * partial：答题前听过发音提示。拼对了但借助了提示，只能算"半掌握"，
 * 掌握度封顶在 65 而不是 100 —— 否则孩子可以全程靠听提示蒙对。
 */
export function applySkillResult(
  card: Card,
  skill: Skill,
  correct: boolean,
  partial = false,
): Card {
  const target = correct ? (partial ? 65 : 100) : 0
  const current = card.mastery[skill]
  const next = current + (target - current) * MASTERY_ALPHA
  return {
    ...card,
    mastery: { ...card.mastery, [skill]: Math.round(next * 10) / 10 },
    updatedAt: Date.now(),
  }
}

/**
 * 由四维掌握度推导 FSRS 评分。
 * 取短板而不仅是平均分 —— 拼写很好但例句全不会的词，不能算"掌握了"。
 */
export function masteryToRating(mastery: Mastery, enabled: Skill[]): Rating {
  const vals = enabled.map((s) => mastery[s])
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  const min = Math.min(...vals)
  if (min < 30) return Rating.Again
  if (avg >= 85 && min >= 70) return Rating.Easy
  if (avg >= 60) return Rating.Good
  if (avg >= 40) return Rating.Hard
  return Rating.Again
}

/** 一个词的全部训练环节完成后调用：综合评分 → FSRS 排下次复习时间 */
export function finalizeReview(
  card: Card,
  enabled: Skill[],
  now: number,
): { card: Card; rating: Rating; scheduledDays: number; due: number } {
  const rating = masteryToRating(card.mastery, enabled)
  const at = new Date(now)
  const result = fsrs.repeat(toFsrsCard(card), at)
  const next = result[rating].card
  return {
    card: {
      ...card,
      state: next.state as number,
      due: next.due.getTime(),
      stability: next.stability,
      difficulty: next.difficulty,
      elapsedDays: next.elapsed_days,
      scheduledDays: next.scheduled_days,
      reps: next.reps,
      lapses: next.lapses,
      lastReviewAt: now,
      updatedAt: now,
    },
    rating,
    scheduledDays: next.scheduled_days,
    due: next.due.getTime(),
  }
}

/** 预览四种评分各自对应的下次间隔，用于做"再想想 / 记住了"这类按钮的提示 */
export function previewIntervals(card: Card, now: number): Record<number, number> {
  const result = fsrs.repeat(toFsrsCard(card), new Date(now))
  const out: Record<number, number> = {}
  for (const r of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
    out[r] = result[r].card.scheduled_days
  }
  return out
}

/** 判断掌握度是否已达"真正记住"的四维门槛 */
export function isMastered(card: Card, threshold: number, enabled: Skill[] = SKILLS): boolean {
  return enabled.every((s) => card.mastery[s] >= threshold)
}

export { Rating, State }
