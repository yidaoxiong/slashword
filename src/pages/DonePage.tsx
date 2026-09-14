import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { nextMilestone } from '../core/reward'

export function DonePage() {
  const { checkin, streak, reward, queue, addMore } = useAppStore()
  const [adding, setAdding] = useState(false)

  const minutes = Math.max(1, Math.round((checkin?.durationSec ?? 0) / 60))

  const add = async (n: number, kind: 'new' | 'weak' = 'new') => {
    setAdding(true)
    await addMore(n, kind)
    setAdding(false)
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col sm:max-w-lg items-center px-5 py-16">
      <div className="pop flex h-20 w-20 items-center justify-center rounded-full bg-ok-soft">
        <div className="text-[34px] text-ok">✓</div>
      </div>

      <div className="mt-5 text-[22px] font-medium text-neutral-900">打卡成功</div>
      <div className="mt-1 text-[13px] text-neutral-500">
        今天全部训练环节都完成了
      </div>

      <div className="mt-8 w-full rounded-card bg-white p-5 shadow-sm ring-1 ring-black/5">
        <Row label="连续打卡" value={`${streak + 1} 天`} highlight />
        <Row label="今日新学" value={`${queue.filter((q) => q.isNew).length} 个`} />
        <Row label="今日复习" value={`${queue.filter((q) => !q.isNew).length} 个`} />
        <Row label="用时" value={`约 ${minutes} 分钟`} />
        <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
          <span className="text-[13px] text-neutral-500">今日奖金</span>
          <span className="flex items-baseline gap-1.5">
            {reward.today > 0 ? (
              <>
                <span className="pop text-[20px] font-semibold text-[#ff8f1f]">
                  +¥{reward.today}
                </span>
                <span className="text-[12px] text-neutral-400">
                  累计 ¥{reward.total}
                </span>
              </>
            ) : (
              <span className="text-[13px] text-neutral-400">
                再 {nextMilestone(reward.day).daysLeft} 天可得 ¥
                {nextMilestone(reward.day).amount}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="mt-6 w-full">
        <div className="text-center text-[12px] text-neutral-400">还想再加练？</div>
        <div className="mt-2 flex gap-2">
          {[5, 10, 20].map((n) => (
            <button
              key={n}
              type="button"
              disabled={adding}
              onClick={() => void add(n, 'new')}
              className="h-11 flex-1 rounded-xl bg-white text-[14px] text-neutral-700 shadow-sm ring-1 ring-black/5 active:bg-neutral-50 disabled:opacity-50"
            >
              +{n} 新词
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={adding}
          onClick={() => void add(10, 'weak')}
          className="mt-2 h-11 w-full rounded-xl bg-brand-50 text-[14px] text-brand-600 ring-1 ring-brand-200 active:bg-brand-100 disabled:opacity-50"
        >
          专攻薄弱词（10 个）
        </button>
      </div>

      <div className="mt-6 text-center text-[12px] leading-relaxed text-neutral-400">
        明天同一时间再来
        <br />
        连续天数断了就从头数，别断
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-100 py-3 last:border-0">
      <span className="text-[13px] text-neutral-500">{label}</span>
      <span
        className={`text-[15px] ${highlight ? 'font-medium text-brand-500' : 'text-neutral-800'}`}
      >
        {value}
      </span>
    </div>
  )
}
