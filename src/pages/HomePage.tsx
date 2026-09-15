import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { currentUnitLabel, unlockedCount, unitsOf } from '../core/queue'
import { LANG_LABEL, langOf } from '../core/lang'
import { visibleBooks } from '../core/books'

const STEP = 5

export function HomePage() {
  const {
    config,
    streak,
    reward,
    checkin,
    catalog,
    entries,
    startDay,
    switchBook,
    setConfig,
    addMore,
  } = useAppStore()
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState('')

  const activeBook = catalog.find((b) => b.id === config?.activeBook)
  const doneToday = checkin?.completed

  const add = async (n: number, kind: 'new' | 'weak') => {
    setAdding(true)
    setMsg('')
    const r = await addMore(n, kind)
    if (r.added === 0) setMsg(r.reason ?? '没能加上，稍后再试')
    setAdding(false)
  }

  const changeLimit = (delta: number) => {
    if (!config) return
    const next = Math.min(40, Math.max(5, config.dailyNewLimit + delta))
    void setConfig({ dailyNewLimit: next })
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col sm:max-w-lg px-5 py-8">
      <header className="flex items-end justify-between">
        <div>
          <div className="text-[22px] font-medium text-neutral-900">今天也要背单词</div>
          <div className="mt-1 text-[13px] text-neutral-500">
            {activeBook?.name ?? '选择一本词书'}
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-baseline justify-end gap-1">
            <span className="text-[26px] font-medium leading-none text-brand-500">
              {streak}
            </span>
            {/* 奖金比连续天数更抓眼球：目标感要看得见 */}
            <span className="pop rounded-md bg-[#ff8f1f] px-1.5 py-0.5 text-[15px] font-semibold leading-none text-white shadow-sm">
              ¥{reward.total}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-neutral-400">
            连续天数 · 奖金
            {reward.today > 0 && (
              <span className="ml-1 text-[#ff8f1f]">今日 +¥{reward.today}</span>
            )}
          </div>
        </div>
      </header>

      <div className="mt-6">
        <div className="text-[13px] font-medium text-neutral-800">今天学哪本</div>
        <div className="mt-2 space-y-2">
          {visibleBooks(catalog, config?.hiddenBooks).map((book) => {
            const active = book.id === config?.activeBook
            return (
              <button
                key={book.id}
                type="button"
                onClick={() => void switchBook(book.id)}
                className={`flex w-full items-center justify-between rounded-card px-4 py-3 text-left ring-1 transition ${
                  active
                    ? 'bg-brand-50 ring-brand-400'
                    : 'bg-white ring-black/5'
                }`}
              >
                <div>
                  <div className="text-[15px] font-medium text-neutral-900">
                    {book.name}
                  </div>
                  <div className="mt-0.5 text-[11px] text-neutral-400">
                    {LANG_LABEL[langOf(book.lang)]} · {book.unitCount} 个单元 ·{' '}
                    {book.source}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] tabular-nums text-neutral-500">
                    {book.wordCount} 词
                  </span>
                  {active && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[12px] text-white">
                      ✓
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-5 rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-neutral-800">今天学几个新词</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => changeLimit(-STEP)}
              className="h-8 w-8 rounded-lg bg-neutral-100 text-[16px] text-neutral-600 active:bg-neutral-200"
            >
              −
            </button>
            <span className="w-8 text-center text-[18px] font-medium tabular-nums text-neutral-900">
              {config?.dailyNewLimit ?? 0}
            </span>
            <button
              type="button"
              onClick={() => changeLimit(STEP)}
              className="h-8 w-8 rounded-lg bg-neutral-100 text-[16px] text-neutral-600 active:bg-neutral-200"
            >
              +
            </button>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-neutral-400">
          学到一半想加量也可以，做完之后有"再来几个"
        </div>
      </div>

      {doneToday ? (
        <div className="mt-6">
          <div className="rounded-card bg-ok-soft px-5 py-5 text-center">
            <div className="text-[16px] font-medium text-[#0f6e56]">今天已经打卡完成</div>
            <div className="mt-1 text-[13px] text-[#0f6e56]/70">还想加练的话，在下面选</div>
          </div>
          <div className="mt-3 flex gap-2">
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
          {msg && (
            <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-[12px] text-[#854f0b]">
              {msg}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void startDay()}
          className="mt-6 h-14 rounded-card bg-brand-500 text-[16px] font-medium text-white shadow-sm active:bg-brand-600"
        >
          {checkin ? '继续今天的学习' : '开始今天的学习'}
        </button>
      )}

      {config && (
        <div className="mt-4 rounded-card bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex justify-between text-[12px] text-neutral-500">
            <span>学习进度</span>
            <span className="text-neutral-400">
              学到 {currentUnitLabel(entries, config)}（第 {unlockedCount(config)}/
              {Math.max(1, unitsOf(entries).length)} 个单元）
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{
                width: `${Math.min(
                  100,
                  (unlockedCount(config) / Math.max(1, unitsOf(entries).length)) * 100,
                )}%`,
              }}
            />
          </div>
          <div className="mt-3 text-[12px] text-neutral-400">
            当前词书 {entries.length} 条，按单元顺序推进
          </div>
        </div>
      )}

      <div className="mt-auto pt-8 text-center text-[11px] text-neutral-300">
        每天完成全部训练环节才算打卡成功
      </div>
    </div>
  )
}
