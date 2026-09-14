import type { CheckinRecord } from '../types'
import { todayKey } from './queue'

/**
 * 连续打卡奖金。
 *
 * 规则（Ray 定的）：
 *   - 连续第 5 天起，每天 1 元
 *   - 每到 5 的倍数那天，除 1 元外再额外加：第 1 个 5 天 +3、第 2 个 +6 …… 第 n 个 +3n
 *     也就是第 5 天 4 元、第 10 天 7 元、第 15 天 10 元
 *   - 第 50 天额外 +10，第 100 天额外 +50
 *
 * 断签不清零：已经赚到的不收回。每个连续段各自从 1 开始算，
 * 所以断了再连到 5 天，那 4 元会再发一次 —— 这是有意的设计，
 * 每次重新起步都有盼头，不然断一次就彻底没动力了。
 */

/** 连续第 day 天当天能拿多少 */
export function dailyReward(day: number): number {
  if (day < 5) return 0
  let r = 1
  // 只有正好踩在 5 的倍数那天才有额外档位
  if (day % 5 === 0) r += (day / 5) * 3
  if (day === 50) r += 10
  if (day === 100) r += 50
  return r
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nextDay(d: string): string {
  const [y, m, dd] = d.split('-').map(Number)
  const t = new Date(y, m - 1, dd)
  t.setDate(t.getDate() + 1)
  return fmt(t)
}

export interface RewardSummary {
  /** 累计总额（所有连续段加起来） */
  total: number
  /** 今天这一笔 */
  today: number
  /** 每个日期当天发了多少，用来回填历史记录 */
  perDay: Map<string, number>
  /** 今天处在连续第几天（未打卡也可能是昨天延续下来的第 N 天） */
  day: number
}

/**
 * 按打卡记录算奖金。
 *
 * 纯函数、幂等 —— 不管历史记录里有没有存 rewardYuan，算出来的都一样。
 * 这样规则将来调整时，改这一个函数就能整体重算，不用洗数据。
 */
export function computeRewards(records: CheckinRecord[]): RewardSummary {
  const dates = [
    ...new Set(records.filter((r) => r.completed).map((r) => r.date)),
  ].sort()

  const perDay = new Map<string, number>()
  let total = 0
  let day = 0
  let prev: string | null = null

  for (const d of dates) {
    // 接着上一天才算连续，否则重新从 1 起
    day = prev !== null && nextDay(prev) === d ? day + 1 : 1
    const r = dailyReward(day)
    perDay.set(d, r)
    total += r
    prev = d
  }

  const today = todayKey()
  const last = dates[dates.length - 1]
  // 今天还没打卡时，看看昨天是不是连着的，好显示"再打卡就是第 N 天"
  const currentDay =
    last === today
      ? day
      : last !== undefined && nextDay(last) === today
        ? day + 1
        : 1

  return {
    total,
    today: perDay.get(today) ?? 0,
    perDay,
    day: currentDay,
  }
}

/** 下一个档位还差几天、能拿多少 —— 用来在首页给个盼头 */
export function nextMilestone(day: number): { daysLeft: number; amount: number } {
  const next = day < 5 ? 5 : Math.ceil((day + 1) / 5) * 5
  return { daysLeft: next - day, amount: dailyReward(next) }
}
